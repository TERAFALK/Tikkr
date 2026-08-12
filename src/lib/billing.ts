import { unsafeGlobalPrisma } from "./db";
import {
  assertLicenseCountAllowed,
  getLicenseState,
  setLicenseCount,
} from "./licenses";
import {
  priceId,
  stripe,
  yearlyAvailable,
  PRICE_PER_SCREEN,
  type BillingInterval,
} from "./stripe";

/**
 * PRENUMERATIONEN.
 *
 * Priset är 399 kr per aktiv stämplingsskärm och månad. Antalet skärmar är
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
 * Påbörjar en ändring av antalet licenser.
 *
 * Ändringen görs inte här. Kunden skickas till Stripes egen bekräftelsesida,
 * där det exakta beloppet står innan något genomförs — både vad ändringen
 * kostar för resterande dagar av perioden och vad den nya avgiften blir.
 *
 * Skälet: ett antal i en ruta och en knapp är för lite bekräftelse för något
 * som ändrar en faktura. Beloppet ska stå framför den som godkänner det, och
 * det ska stå hos den part som faktiskt debiterar.
 *
 * Antalet skrivs in i vår databas först när webhooken bekräftar att kunden
 * godkänt ändringen. Avbryter de hos Stripe har ingenting hänt.
 *
 * Utan prenumeration går antalet inte att ändra. Under provperioden ingår ett
 * fast antal, och fler får man genom att börja betala.
 */
export async function startLicenseChange(params: {
  companyId: string;
  next: number;
  baseUrl: string;
}): Promise<string> {
  // Kontrolleras här, inte hos Stripe. Att sänka under antalet aktiva skärmar
  // är vår regel och ska förklaras i vår panel, inte tas emot som ett fel på
  // en främmande sida.
  await assertLicenseCountAllowed(params.companyId, params.next);

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });

  if (!company?.stripeSubscriptionId || !company.stripeCustomerId) {
    throw new Error(
      "Antalet licenser kan ändras först när prenumerationen är aktiv."
    );
  }

  const subscription = await stripe().subscriptions.retrieve(
    company.stripeSubscriptionId
  );

  const item = subscription.items.data[0];
  if (!item) throw new Error("Prenumerationen saknar prisrad hos Stripe.");

  const session = await stripe().billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    configuration: await licenseUpdateConfiguration(),
    return_url: `${params.baseUrl}/admin/installningar/prenumeration`,

    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: company.stripeSubscriptionId,
        items: [{ id: item.id, quantity: params.next }],
      },
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
let licenseConfigurationId: string | null = null;

async function licenseUpdateConfiguration(): Promise<string> {
  const fromEnv = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  if (fromEnv) return fromEnv;

  if (licenseConfigurationId) return licenseConfigurationId;

  const marker = "tikkr-license-update";

  // Letar upp en tidigare skapad först. Appen startas om vid varje deploy, och
  // en ny konfiguration per omstart skulle fylla Stripe-kontot med dubbletter.
  const existing = await stripe().billingPortal.configurations.list({
    active: true,
    limit: 100,
  });

  const found = existing.data.find((item) => item.metadata?.tikkr === marker);
  if (found) {
    licenseConfigurationId = found.id;
    return found.id;
  }

  // Priserna hör oftast till samma produkt, men behöver inte göra det.
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

  const created = await createConfiguration(byProduct, marker);

  licenseConfigurationId = created.id;
  return created.id;
}

async function createConfiguration(
  byProduct: Map<string, string[]>,
  marker: string
) {
  try {
    return await stripe().billingPortal.configurations.create({
      metadata: { tikkr: marker },
      business_profile: { headline: "Tikkr — antal stämplingsskärmar" },

      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["quantity"],

          // Samma avräkning som tidigare: en skärm som läggs till mitt i
          // perioden kostar resterande dagar, varken en hel period eller noll.
          proration_behavior: "create_prorations",

          products: [...byProduct].map(([product, prices]) => ({
            product,
            prices,
          })),
        },

        // Allt annat stängs av. Konfigurationen används enbart för att
        // bekräfta ett ändrat antal — kort, kvitton och uppsägning ligger kvar
        // i den vanliga portalen.
        invoice_history: { enabled: false },
        payment_method_update: { enabled: false },
        customer_update: { enabled: false },
        subscription_cancel: { enabled: false },
      },
    });
  } catch (error) {
    // I skarpt läge kräver Stripe att kundportalens villkors- och
    // integritetslänkar är ifyllda innan en konfiguration får skapas. Utan den
    // upplysningen ser felet ut att komma från oss.
    console.error("Kunde inte skapa portalkonfiguration hos Stripe", error);

    throw new Error(
      "Stripe kunde inte skapa kundportalens konfiguration. Kontrollera att " +
        "villkors- och integritetslänk är ifyllda under Inställningar → " +
        "Kundportal i Stripe, eller ange en befintlig konfiguration i " +
        "STRIPE_PORTAL_CONFIGURATION_ID."
    );
  }
}

export interface BillingOverview {
  /** Antal licenser, alltså vad kunden betalar för. */
  screens: number;
  /** Antal aktiva skärmar av dessa. */
  used: number;
  monthlyAmount: number;
  yearlyAmount: number;
  /** Vad kunden sparar på att betala ett år i förskott. */
  yearlySaving: number;
  hasSubscription: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  interval: BillingInterval | null;
}

/** Vad kunden ser på prenumerationssidan. */
export async function getBillingOverview(
  companyId: string
): Promise<BillingOverview> {
  const licenses = await getLicenseState(companyId);
  const screens = licenses.total;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true },
  });

  const overview: BillingOverview = {
    screens,
    used: licenses.used,
    monthlyAmount: screens * PRICE_PER_SCREEN.month,
    yearlyAmount: screens * PRICE_PER_SCREEN.year,
    yearlySaving:
      screens * (PRICE_PER_SCREEN.month * 12 - PRICE_PER_SCREEN.year),
    hasSubscription: Boolean(company?.stripeSubscriptionId),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    interval: null,
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
      overview.monthlyAmount = quantity * PRICE_PER_SCREEN.month;
      overview.yearlyAmount = quantity * PRICE_PER_SCREEN.year;
      overview.yearlySaving =
        quantity * (PRICE_PER_SCREEN.month * 12 - PRICE_PER_SCREEN.year);
    }
  } catch (error) {
    // Sidan ska gå att öppna även när Stripe inte svarar.
    console.error("Kunde inte hämta prenumerationen från Stripe", error);
  }

  return overview;
}
