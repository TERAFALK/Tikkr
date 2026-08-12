import { unsafeGlobalPrisma } from "./db";
import { getLicenseState, setLicenseCount } from "./licenses";
import {
  getScreenPricing,
  priceId,
  stripe,
  yearlyAvailable,
  type BillingInterval,
  type ScreenPricing,
} from "./stripe";

/**
 * PRENUMERATIONEN.
 *
 * Priset sätts på artikeln hos Stripe och läses därifrån, se getScreenPricing
 * i stripe.ts. Det gäller per stämplingsskärm och månad. Antalet skärmar är
 * alltså kvantiteten på prenumerationen, och den måste hållas i takt med
 * verkligheten — annars fakturerar vi för skärmar som återkallats, eller
 * missar att ta betalt för nya.
 */

/**
 * Vad kunden betalar för: antalet licenser de valt.
 *
 * Inte antalet skapade skärmar. Kostnaden ska aldrig växa av sig själv för att
 * någon lagt upp en skärm till — kunden bestämmer antalet, och skapar sedan
 * skärmar inom det.
 */
export async function billedScreens(companyId: string): Promise<number> {
  const state = await getLicenseState(companyId);
  return state.total;
}

/**
 * Startar kassan där kunden fyller i sitt kort.
 *
 * Vi skapar aldrig prenumerationen själva. Stripe gör det när betalningen
 * gått igenom och berättar för oss via webhooken — det är den enda ordning
 * där vi inte riskerar att ha en prenumeration i vår databas som inte finns
 * hos dem, eller tvärtom.
 */
export async function createCheckoutSession(params: {
  companyId: string;
  companyName: string;
  email: string;
  baseUrl: string;
  interval: BillingInterval;
  screens: number;
}): Promise<string> {
  const screens = Math.max(1, Math.min(100, Math.floor(params.screens)));

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: { stripeCustomerId: true },
  });

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price: priceId(params.interval),
        quantity: screens,
        // Kunden kan justera antalet i kassan också. Den som ändrar sig i
        // sista stund ska inte behöva backa ut och börja om.
        adjustable_quantity: { enabled: true, minimum: 1, maximum: 100 },
      },
    ],

    // Finns kunden redan hos Stripe återanvänder vi den, så att en kund som
    // avslutat och kommer tillbaka inte blir två kunder med varsin historik.
    ...(company?.stripeCustomerId
      ? { customer: company.stripeCustomerId }
      : { customer_email: params.email }),

    // Följer med tillbaka i webhooken. Utan den vet vi inte vilket företag
    // betalningen gällde.
    client_reference_id: params.companyId,
    subscription_data: {
      metadata: { companyId: params.companyId },
    },
    metadata: { companyId: params.companyId },

    // Kunden kan ändra antalet skärmar i kassan. Att låsa det vore
    // förvirrande — de vet bäst hur många de behöver.
    allow_promotion_codes: true,

    success_url: `${params.baseUrl}/admin/installningar/prenumeration?klart=1`,
    cancel_url: `${params.baseUrl}/admin/installningar/prenumeration`,
  });

  if (!session.url) {
    throw new Error("Stripe returnerade ingen kassaadress.");
  }

  return session.url;
}

/**
 * Öppnar Stripes egen sida där kunden byter kort, ser fakturor och säger upp.
 *
 * Att bygga det själv hade betytt att vi hanterar kortuppgifter, kvitton och
 * uppsägningsflöden — allt sådant som Stripe redan gör och som vi bara skulle
 * göra sämre.
 */
export async function createPortalSession(params: {
  companyId: string;
  baseUrl: string;
}): Promise<string> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: { stripeCustomerId: true },
  });

  if (!company?.stripeCustomerId) {
    throw new Error("Företaget har ännu ingen prenumeration hos Stripe.");
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: `${params.baseUrl}/admin/installningar/prenumeration`,
  });

  return session.url;
}

