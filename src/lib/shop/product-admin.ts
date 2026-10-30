import type { Prisma } from "@prisma/client";
import { unsafeGlobalPrisma } from "../db";
import { parseOre } from "../money";
import type { Benefit, ProductKind, SpecGroup } from "./catalog";

/**
 * PRODUKTERNA, SOM PLATTFORMEN LÄGGER UPP OCH ÄNDRAR DEM (2026-10-21).
 *
 * Formuläret läses och prövas i `readProductForm`, utan databas, så att
 * reglerna går att pröva för sig. Skrivningarna nedan kallas bara från
 * plattformspanelens åtgärder och bildrutt, som prövar behörigheten först.
 *
 * NYCKELN SÄTTS EN GÅNG. Den bildas ur adressen när produkten skapas och
 * ändras aldrig, eftersom beställningsraderna pekar på den. Adressen får
 * ändras; en gammal länk slutar då fungera, men ingen beställning tappar
 * sin produkt.
 *
 * EN BESTÄLLD PRODUKT RADERAS ALDRIG. Den döljs, med kryssen för butiken och
 * säljsidan, av samma skäl som ordrar och moment stängs i stället för att
 * raderas (CLAUDE.md § 3 regel 1).
 */

export class ProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductError";
  }
}

export interface ProductInput {
  name: string;
  slug: string;
  kind: ProductKind;
  summary: string;
  description: string;
  priceOre: number;
  vatRatePercent: number;
  maxQuantity: number;
  delivery: string;
  warranty: string;
  benefits: Benefit[];
  included: string[];
  requirements: string[];
  specs: SpecGroup[];
  inShop: boolean;
  onSite: boolean;
  sortOrder: number;
}

/** De momssatser som finns i Sverige. 25 % för varor och de flesta tjänster. */
export const VAT_RATES = [25, 12, 6, 0] as const;

export const LIMITS = {
  name: 120,
  slug: 60,
  summary: 300,
  text: 4000,
  row: 300,
  rows: 40,
  maxQuantity: 999,
  /** Kronor exklusive moms, så att en extra nolla inte går att spara. */
  priceKr: 1_000_000,
} as const;

/** "Utbildning för administratörer" → "utbildning-for-administratorer". */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug)
    .replace(/-+$/g, "");
}

