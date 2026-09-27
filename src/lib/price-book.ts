import { unsafeGlobalPrisma } from "./db";
import { MODULE_KEYS, isModuleKey, type ModuleKey } from "./modules";

/**
 * VILKA ARTIKLAR HOS STRIPE SOM ÄR VAD.
 *
 * Skärmlicensen och varje tillval har en artikel hos Stripe, en per
 * betalningsintervall. Priset i kronor står bara där; det här är pekaren dit.
 *
 * TVÅ KÄLLOR, OCH DATABASEN VINNER.
 *
 * Numren stod först bara i miljövariabler. Det betydde att en ny artikel
 * krävde att någon redigerade en fil på servern och startade om appen — för
 * att skriva in en identifierare som inte är hemlig. Nu sätts de i
 * plattformspanelen och hamnar i `stripe_prices`.
 *
 * Miljövariablerna läses fortfarande, som reserv. Skälet är inte bakåt-
 * kompatibilitet i sig: en installation vars databas inte hunnit fyllas ska
 * kunna ta betalt, och den som sätter upp en ny server ska kunna göra det med
 * en .env-fil som förut. Sätts något i panelen tar det över.
 *
 * INGEN CACHE, av samma skäl som i company-modules.ts: det är ett uppslag på
 * en tabell med en handfull rader, och prisuppgifterna som kostar något att
 * hämta — kronbeloppen från Stripe — har redan sitt eget minne i stripe.ts.
 */

/** Skärmlicensen. Inte en modul, men behöver en nyckel i samma register. */
export const SCREEN_ITEM = "SCREEN";

export type PriceItem = typeof SCREEN_ITEM | ModuleKey;

export const PRICE_ITEMS: PriceItem[] = [SCREEN_ITEM, ...MODULE_KEYS];

export interface PricePair {
  month?: string;
  year?: string;
}

export interface PriceBook {
  screen: PricePair;
  modules: Record<ModuleKey, PricePair>;
}

/**
 * Miljövariabeln för en artikel.
 *
 * Namnen bildas ur nyckeln i stället för att skrivas ut var för sig. En ny
 * modul behöver då inte döpa två variabler, och namnen kan inte glida isär
 * från varandra — vilket är precis vad som hände förut, när skärmpriset hette
 * STRIPE_PRICE_ID och löneunderlaget STRIPE_PRICE_ID_PAYROLL.
 */
export function priceEnvName(
  item: PriceItem,
  interval: "month" | "year"
): string {
  return `STRIPE_PRICE_${item}_${interval === "year" ? "YEAR" : "MONTH"}`;
}

/**
 * De gamla variabelnamnen, som fortfarande läses.
 *
 * Skärmpriset hette STRIPE_PRICE_ID redan innan det fanns något annat att
 * prissätta, och står så i varje .env som är i drift. Att kräva att någon byter
 * namn i en fil på en server för att kunna deploya är en onödig risk för
 * ingenting.
 *
 * Nya artiklar läggs INTE till här. De har aldrig hetat något annat.
 */
const LEGACY_ENV: Partial<Record<string, string>> = {
  STRIPE_PRICE_SCREEN_MONTH: "STRIPE_PRICE_ID",
  STRIPE_PRICE_SCREEN_YEAR: "STRIPE_PRICE_ID_YEARLY",
  STRIPE_PRICE_PAYROLL_MONTH: "STRIPE_PRICE_ID_PAYROLL",
  STRIPE_PRICE_PAYROLL_YEAR: "STRIPE_PRICE_ID_PAYROLL_YEARLY",
};

/** Värdet ur miljön, med det gamla namnet som andra försök. */
export function priceFromEnv(
  item: PriceItem,
  interval: "month" | "year"
): string | undefined {
  const name = priceEnvName(item, interval);
  const legacy = LEGACY_ENV[name];

  return process.env[name] || (legacy ? process.env[legacy] : undefined);
}

/** Raderna i databasen, som plattformspanelen redigerar dem. */
export interface StoredPrice {
  item: PriceItem;
  month: string | null;
  year: string | null;
  updatedByEmail: string;
  updatedAt: Date;
}

export async function storedPrices(): Promise<StoredPrice[]> {
  const rows = await unsafeGlobalPrisma.stripePrice.findMany();

  return rows
    .filter((row) => row.item === SCREEN_ITEM || isModuleKey(row.item))
    .map((row) => ({
      item: row.item as PriceItem,
      month: row.monthPriceId,
      year: row.yearPriceId,
      updatedByEmail: row.updatedByEmail,
      updatedAt: row.updatedAt,
    }));
}

export async function priceBook(): Promise<PriceBook> {
  const stored = new Map((await storedPrices()).map((row) => [row.item, row]));

  const pairFor = (item: PriceItem): PricePair => {
    const row = stored.get(item);

    // Tom sträng räknas som ingenting. Ett fält någon rensat i panelen ska
    // falla tillbaka på miljön, inte bli ett artikelnummer som är "".
    return {
      month: row?.month || priceFromEnv(item, "month"),
      year: row?.year || priceFromEnv(item, "year"),
    };
  };

  return {
    screen: pairFor(SCREEN_ITEM),
    modules: Object.fromEntries(
      MODULE_KEYS.map((key) => [key, pairFor(key)])
    ) as Record<ModuleKey, PricePair>,
  };
}

/**
 * Sparar ett artikelnummer.
 *
 * Tomt värde raderar fältet, vilket betyder "använd miljövariabeln om den
 * finns". Är båda fälten tomma tas raden bort helt — en tom rad säger inget
 * annat än att någon varit inne och tittat.
 */
export async function setStoredPrice(params: {
  item: PriceItem;
  month: string | null;
  year: string | null;
  actorEmail: string;
}): Promise<void> {
  const month = params.month?.trim() || null;
  const year = params.year?.trim() || null;

  if (!month && !year) {
    await unsafeGlobalPrisma.stripePrice.deleteMany({
      where: { item: params.item },
    });
    return;
  }

  await unsafeGlobalPrisma.stripePrice.upsert({
    where: { item: params.item },
    create: {
      item: params.item,
      monthPriceId: month,
      yearPriceId: year,
      updatedByEmail: params.actorEmail,
    },
    update: {
      monthPriceId: month,
      yearPriceId: year,
      updatedByEmail: params.actorEmail,
    },
  });
}
