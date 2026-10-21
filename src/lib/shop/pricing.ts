import { isProductKey, PRODUCTS, type ProductKey } from "./catalog";

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
 * Filen läser inga priser själv. Den får dem som argument, från shopPrices(),
 * så att den går att pröva utan databas.
 */

/** Moms på frakten. Följer varan, som i Sverige är 25 %. */
export const SHIPPING_VAT_PERCENT = 25;

export type PriceList = Record<ProductKey, number>;

export interface RequestedItem {
  productKey: string;
  quantity: number;
}

export interface PricedLine {
  productKey: ProductKey;
  name: string;
  unitPriceOre: number;
  vatRatePercent: number;
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
 * katalogen och prislistan, aldrig i det som kom in med formuläret. Rader med
 * antal noll faller bort; ett okänt eller orimligt antal är ett fel och
 * avrundas inte tyst.
 */
export function priceLines(items: RequestedItem[], prices: PriceList): PricedLine[] {
  const seen = new Set<string>();
  const lines: PricedLine[] = [];

  for (const item of items) {
    if (!isProductKey(item.productKey)) {
      throw new PricingError("Produkten finns inte.");
    }

    if (seen.has(item.productKey)) {
      throw new PricingError("Samma produkt står två gånger.");
    }
    seen.add(item.productKey);

    const product = PRODUCTS[item.productKey];
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

    const unitPriceOre = prices[item.productKey];
    if (!Number.isInteger(unitPriceOre) || unitPriceOre <= 0) {
      throw new PricingError(`${product.name} saknar pris och går inte att beställa just nu.`);
    }

    const subtotalOre = unitPriceOre * quantity;

    lines.push({
      productKey: item.productKey,
      name: product.name,
      unitPriceOre,
      vatRatePercent: product.vatRatePercent,
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
 * den. En beställning med bara tjänster har ingen adress att leverera till.
 */
export function needsDelivery(lines: { productKey: string }[]): boolean {
  return lines.some(
    (line) => !isProductKey(line.productKey) || PRODUCTS[line.productKey].kind === "GOODS"
  );
}

/** Pris inklusive moms för en produkt, för säljsidan. */
export function withVat(priceOre: number, ratePercent: number): number {
  return priceOre + vatOf(priceOre, ratePercent);
}