/** Nyckeln beställningsraderna bär: "stamplingsskarm" → "STAMPLINGSSKARM". */
export function keyFromSlug(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "_");
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function str(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function all(formData: FormData, name: string): string[] {
  return formData.getAll(name).map((value) => String(value).trim());
}

/**
 * Läser och prövar formuläret.
 *
 * Listorna skickas som upprepade fält, ett per rad, i den ordning de står.
 * Tomma rader hoppas över. Specifikationerna skickas som tre fält per rad,
 * grupp, egenskap och värde, och rader i följd med samma grupp blir en grupp.
 *
 * Svarar med det första felet, skrivet för den som rättar det.
 */
export function readProductForm(
  formData: FormData
): { input: ProductInput; error: null } | { input: null; error: string } {
  const name = str(formData, "name");
  const slug = str(formData, "slug") || slugify(name);
  const kind = str(formData, "kind") === "SERVICE" ? "SERVICE" : "GOODS";
  const summary = str(formData, "summary");
  const description = str(formData, "description");
  const delivery = str(formData, "delivery");
  const warranty = str(formData, "warranty");
  const priceOre = parseOre(str(formData, "price"));
  const vatRatePercent = Number(str(formData, "vatRatePercent") || 25);
  const maxQuantity = Number(str(formData, "maxQuantity") || 20);
  const sortOrder = Number(str(formData, "sortOrder") || 0);

  const fail = (error: string) => ({ input: null, error }) as const;

  if (!name) return fail("Skriv produktens namn.");
  if (name.length > LIMITS.name) return fail(`Namnet får vara högst ${LIMITS.name} tecken.`);
  if (!slug || !SLUG_PATTERN.test(slug) || slug.length > LIMITS.slug) {
    return fail("Adressen får bara innehålla små bokstäver a–z, siffror och bindestreck.");
  }
  if (!summary) return fail("Skriv en kort beskrivning.");
  if (summary.length > LIMITS.summary) {
    return fail(`Den korta beskrivningen får vara högst ${LIMITS.summary} tecken.`);
  }
  for (const [value, label] of [
    [description, "Beskrivningen"],
    [delivery, "Leveranstexten"],
    [warranty, "Garantin"],
  ] as const) {
    if (value.length > LIMITS.text) return fail(`${label} får vara högst ${LIMITS.text} tecken.`);
  }
  if (priceOre === null || priceOre <= 0 || priceOre > LIMITS.priceKr * 100) {
    return fail("Skriv priset i kronor exklusive moms, t.ex. 24 900.");
  }
  if (!(VAT_RATES as readonly number[]).includes(vatRatePercent)) return fail("Välj momssats.");
  if (!Number.isInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > LIMITS.maxQuantity) {
    return fail(`Högsta antal ska vara ett heltal mellan 1 och ${LIMITS.maxQuantity}.`);
  }
  if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 10_000) {
    return fail("Ordningen ska vara ett heltal.");
  }

  const titles = all(formData, "benefitTitle");
  const bodies = all(formData, "benefitBody");
  const benefits = titles
    .map((title, index) => ({ title, body: bodies[index] ?? "" }))
    .filter((benefit) => benefit.title || benefit.body);

  const included = all(formData, "included").filter(Boolean);
  const requirements = all(formData, "requirements").filter(Boolean);

  const groups = all(formData, "specGroup");
  const labels = all(formData, "specLabel");
  const values = all(formData, "specValue");
  const specs: SpecGroup[] = [];

  groups.forEach((group, index) => {
    const label = labels[index] ?? "";
    const value = values[index] ?? "";
    if (!label && !value) return;

    const last = specs.at(-1);
    if (last && last.title === group) last.rows.push({ label, value });
    else specs.push({ title: group, rows: [{ label, value }] });
  });

  const rows = [
    ...benefits.flatMap((benefit) => [benefit.title, benefit.body]),
    ...included,
    ...requirements,
    ...specs.flatMap((group) => [group.title, ...group.rows.flatMap((row) => [row.label, row.value])]),
  ];

  if (rows.some((row) => row.length > LIMITS.row)) {
    return fail(`En rad i listorna får vara högst ${LIMITS.row} tecken.`);
  }
  if (
    [benefits, included, requirements, specs.flatMap((group) => group.rows)].some(
      (list) => list.length > LIMITS.rows
    )
  ) {
    return fail(`En lista får ha högst ${LIMITS.rows} rader.`);
  }
  if (specs.some((group) => group.rows.some((row) => !row.label || !row.value))) {
    return fail("Varje rad i specifikationerna behöver både egenskap och värde.");
  }

  return {
    error: null,
    input: {
      name,
      slug,
      kind,
      summary,
      description,
      priceOre,
      vatRatePercent,
      maxQuantity,
      delivery,
      warranty,
      benefits,
      included,
      requirements,
      specs,
      inShop: formData.get("inShop") === "on",
      onSite: formData.get("onSite") === "on",
      sortOrder,
    },
  };
}

function isUniqueError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

/**
 * Det som skrivs till tabellen. Listorna är JSON, och Prismas typ för JSON
 * känner inte igen ett fält med en egen typ som ett objekt, så de lämnas
 * över som det de är: vanlig data, redan prövad i readProductForm.
 */
function columns(input: ProductInput) {
  return {
    ...input,
    benefits: input.benefits as unknown as Prisma.InputJsonValue,
    specs: input.specs as unknown as Prisma.InputJsonValue,
  };
}

async function log(actorEmail: string, action: string, detail: string) {
  await unsafeGlobalPrisma.platformAuditLog.create({
    data: { actorEmail, action, detail },
  });
}

/** Skapar en produkt. Nyckeln bildas ur adressen och ändras sedan aldrig. */
export async function createProduct(input: ProductInput, actorEmail: string): Promise<string> {
  try {
    const product = await unsafeGlobalPrisma.shopProduct.create({
      data: { ...columns(input), key: keyFromSlug(input.slug), updatedByEmail: actorEmail },
      select: { id: true },
    });

    await log(actorEmail, "Lade upp produkt", input.name);
    return product.id;
  } catch (error) {
    if (isUniqueError(error)) {
      throw new ProductError("Adressen används redan av en annan produkt. Välj en annan.");
    }
    throw error;
  }
}

