import { unsafeGlobalPrisma } from "../db";
import { PRODUCT_KEYS, PRODUCTS, isProductKey, type ProductKey } from "./catalog";
import type { PriceList } from "./pricing";

/**
 * TILLBEHÖRENS PRISER, EXKLUSIVE MOMS, I ÖRE.
 *
 * Databasen först, katalogen som reserv. Raden sätts under Artiklar i
 * plattformspanelen, och ändringen syns på säljsidan inom en minut (sidan
 * byggs om så ofta) och direkt i panelen.
 *
 * Det här är det ENDA stället priserna läses. Säljsidan, butiken,
 * beställningsformuläret och servern som räknar beställningen frågar alla
 * här, och kan därför inte visa olika belopp.
 *
 * En redan lagd beställning bär sitt eget pris och påverkas aldrig av en
 * ändring här.
 */
export async function shopPrices(): Promise<PriceList> {
  const rows = await unsafeGlobalPrisma.shopPrice.findMany({
    select: { productKey: true, priceOre: true },
  });

  const stored = new Map(rows.map((row) => [row.productKey, row.priceOre]));

  return Object.fromEntries(
    PRODUCT_KEYS.map((key) => [key, stored.get(key) ?? PRODUCTS[key].fallbackPriceOre])
  ) as PriceList;
}

/** Raderna som finns, med vem som satte dem. För plattformens sida. */
export async function storedShopPrices(): Promise<
  Map<ProductKey, { priceOre: number; updatedByEmail: string; updatedAt: Date }>
> {
  const rows = await unsafeGlobalPrisma.shopPrice.findMany();
  const result = new Map<ProductKey, { priceOre: number; updatedByEmail: string; updatedAt: Date }>();

  for (const row of rows) {
    if (isProductKey(row.productKey)) {
      result.set(row.productKey, {
        priceOre: row.priceOre,
        updatedByEmail: row.updatedByEmail,
        updatedAt: row.updatedAt,
      });
    }
  }

  return result;
}

/** Högsta pris som godtas, så att en extra nolla inte går att spara. */
export const MAX_SHOP_PRICE_ORE = 100_000_00;

export async function setShopPrice(params: {
  productKey: ProductKey;
  priceOre: number;
  byEmail: string;
}): Promise<void> {
  const { productKey, priceOre, byEmail } = params;

  if (!Number.isInteger(priceOre) || priceOre <= 0 || priceOre > MAX_SHOP_PRICE_ORE) {
    throw new Error("Ogiltigt pris.");
  }

  await unsafeGlobalPrisma.shopPrice.upsert({
    where: { productKey },
    update: { priceOre, updatedByEmail: byEmail },
    create: { productKey, priceOre, updatedByEmail: byEmail },
  });
}
