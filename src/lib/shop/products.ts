import type { Prisma } from "@prisma/client";
import { unsafeGlobalPrisma } from "../db";
import {
  paragraphs,
  parseBenefits,
  parseSpecs,
  type Product,
  type ProductKind,
} from "./catalog";

/**
 * BUTIKENS PRODUKTER, UR DATABASEN.
 *
 * Det ENDA stället produkterna läses. Säljsidan, butiken, kassan, servern som
 * räknar beställningen och mejlen frågar alla här, och kan därför inte visa
 * olika pris eller text för samma produkt.
 *
 * Tre urval:
 *   "shop"  det kunden kan beställa i panelen
 *   "site"  det som visas på säljsidan
 *   "all"   allt, även dolt; för plattformen och för beställningar som redan
 *           finns, vars produkt kan ha dolts sedan dess
 *
 * Plattformens egen tabell, utan company_id. Därför den ofiltrerade klienten.
 */

export type ProductFilter = "shop" | "site" | "all";

const WITH_IMAGES = {
  images: {
    orderBy: { sortOrder: "asc" },
    select: { id: true, staticPath: true, alt: true, illustration: true },
  },
} satisfies Prisma.ShopProductInclude;

type Row = Prisma.ShopProductGetPayload<{ include: typeof WITH_IMAGES }>;

function whereFor(filter: ProductFilter): Prisma.ShopProductWhereInput {
  if (filter === "shop") return { inShop: true };
  if (filter === "site") return { onSite: true };
  return {};
}

/** Adressen till en bild: filen under public/, eller bildrutten. */
export function imageSrc(image: { id: string; staticPath: string | null }): string {
  return image.staticPath ?? `/api/butik/bild/${image.id}`;
}

export function toProduct(row: Row): Product {
  return {
    id: row.id,
    key: row.key,
    slug: row.slug,
    kind: row.kind as ProductKind,
    name: row.name,
    summary: row.summary,
    description: paragraphs(row.description),
    priceOre: row.priceOre,
    vatRatePercent: row.vatRatePercent,
    maxQuantity: row.maxQuantity,
    delivery: row.delivery,
    warranty: row.warranty,
    benefits: parseBenefits(row.benefits),
    included: row.included,
    requirements: row.requirements,
    specs: parseSpecs(row.specs),
    images: row.images.map((image) => ({
      id: image.id,
      src: imageSrc(image),
      alt: image.alt,
      illustration: image.illustration,
    })),
    inShop: row.inShop,
    onSite: row.onSite,
  };
}

export async function listProducts(filter: ProductFilter): Promise<Product[]> {
  const rows = await unsafeGlobalPrisma.shopProduct.findMany({
    where: whereFor(filter),
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: WITH_IMAGES,
  });

  return rows.map(toProduct);
}

export async function productBySlug(
  slug: string,
  filter: ProductFilter
): Promise<Product | null> {
  const row = await unsafeGlobalPrisma.shopProduct.findFirst({
    where: { slug, ...whereFor(filter) },
    include: WITH_IMAGES,
  });

  return row ? toProduct(row) : null;
}

/**
 * Produkterna bakom en beställnings rader, även dolda. Används för texter
 * som inte är ögonblicksbilder, som leveranstiden i mejlen.
 */
export async function productsByKeys(keys: string[]): Promise<Product[]> {
  if (keys.length === 0) return [];

  const rows = await unsafeGlobalPrisma.shopProduct.findMany({
    where: { key: { in: keys } },
    include: WITH_IMAGES,
  });

  return rows.map(toProduct);
}
