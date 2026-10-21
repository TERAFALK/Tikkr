/**
 * BUTIKENS PRODUKTER, SOM TYPER.
 *
 * Produkterna låg här som data fram till 2026-10-21. Nu ligger de i
 * databasen, `shop_products`, och läggs upp under Produkter i
 * plattformspanelen; se products.ts för läsningen. Kvar här är formen och
 * tolkningen av listorna som lagras som JSON.
 *
 * Filen har inga importer och ska inte få några: säljsidan, panelen,
 * plattformen och klientkomponenterna läser den alla.
 */

/**
 * VARA ELLER TJÄNST.
 *
 * En vara skickas och kräver leveransadress. En tjänst, t.ex. en utbildning,
 * gör det inte. Kassan frågar efter adressen bara när något i varukorgen är
 * en vara, se needsDelivery i pricing.ts.
 */
export type ProductKind = "GOODS" | "SERVICE";

/** Rubrikerna butiken grupperar under, i den här ordningen. */
export const KIND_LABEL: Record<ProductKind, string> = {
  GOODS: "Hårdvara",
  SERVICE: "Utbildning och tjänster",
};

export interface ProductImage {
  id: string;
  /** En fil under public/, eller bildrutten för en uppladdad bild. */
  src: string;
  alt: string;
  /**
   * true för en ritad bild. Märks "Illustration" där den visas, så att en
   * ritning aldrig kan tas för ett foto av det kunden får.
   */
  illustration: boolean;
}

export interface Benefit {
  title: string;
  body: string;
}

export interface SpecGroup {
  title: string;
  rows: { label: string; value: string }[];
}

export interface Product {
  id: string;
  /** Nyckeln beställningsraderna bär. Ändras aldrig. */
  key: string;
  slug: string;
  kind: ProductKind;
  name: string;
  summary: string;
  /** Stycken. */
  description: string[];
  /** Exklusive moms, i öre. */
  priceOre: number;
  vatRatePercent: number;
  maxQuantity: number;
  delivery: string;
  warranty: string;
  benefits: Benefit[];
  included: string[];
  requirements: string[];
  specs: SpecGroup[];
  images: ProductImage[];
  inShop: boolean;
  onSite: boolean;
}

/** Det prisräkningen och varukorgen behöver veta om en produkt. */
export type ProductForPricing = Pick<
  Product,
  "key" | "slug" | "kind" | "name" | "priceOre" | "vatRatePercent" | "maxQuantity" | "inShop"
>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Fördelarna ur sin JSON. Det som inte har formen hoppas över, i stället
 * för att en trasig rad ska fälla hela produktsidan.
 */
export function parseBenefits(json: unknown): Benefit[] {
  if (!Array.isArray(json)) return [];

  return json
    .map((item) => ({ title: text(item?.title), body: text(item?.body) }))
    .filter((item) => item.title || item.body);
}

/** Specifikationerna ur sin JSON, med samma hållning som fördelarna. */
export function parseSpecs(json: unknown): SpecGroup[] {
  if (!Array.isArray(json)) return [];

  return json
    .map((group) => ({
      title: text(group?.title),
      rows: (Array.isArray(group?.rows) ? group.rows : [])
        .map((row: unknown) => ({
          label: text((row as { label?: unknown })?.label),
          value: text((row as { value?: unknown })?.value),
        }))
        .filter((row: { label: string; value: string }) => row.label && row.value),
    }))
    .filter((group) => group.rows.length > 0);
}

/** Stycken ur en text där en tom rad skiljer dem åt. */
export function paragraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}