/**
 * Öppnar Stripes sida där kunden ändrar antalet licenser.
 *
 * Antalet väljs och bekräftas i ett och samma steg hos Stripe, inte här. Skälet
 * är att beloppet ska räknas fram av den part som faktiskt debiterar, i samma
 * stund som antalet ändras — en siffra vi räknat ut i förväg är en gissning om
 * vad Stripe kommer att fakturera, och en gissning duger inte för något som
 * ändrar en faktura.
 *
 * Antalet skrivs in i vår databas först när Stripe bekräftar ändringen.
 * Avbryter kunden har ingenting hänt.
 *
 * Utan prenumeration går antalet inte att ändra. Under provperioden ingår ett
 * fast antal, och fler får man genom att börja betala.
 */
export async function openLicenseUpdate(params: {
  companyId: string;
  baseUrl: string;
}): Promise<string> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });

  if (!company?.stripeSubscriptionId || !company.stripeCustomerId) {
    throw new Error(
      "Antalet licenser kan ändras först när prenumerationen är aktiv."
    );
  }

  // Saknas en egen konfiguration används kontots standardportal. Den duger så
  // länge kvantitetsändring är påslagen där, och ett fel i vår konfiguration
  // ska inte vara skillnaden mellan att kunden kan köpa en skärm till eller
  // inte.
  const configuration = await licenseUpdateConfiguration();

  const session = await stripe().billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    ...(configuration && { configuration }),
    return_url: `${params.baseUrl}/admin/installningar/prenumeration`,

    flow_data: {
      type: "subscription_update",
      subscription_update: { subscription: company.stripeSubscriptionId },
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: `${params.baseUrl}/admin/installningar/prenumeration?uppdaterad=1`,
        },
      },
    },
  });

  return session.url;
}

/**
 * Portalkonfigurationen som tillåter ändrat antal.
 *
 * Stripes bekräftelsesida kräver att kundportalen har kvantitetsändring
 * påslagen. Vi skapar därför en egen konfiguration som bara gör den enda
 * saken, istället för att be någon klicka rätt i Stripes gränssnitt — då
 * fungerar det likadant i labbet som i skarp drift, utan manuella steg.
 *
 * Den vanliga kundportalen (kort, kvitton, uppsägning) rörs inte: den använder
 * fortfarande Stripes standardkonfiguration.
 */
const CONFIGURATION_MARKER = "tikkr-license-update";
let licenseConfigurationId: string | null = null;

async function licenseUpdateConfiguration(): Promise<string | null> {
  const fromEnv = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  if (fromEnv) return fromEnv;

  if (licenseConfigurationId) return licenseConfigurationId;

  try {
    // Letar upp en tidigare skapad först. Appen startas om vid varje deploy,
    // och en ny konfiguration per omstart skulle fylla Stripe-kontot med
    // dubbletter.
    const existing = await stripe().billingPortal.configurations.list({
      active: true,
      limit: 100,
    });

    const found = existing.data.find(
      (item) => item.metadata?.tikkr === CONFIGURATION_MARKER
    );

    if (found) {
      licenseConfigurationId = found.id;
      return found.id;
    }

    const created = await stripe().billingPortal.configurations.create({
      metadata: { tikkr: CONFIGURATION_MARKER },
      business_profile: { headline: "Antal stämplingsskärmar" },

      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["quantity"],

          // Samma avräkning som tidigare: en skärm som läggs till mitt i
          // perioden kostar resterande dagar, varken en hel period eller noll.
          proration_behavior: "create_prorations",
          products: await updatableProducts(),
        },

        // Allt annat stängs av. Konfigurationen används enbart för att ändra
        // antalet — kort, kvitton och uppsägning ligger kvar i den vanliga
        // portalen.
        invoice_history: { enabled: false },
        payment_method_update: { enabled: false },
        customer_update: { enabled: false },
        subscription_cancel: { enabled: false },
      },
    });

    licenseConfigurationId = created.id;
    return created.id;
  } catch (error) {
    // Vanligaste orsaken i skarpt läge: Stripe kräver att kundportalens
    // villkors- och integritetslänkar är ifyllda innan en konfiguration får
    // skapas. Vi ger inte upp för det — kontots standardportal används i
    // stället, och fungerar så länge kvantitetsändring är påslagen där.
    console.error(
      "Kunde inte skapa portalkonfiguration hos Stripe, använder kontots " +
        "standardkonfiguration i stället",
      error
    );

    return null;
  }
}

