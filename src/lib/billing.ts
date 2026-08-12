import { unsafeGlobalPrisma } from "./db";
import { forCompany } from "./tenant";
import { priceId, stripe } from "./stripe";

/**
 * PRENUMERATIONEN.
 *
 * Priset är 399 kr per aktiv stämplingsskärm och månad. Antalet skärmar är
 * alltså kvantiteten på prenumerationen, och den måste hållas i takt med
 * verkligheten — annars fakturerar vi för skärmar som återkallats, eller
 * missar att ta betalt för nya.
 */

/** Vad kunden betalar för: skärmar som faktiskt går att stämpla på. */
export async function countBillableScreens(companyId: string): Promise<number> {
  return forCompany(companyId).kioskDevice.count({ where: { active: true } });
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
}): Promise<string> {
  const screens = Math.max(1, await countBillableScreens(params.companyId));

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: params.companyId },
    select: { stripeCustomerId: true },
  });

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId(), quantity: screens }],

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
    throw new Error("Stripe gav ingen adress till kassan.");
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
    throw new Error("Företaget har ingen prenumeration hos Stripe än.");
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: `${params.baseUrl}/admin/installningar/prenumeration`,
  });

  return session.url;
}

/**
 * Håller antalet betalda skärmar i takt med antalet aktiva.
 *
 * Anropas när en skärm läggs till, återkallas eller raderas. Stripe räknar
 * själv av resterande dagar, så en skärm som läggs till den femtonde kostar
 * halva månaden — inte en hel, och inte noll.
 *
 * Fel här får aldrig stoppa det kunden höll på med. Att inte kunna lägga till
 * en skärm för att Stripe har en dålig dag vore mycket värre än att
 * kvantiteten är fel i några minuter.
 */
export async function syncSubscriptionQuantity(companyId: string): Promise<void> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true },
  });

  if (!company?.stripeSubscriptionId) return;

  try {
    const screens = await countBillableScreens(companyId);
    const subscription = await stripe().subscriptions.retrieve(
      company.stripeSubscriptionId
    );

    const item = subscription.items.data[0];
    if (!item || item.quantity === screens) return;

    await stripe().subscriptions.update(company.stripeSubscriptionId, {
      items: [{ id: item.id, quantity: Math.max(1, screens) }],
      proration_behavior: "create_prorations",
    });
  } catch (error) {
    console.error(
      `Kunde inte uppdatera antalet skärmar hos Stripe för ${companyId}`,
      error
    );
  }
}

export interface BillingOverview {
  screens: number;
  monthlyAmount: number;
  hasSubscription: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Vad kunden ser på prenumerationssidan. */
export async function getBillingOverview(
  companyId: string
): Promise<BillingOverview> {
  const screens = await countBillableScreens(companyId);

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true },
  });

  const overview: BillingOverview = {
    screens,
    monthlyAmount: screens * 399,
    hasSubscription: Boolean(company?.stripeSubscriptionId),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };

  if (!company?.stripeSubscriptionId) return overview;

  try {
    const subscription = await stripe().subscriptions.retrieve(
      company.stripeSubscriptionId
    );

    const periodEnd = subscription.items.data[0]?.current_period_end;
    overview.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
    overview.cancelAtPeriodEnd = subscription.cancel_at_period_end;
  } catch (error) {
    // Sidan ska gå att öppna även när Stripe inte svarar.
    console.error("Kunde inte hämta prenumerationen från Stripe", error);
  }

  return overview;
}