/** Ändrar en produkt. Lagda beställningar bär sitt eget namn och pris. */
export async function updateProduct(
  id: string,
  input: ProductInput,
  actorEmail: string
): Promise<{ previousSlug: string }> {
  const existing = await unsafeGlobalPrisma.shopProduct.findUnique({
    where: { id },
    select: { slug: true, priceOre: true },
  });
  if (!existing) throw new ProductError("Produkten finns inte.");

  try {
    await unsafeGlobalPrisma.shopProduct.update({
      where: { id },
      data: { ...columns(input), updatedByEmail: actorEmail },
    });
  } catch (error) {
    if (isUniqueError(error)) {
      throw new ProductError("Adressen används redan av en annan produkt. Välj en annan.");
    }
    throw error;
  }

  const priceNote =
    existing.priceOre !== input.priceOre
      ? `, pris ${existing.priceOre / 100} till ${input.priceOre / 100} kr`
      : "";
  await log(actorEmail, "Ändrade produkt", `${input.name}${priceNote}`);

  return { previousSlug: existing.slug };
}

/**
 * Tar bort en produkt som aldrig beställts.
 *
 * En som finns på en beställning vägras, och ska döljas i stället. Den som
 * provat sig fram ska inte tvingas leva med ett utkast i listan, samma
 * avvägning som för improduktiva moment utan stämplingar.
 */
export async function deleteProduct(id: string, actorEmail: string): Promise<void> {
  const product = await unsafeGlobalPrisma.shopProduct.findUnique({
    where: { id },
    select: { key: true, name: true },
  });
  if (!product) throw new ProductError("Produkten finns inte.");

  const ordered = await unsafeGlobalPrisma.shopOrderLine.count({
    where: { productKey: product.key },
  });

  if (ordered > 0) {
    throw new ProductError("Produkten finns i beställningar. Dölj den i stället.");
  }

  await unsafeGlobalPrisma.shopProduct.delete({ where: { id } });
  await log(actorEmail, "Tog bort produkt", product.name);
}

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Lägger till en bild sist. Typen prövas på filens första byte och inte
 * bara på vad webbläsaren påstår, eftersom bilden sedan lämnas ut med den
 * typen till alla som besöker säljsidan.
 */
export async function addProductImage(params: {
  productId: string;
  bytes: Uint8Array<ArrayBuffer>;
  alt: string;
  illustration: boolean;
}): Promise<void> {
  const mimeType = sniffImageType(params.bytes);
  if (!mimeType) throw new ProductError("Bilden måste vara PNG, JPEG eller WebP.");
  if (params.bytes.length > IMAGE_MAX_BYTES) {
    throw new ProductError("Bilden får vara högst 5 MB.");
  }

  const product = await unsafeGlobalPrisma.shopProduct.findUnique({
    where: { id: params.productId },
    select: { id: true, _count: { select: { images: true } } },
  });
  if (!product) throw new ProductError("Produkten finns inte.");

  await unsafeGlobalPrisma.shopProductImage.create({
    data: {
      productId: product.id,
      data: params.bytes,
      mimeType,
      alt: params.alt.slice(0, LIMITS.row),
      illustration: params.illustration,
      sortOrder: product._count.images,
    },
  });
}

/** PNG, JPEG eller WebP ur filens inledning, eller null. */
export function sniffImageType(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);

  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function updateProductImage(
  id: string,
  data: { alt: string; illustration: boolean }
): Promise<string> {
  const image = await unsafeGlobalPrisma.shopProductImage.update({
    where: { id },
    data: { alt: data.alt.slice(0, LIMITS.row), illustration: data.illustration },
    select: { productId: true },
  });
  return image.productId;
}

/** Flyttar en bild ett steg. Den första bilden är den som visas i butiken. */
export async function moveProductImage(id: string, direction: "up" | "down"): Promise<string> {
  const image = await unsafeGlobalPrisma.shopProductImage.findUnique({
    where: { id },
    select: { productId: true },
  });
  if (!image) throw new ProductError("Bilden finns inte.");

  const images = await unsafeGlobalPrisma.shopProductImage.findMany({
    where: { productId: image.productId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  const order = images.map((row) => row.id);
  const index = order.indexOf(id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return image.productId;

  [order[index], order[target]] = [order[target], order[index]];

  await unsafeGlobalPrisma.$transaction(
    order.map((imageId, sortOrder) =>
      unsafeGlobalPrisma.shopProductImage.update({ where: { id: imageId }, data: { sortOrder } })
    )
  );

  return image.productId;
}

export async function deleteProductImage(id: string): Promise<string> {
  const image = await unsafeGlobalPrisma.shopProductImage.delete({
    where: { id },
    select: { productId: true },
  });
  return image.productId;
}