/** Artiklarna kunden får ändra antal på. Priserna kan ligga på samma produkt. */
async function updatableProducts() {
  const byProduct = new Map<string, string[]>();

  for (const id of [
    priceId("month"),
    ...(yearlyAvailable() ? [priceId("year")] : []),
  ]) {
    const price = await stripe().prices.retrieve(id);
    const product =
      typeof price.product === "string" ? price.product : price.product.id;

    byProduct.set(product, [...(byProduct.get(product) ?? []), id]);
  }

  return [...byProduct].map(([product, prices]) => ({ product, prices }));
}

export interface BillingOverview {
  /** Antal licenser, alltså vad kunden betalar för. */
  screens: number;
  /** Antal aktiva skärmar av dessa. */
  used: number;
  monthlyAmount: number;
  yearlyAmount: number | null;
  /** Vad kunden sparar på att betala ett år i förskott. */
  yearlySaving: number | null;
  hasSubscription: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  interval: BillingInterval | null;
  /** Priset per skärm, hämtat från artikeln hos betaltjänsten. */
  pricing: ScreenPricing;
}

/** Vad kunden ser på prenumerationssidan. */
export async function getBillingOverview(
  companyId: string
): Promise<BillingOverview> {
  const [licenses, pricing] = await Promise.all([
    getLicenseState(companyId),
    getScreenPricing(),
  ]);

  const screens = licenses.total;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true },
  });

  const amounts = (count: number) => ({
    monthlyAmount: count * pricing.month,
    yearlyAmount: pricing.year === null ? null : count * pricing.year,
    yearlySaving:
      pricing.year === null ? null : count * (pricing.month * 12 - pricing.year),
  });

  const overview: BillingOverview = {
    screens,
    used: licenses.used,
    ...amounts(screens),
    hasSubscription: Boolean(company?.stripeSubscriptionId),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    interval: null,
    pricing,
  };

  if (!company?.stripeSubscriptionId) return overview;

  try {
    const subscription = await stripe().subscriptions.retrieve(
      company.stripeSubscriptionId
    );

    // Slutdatumet för perioden ligger på olika ställen i olika versioner av
    // Stripes API: på prenumerationen i äldre, på raden i nyare. Vi läser
    // båda och tar det som finns, istället för att låsa oss vid en version
    // som ändras under fötterna på oss.
    const shape = subscription as unknown as {
      current_period_end?: number;
      items?: { data?: Array<{ current_period_end?: number }> };
    };

    const periodEnd =
      shape.current_period_end ?? shape.items?.data?.[0]?.current_period_end;

    overview.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
    overview.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    overview.interval =
      subscription.items.data[0]?.price?.recurring?.interval === "year"
        ? "year"
        : "month";

    // Stämmer av mot Stripe varje gång sidan visas. Normalt har webhooken
    // redan skrivit samma siffra, men den kan vara försenad eller ha missats
    // — och då ska kunden som just godkänt en ändring ändå se rätt antal när
    // de kommer tillbaka hit, utan att behöva höra av sig.
    const quantity = subscription.items.data[0]?.quantity;

    if (quantity && quantity !== screens) {
      await setLicenseCount(companyId, quantity);

      overview.screens = quantity;
      Object.assign(overview, amounts(quantity));
    }
  } catch (error) {
    // Sidan ska gå att öppna även när Stripe inte svarar.
    console.error("Kunde inte hämta prenumerationen från Stripe", error);
  }

  return overview;
}
