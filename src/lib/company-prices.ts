import { unsafeGlobalPrisma } from "./db";
import { isModuleKey } from "./modules";
import { SCREEN_ITEM, type PriceItem } from "./price-book";

/**
 * AVTALAT PRIS FÖR EN ENSKILD KUND.
 *
 * Listpriset står hos Stripe och gäller alla. Det här är vad vi kommit
 * överens om med ett visst företag: en pilotkund som får systemet gratis, en
 * kund som förhandlat ner skärmlicensen till 299.
 *
 * SAKNAS RADEN GÄLLER LISTPRISET, och noll är ett giltigt pris som betyder
 * gratis. Därför en rad per artikel och inte ett nollbart fält: "ej satt" och
 * "noll kronor" måste gå att skilja åt, annars kan en gratiskund inte
 * uttryckas alls.
 *
 * GÄLLER BARA FÖRETAG UTAN PRENUMERATION HOS STRIPE. Har kunden ett kort som
 * dras på 399 vore det en lögn att visa 299 på deras sida. Vakten sitter i
 * åtgärden som sparar, se platform-admin.ts, och i uppslaget nedan: en kund
 * med prenumeration får listpriset oavsett vad som råkar ligga i tabellen.
 *
 * Beloppen lagras i ÖRE och lämnas ut i KRONOR, eftersom resten av
 * prisräkningen (stripe.ts, billing.ts) arbetar i kronor. Öre i databasen av
 * samma skäl som timkostnaderna: ett decimaltal som ska jämföras och summeras
 * ska inte vara ett flyttal.
 */

/** Avtalade priser i kronor, per artikel. Saknad nyckel betyder listpris. */
export type AgreedPrices = Partial<Record<PriceItem, number>>;

/**
 * Läser de avtalade priserna för ett företag.
 *
 * Går via den ofiltrerade klienten eftersom både plattformspanelen och
 * kundens egen prenumerationssida kallar den, och den senare har ingen
 * företagslåst klient i det lagret. Företaget pekas ut av argumentet, aldrig
 * av något som kommit in i ett anrop.
 */
export async function agreedPrices(companyId: string): Promise<AgreedPrices> {
  const rows = await unsafeGlobalPrisma.companyPrice.findMany({
    where: { companyId },
    select: { item: true, monthlyOre: true },
  });

  return fromRows(rows);
}

/**
 * Samma sak för flera företag på en gång.
 *
 * Kundlistan i plattformspanelen visar en intäktssiffra per rad, och en fråga
 * per företag hade blivit en fråga per rad.
 */
export async function agreedPricesByCompany(
  companyIds: string[]
): Promise<Map<string, AgreedPrices>> {
  const rows = await unsafeGlobalPrisma.companyPrice.findMany({
    where: { companyId: { in: companyIds } },
    select: { companyId: true, item: true, monthlyOre: true },
  });

  const byCompany = new Map<string, { item: string; monthlyOre: number }[]>();

  for (const row of rows) {
    const list = byCompany.get(row.companyId) ?? [];
    list.push(row);
    byCompany.set(row.companyId, list);
  }

  return new Map(
    [...byCompany].map(([companyId, list]) => [companyId, fromRows(list)])
  );
}

function fromRows(rows: { item: string; monthlyOre: number }[]): AgreedPrices {
  const prices: AgreedPrices = {};

  for (const row of rows) {
    if (row.item === SCREEN_ITEM || isModuleKey(row.item)) {
      prices[row.item as PriceItem] = row.monthlyOre / 100;
    }
  }

  return prices;
}

/**
 * Sätter eller tar bort ett avtalat pris.
 *
 * Tomt belopp tar bort raden, och kunden går då tillbaka till listpriset. Det
 * är skälet att noll inte kan betyda "ingen överenskommelse": noll är ett
 * pris någon förhandlat fram.
 */
export async function setAgreedPrice(params: {
  companyId: string;
  item: PriceItem;
  /** Kronor, eller null för att ta bort överenskommelsen. */
  amount: number | null;
  byEmail: string;
}): Promise<void> {
  const { companyId, item, amount, byEmail } = params;

  if (amount === null) {
    await unsafeGlobalPrisma.companyPrice.deleteMany({
      where: { companyId, item },
    });
    return;
  }

  const monthlyOre = Math.round(amount * 100);

  await unsafeGlobalPrisma.companyPrice.upsert({
    where: { companyId_item: { companyId, item } },
    update: { monthlyOre, updatedByEmail: byEmail },
    create: { companyId, item, monthlyOre, updatedByEmail: byEmail },
  });
}

/**
 * Rabatten i procent, avrundad till heltal.
 *
 * Null när det inte finns någon rabatt att visa: inget avtalat pris, ett
 * listpris på noll, eller ett avtalat pris som inte är lägre. Ett påslag
 * redovisas alltså inte som en negativ rabatt — det vore en siffra som
 * förvirrar mer än den förklarar, och höjda priser är inte vad fältet finns
 * för.
 */
export function discountFrom(list: number, agreed: number): number | null {
  if (list <= 0 || agreed >= list) return null;

  return Math.round(((list - agreed) / list) * 100);
}

/** Priset att räkna med: det avtalade när det finns, annars listpriset. */
export function priceFor(
  prices: AgreedPrices,
  item: PriceItem,
  list: number
): number {
  const agreed = prices[item];
  return agreed === undefined ? list : agreed;
}

/** true när företaget har minst ett avtalat pris. */
export function hasAgreement(prices: AgreedPrices): boolean {
  return Object.keys(prices).length > 0;
}

