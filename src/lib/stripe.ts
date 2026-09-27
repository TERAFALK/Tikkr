import Stripe from "stripe";
import { MODULES, MODULE_KEYS, type ModuleKey } from "./modules";

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

/**
 * Artikeln för ett tillval, eller undefined när den inte är uppsatt.
 *
 * Till skillnad från skärmpriset kastar den inte. En modul utan artikel går
 * helt enkelt inte att köpa, och resten av prenumerationen ska fungera ändå
 * — annars hade en glömd miljövariabel stängt hela kassan.
 */
export function modulePriceId(
  key: ModuleKey,
  interval: BillingInterval = "month"
): string | undefined {
  const definition = MODULES[key];

  return interval === "year"
    ? process.env[definition.priceEnvYearly]
    : process.env[definition.priceEnv];
}

/** true när modulen går att köpa i det här intervallet. */
export function moduleForSale(
  key: ModuleKey,
  interval: BillingInterval = "month"
): boolean {
  return Boolean(isStripeConfigured() && modulePriceId(key, interval));
}

export type PriceRole =
  | { kind: "SCREENS" }
  | { kind: "MODULE"; key: ModuleKey };

/**
 * VAD EN RAD PÅ PRENUMERATIONEN BETYDER.
 *
 * Det här är skälet att funktionen finns: fram till nu hade varje
 * prenumeration exakt en rad, och koden läste `items.data[0]` för att få
 * antalet skärmar. Med en modulrad bredvid är ordningen inte längre given —
 * hamnar modulen först skulle antalet licenser sättas till ett.
 *
 * Rader slås därför upp på pris-id, aldrig på plats.
 */
export function priceRole(id: string | undefined | null): PriceRole | null {
  if (!id) return null;

  if (id === process.env.STRIPE_PRICE_ID || id === process.env.STRIPE_PRICE_ID_YEARLY) {
    return { kind: "SCREENS" };
  }

  for (const key of MODULE_KEYS) {
    if (id === modulePriceId(key, "month") || id === modulePriceId(key, "year")) {
      return { kind: "MODULE", key };
    }
  }

  return null;
}

/**
 * Raden som bär antalet stämplingsskärmar.
 *
 * Faller tillbaka i två steg, och det är med flit. Byts artikeln hos Stripe
 * känner `priceRole` inte längre igen den gamla — men gamla prenumerationer
 * ligger kvar på den, och deras licensantal får inte plötsligt bli fel. Då
 * duger "raden som inte är en modul", och i sista hand första raden, vilket
 * är exakt vad koden gjorde innan moduler fanns.
 */
export function screenItemOf(
  subscription: Stripe.Subscription
): Stripe.SubscriptionItem | undefined {
  const items = subscription.items.data;

  return (
    items.find((item) => priceRole(item.price?.id)?.kind === "SCREENS") ??
    items.find((item) => priceRole(item.price?.id)?.kind !== "MODULE") ??
    items[0]
  );
}

/** Modulerna som ligger på prenumerationen just nu, med sin rad. */
export function moduleItemsOf(
  subscription: Stripe.Subscription
): { key: ModuleKey; itemId: string }[] {
  const found: { key: ModuleKey; itemId: string }[] = [];

  for (const item of subscription.items.data) {
    const role = priceRole(item.price?.id);
    if (role?.kind === "MODULE") found.push({ key: role.key, itemId: item.id });
  }

  return found;
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

export interface ModulePrice {
  /** Kronor per månad för hela företaget, exklusive moms. */
  month: number;
  /** Kronor per år. null när årsbetalning inte erbjuds för modulen. */
  year: number | null;
  /** true när siffrorna kommer från Stripe och inte från registret. */
  fromStripe: boolean;
}

export type ModulePricing = Record<ModuleKey, ModulePrice>;

// Priset ändras några gånger om året, inte några gånger i minuten. Ett kort
// minne räcker för att slippa ett anrop till Stripe vid varje sidvisning.
//
// Skärmpriset och modulpriserna läses i samma svep och delar minne. De
// hämtas nästan alltid tillsammans — prenumerationssidan visar båda — och
// två minnen som går ur takt hade kunnat visa gårdagens modulpris bredvid
// dagens skärmpris.
const PRICING_CACHE_MS = 10 * 60_000;

interface Pricing {
  screens: ScreenPricing;
  modules: ModulePricing;
}

let pricingCache: { at: number; value: Pricing } | null = null;

async function getPricing(): Promise<Pricing> {
  if (pricingCache && Date.now() - pricingCache.at < PRICING_CACHE_MS) {
    return pricingCache.value;
  }

  const value = {
    screens: await readPricing(),
    modules: await readModulePricing(),
  };

  pricingCache = { at: Date.now(), value };
  return value;
}

export async function getScreenPricing(): Promise<ScreenPricing> {
  return (await getPricing()).screens;
}

export async function getModulePricing(): Promise<ModulePricing> {
  return (await getPricing()).modules;
}

/**
 * Vad tillvalen kostar.
 *
 * Samma ordning som skärmpriset: artikeln hos Stripe är sanningen, siffrorna
 * i registret är reservvärden för labbet och för kunder som betalar mot
 * faktura. Ändras priset hos Stripe syns det här inom tio minuter, utan
 * deploy.
 */
async function readModulePricing(): Promise<ModulePricing> {
  const entries = await Promise.all(
    MODULE_KEYS.map(async (key): Promise<[ModuleKey, ModulePrice]> => {
      const fallback: ModulePrice = {
        month: MODULES[key].fallbackMonthly,
        year: MODULES[key].fallbackYearly,
        fromStripe: false,
      };

      if (!isStripeConfigured()) return [key, fallback];

      try {
        const month = await amountFor(modulePriceId(key, "month"));
        if (month === null) return [key, fallback];

        return [
          key,
          {
            month,
            year: await amountFor(modulePriceId(key, "year")),
            fromStripe: true,
          },
        ];
      } catch (error) {
        // Sidan ska gå att visa även när Stripe inte svarar. Ett pris som är
        // några kronor fel är bättre än en sida som inte laddar.
        console.error(`Kunde inte hämta priset för ${key} från Stripe`, error);
        return [key, fallback];
      }
    })
  );

  return Object.fromEntries(entries) as ModulePricing;
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
