import { describe, expect, it } from "vitest";
import type { ProductForPricing } from "@/lib/shop/catalog";
import {
  needsDelivery,
  orderTotals,
  priceLines,
  PricingError,
  vatOf,
  withVat,
} from "@/lib/shop/pricing";

/**
 * BUTIKENS BELOPP.
 *
 * Det som måste hålla:
 *   priset kommer ur produkten, aldrig ur det som skickats in
 *   en produkt som inte ligger i butiken går inte att beställa
 *   momsen räknas per rad och summeras, som fakturan i Fortnox
 *   frakten är okänd tills den satts, och okänd är inte noll
 *   orimliga antal avvisas i stället för att avrundas
 *
 * Behöver ingen databas.
 */

const SCREEN: ProductForPricing = {
  key: "SKARM",
  slug: "skarm",
  kind: "GOODS",
  name: "Stämplingsskärm",
  priceOre: 2_490_000,
  vatRatePercent: 25,
  maxQuantity: 20,
  inShop: true,
};

const COURSE: ProductForPricing = {
  key: "UTBILDNING",
  slug: "utbildning",
  kind: "SERVICE",
  name: "Utbildning",
  priceOre: 450_000,
  vatRatePercent: 25,
  maxQuantity: 5,
  inShop: true,
};

const PRODUCTS = [SCREEN, COURSE];

describe("raderna", () => {
  it("tar priset, namnet och typen ur produkten", () => {
    const [line] = priceLines([{ productKey: "SKARM", quantity: 2 }], PRODUCTS);

    expect(line).toMatchObject({
      productKey: "SKARM",
      name: "Stämplingsskärm",
      productKind: "GOODS",
      unitPriceOre: 2_490_000,
      quantity: 2,
      subtotalOre: 4_980_000,
      vatRatePercent: 25,
      vatOre: 1_245_000,
    });
  });

  it("ett annat pris på produkten ger ett annat belopp", () => {
    const [line] = priceLines(
      [{ productKey: "SKARM", quantity: 1 }],
      [{ ...SCREEN, priceOre: 1_990_000 }]
    );
    expect(line.subtotalOre).toBe(1_990_000);
  });

  it("flera produkter i samma beställning, i den ordning de kom", () => {
    const lines = priceLines(
      [
        { productKey: "UTBILDNING", quantity: 2 },
        { productKey: "SKARM", quantity: 1 },
      ],
      PRODUCTS
    );
    expect(lines.map((line) => [line.productKey, line.sortOrder])).toEqual([
      ["UTBILDNING", 0],
      ["SKARM", 1],
    ]);
  });

  it("hoppar över noll", () => {
    expect(priceLines([{ productKey: "SKARM", quantity: 0 }], PRODUCTS)).toEqual([]);
  });

  it("avvisar okända och dolda produkter", () => {
    expect(() => priceLines([{ productKey: "OKAND", quantity: 1 }], PRODUCTS)).toThrow(PricingError);
    expect(() =>
      priceLines([{ productKey: "SKARM", quantity: 1 }], [{ ...SCREEN, inShop: false }])
    ).toThrow(PricingError);
  });

  it("avvisar dubbletter och orimliga antal", () => {
    expect(() =>
      priceLines(
        [
          { productKey: "SKARM", quantity: 1 },
          { productKey: "SKARM", quantity: 1 },
        ],
        PRODUCTS
      )
    ).toThrow(PricingError);

    for (const quantity of [-1, 1.5, Number.NaN, SCREEN.maxQuantity + 1]) {
      expect(() => priceLines([{ productKey: "SKARM", quantity }], PRODUCTS)).toThrow(PricingError);
    }
  });

  it("vägrar sälja en produkt utan pris", () => {
    expect(() =>
      priceLines([{ productKey: "SKARM", quantity: 1 }], [{ ...SCREEN, priceOre: 0 }])
    ).toThrow(PricingError);
  });
});

describe("leveransen", () => {
  it("en vara skickas, en tjänst gör det inte", () => {
    expect(needsDelivery([{ productKind: "GOODS" }])).toBe(true);
    expect(needsDelivery([{ productKind: "SERVICE" }])).toBe(false);
    expect(needsDelivery([{ productKind: "SERVICE" }, { productKind: "GOODS" }])).toBe(true);
    expect(needsDelivery([])).toBe(false);
  });

  it("en okänd typ räknas som en vara, så att ingen adress tappas", () => {
    expect(needsDelivery([{ productKind: "OKAND" }])).toBe(true);
  });
});

describe("summorna", () => {
  it("utan frakt: varor plus moms, frakten är okänd", () => {
    const lines = priceLines([{ productKey: "SKARM", quantity: 3 }], PRODUCTS);

    expect(orderTotals(lines, null)).toEqual({
      goodsOre: 7_470_000,
      shippingOre: null,
      vatOre: 1_867_500,
      totalOre: 9_337_500,
    });
  });

  it("med frakt: frakten får moms och läggs till", () => {
    const lines = priceLines([{ productKey: "SKARM", quantity: 1 }], PRODUCTS);

    expect(orderTotals(lines, 45_000)).toEqual({
      goodsOre: 2_490_000,
      shippingOre: 45_000,
      vatOre: 622_500 + 11_250,
      totalOre: 2_490_000 + 45_000 + 622_500 + 11_250,
    });
  });

  it("noll i frakt är ett pris, inte okänt", () => {
    const lines = priceLines([{ productKey: "SKARM", quantity: 1 }], PRODUCTS);
    expect(orderTotals(lines, 0).shippingOre).toBe(0);
  });

  it("momsen avrundas per rad till hela ören", () => {
    expect(vatOf(101, 25)).toBe(25);
    expect(vatOf(102, 25)).toBe(26);
    expect(
      orderTotals(
        [
          { subtotalOre: 101, vatOre: 25 },
          { subtotalOre: 101, vatOre: 25 },
        ],
        null
      ).vatOre
    ).toBe(50);
  });

  it("räknar om ur de lagrade raderna, inte ur dagens pris", () => {
    const stored = priceLines(
      [{ productKey: "SKARM", quantity: 1 }],
      [{ ...SCREEN, priceOre: 1_990_000 }]
    );
    expect(orderTotals(stored, 0).goodsOre).toBe(1_990_000);
  });

  it("pris inklusive moms", () => {
    expect(withVat(2_490_000, 25)).toBe(3_112_500);
  });
});
