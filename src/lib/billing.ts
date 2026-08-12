import { unsafeGlobalPrisma } from "./db";
import {
  assertLicenseCountAllowed,
  getLicenseState,
  setLicenseCount,
} from "./licenses";
import {
  priceId,
  stripe,
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
 * Ändrar antalet licenser.
 *
 * Finns en prenumeration ändras kvantiteten hos Stripe, som räknar av
 * resterande dagar — en skärm som läggs till den femtonde kostar halva
 * månaden, inte en hel och inte noll.
 *
 * Utan prenumeration går antalet inte att ändra. Under provperioden ingår två,
 * och fler får man genom att börja betala.
 */
export async function changeLicenseCount(
  companyId: string,
  next: number
): Promise<void> {
  await assertLicenseCountAllowed(companyId, next);

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true },
  });

  if (!company?.stripeSubscriptionId) {
    throw new Error(
      "Antalet licenser kan ändras först när prenumerationen är aktiv."
    );
  }

  const subscription = await stripe().subscriptions.retrieve(
    company.stripeSubscriptionId
  );

  const item = subscription.items.data[0];
  if (!item) throw new Error("Prenumerationen saknar prisrad hos Stripe.");

  await stripe().subscriptions.update(company.stripeSubscriptionId, {
    items: [{ id: item.id, quantity: next }],
    proration_behavior: "create_prorations",
  });

  // Sätts direkt så att kunden kan skapa skärmen på en gång. Webhooken
  // bekräftar samma värde strax efter — hade vi väntat på den skulle knappen
  // se ut att inte ha gjort något.
  await setLicenseCount(companyId, next);
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
  } catch (error) {
    // Sidan ska gå att öppna även när Stripe inte svarar.
    console.error("Kunde inte hämta prenumerationen från Stripe", error);
  }

  return overview;
}
