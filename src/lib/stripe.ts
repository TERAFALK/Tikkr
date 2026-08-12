import Stripe from "stripe";

/**
 * KOPPLINGEN TILL STRIPE.
 *
 * Allt som rör betalningar går genom den här filen. Resten av systemet ska
 * kunna fungera utan att Stripe är påkopplat — i labbet, och hos en kund som
 * betalar mot faktura.
 *
 * Kortuppgifter passerar aldrig vår server. Kunden fyller i dem på Stripes
 * egen sida, och vi får bara veta att det gick bra. Det är hela skälet att
 * använda deras kassa istället för att bygga ett eget formulär: kortdata vi
 * aldrig tar emot kan inte läcka från oss.
 */

let client: Stripe | null = null;

export type BillingInterval = "month" | "year";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

/** true när årsbetalning går att välja. Saknas priset erbjuds bara månad. */
export function yearlyAvailable(): boolean {
  return Boolean(process.env.STRIPE_PRICE_ID_YEARLY);
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new StripeNotConfiguredError(
      "STRIPE_SECRET_KEY saknas. Betalningar är inte påkopplade."
    );
  }

  // Återanvänds mellan anrop. En ny klient per anrop skulle öppna en ny
  // anslutning varje gång.
  client ??= new Stripe(key);
  return client;
}

export function priceId(interval: BillingInterval = "month"): string {
  const id =
    interval === "year"
      ? process.env.STRIPE_PRICE_ID_YEARLY
      : process.env.STRIPE_PRICE_ID;

  if (!id) {
    throw new StripeNotConfiguredError(
      interval === "year"
        ? "STRIPE_PRICE_ID_YEARLY saknas. Årsbetalning är inte påkopplad."
        : "STRIPE_PRICE_ID saknas. Betalningar är inte påkopplade."
    );
  }

  return id;
}

/**
 * VAD EN SKÄRM KOSTAR.
 *
 * Hämtas från Stripe, inte ur koden. Priset sätts på artikeln där, och ändras
 * det ska panelen och säljsidan följa med utan att någon behöver komma ihåg
 * att ändra en siffra på fem ställen till.
 *
 * Reservpriserna nedan används bara när Stripe inte är påkopplat — i labbet,
 * och hos en kund som betalar mot faktura. De ska hållas i takt med artikeln,
 * men de styr ingenting så länge Stripe svarar.
 */
export const FALLBACK_PRICE_PER_SCREEN = {
  month: 399,
  year: 3990,
} as const;

export interface ScreenPricing {
  /** Kronor per skärm och månad, exklusive moms. */
  month: number;
  /** Kronor per skärm och år. null när årsbetalning inte erbjuds. */
  year: number | null;
  /** Rabatt i procent vid årsbetalning, avrundad. null utan årspris. */
  yearlyDiscountPercent: number | null;
  /** true när siffrorna kommer från Stripe och inte från reservvärdena. */
  fromStripe: boolean;
}

// Priset ändras några gånger om året, inte några gånger i minuten. Ett kort
// minne räcker för att slippa ett anrop till Stripe vid varje sidvisning.
const PRICING_CACHE_MS = 10 * 60_000;
let pricingCache: { at: number; value: ScreenPricing } | null = null;

export async function getScreenPricing(): Promise<ScreenPricing> {
  if (pricingCache && Date.now() - pricingCache.at < PRICING_CACHE_MS) {
    return pricingCache.value;
  }

  const value = await readPricing();
  pricingCache = { at: Date.now(), value };
  return value;
}

async function readPricing(): Promise<ScreenPricing> {
  if (!isStripeConfigured()) return fallbackPricing();

  try {
    const month = await amountFor(process.env.STRIPE_PRICE_ID);
    if (month === null) return fallbackPricing();

    const year = yearlyAvailable()
      ? await amountFor(process.env.STRIPE_PRICE_ID_YEARLY)
      : null;

    return {
      month,
      year,
      yearlyDiscountPercent: discountPercent(month, year),
      fromStripe: true,
    };
  } catch (error) {
    // Sidan ska gå att visa även när Stripe inte svarar. Ett pris som är några
    // kronor fel är bättre än en sida som inte laddar.
    console.error("Kunde inte hämta priser från Stripe", error);
    return fallbackPricing();
  }
}

/** Läser ut kronbeloppet ur ett pris hos Stripe. Öre räknas om till kronor. */
async function amountFor(id: string | undefined): Promise<number | null> {
  if (!id) return null;

  const price = await stripe().prices.retrieve(id);
  if (price.unit_amount === null || price.unit_amount === undefined) return null;

  return price.unit_amount / 100;
}

function fallbackPricing(): ScreenPricing {
  const { month, year } = FALLBACK_PRICE_PER_SCREEN;

  // Båda priserna tas med. Säljsidan ska kunna visa vad tjänsten kostar även
  // i en miljö där Stripe inte är påkopplat — om årsbetalning går att köpa är
  // en annan fråga, och den avgörs av yearlyAvailable().
  return {
    month,
    year,
    yearlyDiscountPercent: discountPercent(month, year),
    fromStripe: false,
  };
}

/**
 * Hur mycket billigare ett år i förskott är än tolv månader styckvis.
 *
 * Räknas fram ur priserna istället för att skrivas som en siffra. Ändras
 * artikeln hos Stripe ändras procenten med den.
 */
export function discountPercent(
  month: number,
  year: number | null
): number | null {
  if (!year || month <= 0) return null;

  const full = month * 12;
  if (year >= full) return null;

  return Math.round((1 - year / full) * 100);
}

export class StripeNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}

/**
 * Översätter Stripes status till vår.
 *
 * Stripe har fler lägen än vi behöver skilja på. Det som spelar roll för oss
 * är: får kunden komma åt rapporterna, ska vi varna, eller ska panelen låsas.
 *
 * `incomplete` betyder att första betalningen inte gått igenom än. Vi låser
 * inte då — kunden står oftast mitt i kassan, och att bli utlåst under tiden
 * vore absurt.
 */
export function toSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE";
    case "trialing":
    case "incomplete":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "CANCELED";
    default:
      return "PAST_DUE";
  }
}
