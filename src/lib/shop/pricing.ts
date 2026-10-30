import type { ProductForPricing, ProductKind } from "./catalog";

/**
 * BESTÄLLNINGENS BELOPP, RÄKNADE PÅ ETT STÄLLE.
 *
 * Allt i ÖRE som heltal, av samma skäl som resten av Tikkr (money.ts).
 * Priset är alltid exklusive moms, och momsen räknas här och ingen
 * annanstans: på säljsidan, i formuläret, på beställningen, i mejlen och i
 * plattformen. Två ställen som räknar moms kommer att avrunda olika.
 *
 * MOMSEN RÄKNAS PER RAD och summeras, avrundad till hela ören. Det är så
 * fakturaprogrammen gör, och då blir beloppet på beställningen detsamma som
 * på fakturan från Fortnox.
 *
 * Filen läser inga priser själv. Den får produkterna som argument, från
 * listProducts() i products.ts, så att den går att pröva utan databas.
 */

/** Moms på frakten. Följer varan, som i Sverige är 25 %. */
export const SHIPPING_VAT_PERCENT = 25;

export interface RequestedItem {
  productKey: string;
  quantity: number;
}

export interface PricedLine {
  productKey: string;
  name: string;
  unitPriceOre: number;
  vatRatePercent: number;
  productKind: ProductKind;
  quantity: number;
  subtotalOre: number;
  vatOre: number;
  sortOrder: number;
}

export interface Totals {
  goodsOre: number;
  /** null när frakten inte är satt än. Okänd frakt är inte noll kronor. */
  shippingOre: number | null;
  vatOre: number;
  totalOre: number;
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

export function vatOf(amountOre: number, ratePercent: number): number {
  return Math.round((amountOre * ratePercent) / 100);
}

/**
 * Raderna en beställning består av, med priserna som gäller nu.
 *
 * Tar bara nyckel och antal från anroparen. Pris, namn och moms slås upp i
 * produkterna, aldrig i det som kom in med formuläret. Rader med antal noll
 * faller bort; ett okänt eller orimligt antal är ett fel och avrundas inte
 * tyst. En produkt som inte ligger i butiken går inte att beställa, även om
 * någon skriver dess nyckel i adressen.
 */
export function priceLines(
  items: RequestedItem[],
  products: ProductForPricing[]
): PricedLine[] {
  const byKey = new Map(products.map((product) => [product.key, product]));
  const seen = new Set<string>();
  const lines: PricedLine[] = [];

  for (const item of items) {
    const product = byKey.get(item.productKey);

    if (!product || !product.inShop) {
      throw new PricingError("Produkten finns inte i butiken.");
    }

    if (seen.has(item.productKey)) {
      throw new PricingError("Samma produkt står två gånger.");
    }
    seen.add(item.productKey);

    const quantity = item.quantity;

    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new PricingError(`Ange antal ${product.name.toLowerCase()} som ett heltal.`);
    }
    if (quantity > product.maxQuantity) {
      throw new PricingError(
        `Högst ${product.maxQuantity} st per beställning. Kontakta oss för fler.`
      );
    }
    if (quantity === 0) continue;

    const unitPriceOre = product.priceOre;
    if (!Number.isInteger(unitPriceOre) || unitPriceOre <= 0) {
      throw new PricingError(`${product.name} saknar pris och går inte att beställa just nu.`);
    }

    const subtotalOre = unitPriceOre * quantity;

    lines.push({
      productKey: product.key,
      name: product.name,
      unitPriceOre,
      vatRatePercent: product.vatRatePercent,
      productKind: product.kind,
      quantity,
      subtotalOre,
      vatOre: vatOf(subtotalOre, product.vatRatePercent),
      sortOrder: lines.length,
    });
  }

  return lines;
}

/**
 * Summorna för en beställning, ur dess rader och frakt.
 *
 * Tar raderna som de är lagrade, med sina ögonblicksbilder. Räknas om när
 * frakten sätts, och ger då samma varusumma som när beställningen lades.
 */
export function orderTotals(
  lines: { subtotalOre: number; vatOre: number }[],
  shippingOre: number | null
): Totals {
  const goodsOre = lines.reduce((sum, line) => sum + line.subtotalOre, 0);
  const goodsVat = lines.reduce((sum, line) => sum + line.vatOre, 0);
  const shippingVat = shippingOre === null ? 0 : vatOf(shippingOre, SHIPPING_VAT_PERCENT);

  return {
    goodsOre,
    shippingOre,
    vatOre: goodsVat + shippingVat,
    totalOre: goodsOre + (shippingOre ?? 0) + goodsVat + shippingVat,
  };
}

/**
 * Om något i beställningen ska skickas.
 *
 * Avgör om kassan frågar efter leveransadress och om beställningen kräver
 * den. Läser typen på raden, som är en ögonblicksbild: en produkt som byter
 * typ efteråt ändrar inte en lagd beställning.
 */
export function needsDelivery(lines: { productKind: string }[]): boolean {
  return lines.some((line) => line.productKind !== "SERVICE");
}

/** Pris inklusive moms för en produkt, för säljsidan. */
export function withVat(priceOre: number, ratePercent: number): number {
  return priceOre + vatOf(priceOre, ratePercent);
}
