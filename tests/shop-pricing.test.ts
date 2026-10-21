import { describe, expect, it } from "vitest";
import { PRODUCT_KEYS, PRODUCTS, isProductKey, productBySlug } from "@/lib/shop/catalog";
import {
  orderTotals,
  priceLines,
  PricingError,
  vatOf,
  withVat,
  type PriceList,
} from "@/lib/shop/pricing";

/**
 * TILLBEHÖRENS BELOPP.
 *
 * Det som måste hålla:
 *   priset kommer ur prislistan, aldrig ur det som skickats in
 *   momsen räknas per rad och summeras, som fakturan i Fortnox
 *   frakten är okänd tills den satts, och okänd är inte noll
 *   orimliga antal avvisas i stället för att avrundas
 *
 * Behöver ingen databas.
 */

const PRICES: PriceList = { STAMPLINGSSKARM: 2_490_000 };

describe("katalogen", () => {
  it("varje produkt har en unik adress och går att slå upp", () => {
    const slugs = PRODUCT_KEYS.map((key) => PRODUCTS[key].slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const key of PRODUCT_KEYS) {
      expect(productBySlug(PRODUCTS[key].slug)?.key).toBe(key);
      expect(isProductKey(key)).toBe(true);
    }
  });

  it("varje produkt har ett pris, moms, leveranstid och minst en bild", () => {
    for (const key of PRODUCT_KEYS) {
      const product = PRODUCTS[key];
      expect(product.fallbackPriceOre).toBeGreaterThan(0);
      expect(product.vatRatePercent).toBe(25);
      expect(product.delivery).toMatch(/3–4 veckor/);
      expect(product.images.length).toBeGreaterThan(0);
    }
  });

  it("nämner aldrig tillverkaren", () => {
    // Produkten säljs som Tikkrs. Tillverkarens namn hör till docs/kioskskarm.md.
    const text = JSON.stringify(PRODUCTS).toLowerCase();
    for (const name of ["prodvx", "appc", "fully", "promgr", "eet"]) {
      expect(text).not.toContain(name);
    }
  });

  it("okända nycklar är inga produkter", () => {
    expect(isProductKey("SKARM")).toBe(false);
    expect(isProductKey(undefined)).toBe(false);
    expect(productBySlug("finns-inte")).toBeNull();
  });
});

describe("raderna", () => {
  it("tar priset ur prislistan", () => {
    const [line] = priceLines([{ productKey: "STAMPLINGSSKARM", quantity: 2 }], PRICES);

    expect(line).toMatchObject({
      productKey: "STAMPLINGSSKARM",
      name: "Stämplingsskärm",
      unitPriceOre: 2_490_000,
      quantity: 2,
      subtotalOre: 4_980_000,
      vatRatePercent: 25,
      vatOre: 1_245_000,
    });
  });

  it("ett annat pris i listan ger ett annat belopp, och ingenting annat påverkar", () => {
    const [line] = priceLines(
      [{ productKey: "STAMPLINGSSKARM", quantity: 1 }],
      { STAMPLINGSSKARM: 1_990_000 }
    );
    expect(line.subtotalOre).toBe(1_990_000);
  });

  it("hoppar över noll", () => {
    expect(priceLines([{ productKey: "STAMPLINGSSKARM", quantity: 0 }], PRICES)).toEqual([]);
  });

  it("avvisar okända produkter, dubbletter och orimliga antal", () => {
    expect(() => priceLines([{ productKey: "SKARM", quantity: 1 }], PRICES)).toThrow(PricingError);
    expect(() =>
      priceLines(
        [
          { productKey: "STAMPLINGSSKARM", quantity: 1 },
          { productKey: "STAMPLINGSSKARM", quantity: 1 },
        ],
        PRICES
      )
    ).toThrow(PricingError);

    for (const quantity of [-1, 1.5, Number.NaN, PRODUCTS.STAMPLINGSSKARM.maxQuantity + 1]) {
      expect(() =>
        priceLines([{ productKey: "STAMPLINGSSKARM", quantity }], PRICES)
      ).toThrow(PricingError);
    }
  });

  it("vägrar sälja en produkt utan pris", () => {
    expect(() =>
      priceLines([{ productKey: "STAMPLINGSSKARM", quantity: 1 }], { STAMPLINGSSKARM: 0 })
    ).toThrow(PricingError);
  });
});

describe("summorna", () => {
  it("utan frakt: varor plus moms, frakten är okänd", () => {
    const lines = priceLines([{ productKey: "STAMPLINGSSKARM", quantity: 3 }], PRICES);

    expect(orderTotals(lines, null)).toEqual({
      goodsOre: 7_470_000,
      shippingOre: null,
      vatOre: 1_867_500,
      totalOre: 9_337_500,
    });
  });

  it("med frakt: frakten får moms och läggs till", () => {
    const lines = priceLines([{ productKey: "STAMPLINGSSKARM", quantity: 1 }], PRICES);

    expect(orderTotals(lines, 45_000)).toEqual({
      goodsOre: 2_490_000,
      shippingOre: 45_000,
      vatOre: 622_500 + 11_250,
      totalOre: 2_490_000 + 45_000 + 622_500 + 11_250,
    });
  });

  it("noll i frakt är ett pris, inte okänt", () => {
    const lines = priceLines([{ productKey: "STAMPLINGSSKARM", quantity: 1 }], PRICES);
    expect(orderTotals(lines, 0).shippingOre).toBe(0);
  });

  it("momsen avrundas per rad till hela ören", () => {
    expect(vatOf(101, 25)).toBe(25);
    expect(vatOf(102, 25)).toBe(26);
    expect(orderTotals([{ subtotalOre: 101, vatOre: 25 }, { subtotalOre: 101, vatOre: 25 }], null).vatOre).toBe(50);
  });

  it("räknar om ur de lagrade raderna, inte ur dagens pris", () => {
    // En beställning som lades för 19 900 behåller sin summa när frakten
    // sätts, även om priset sedan höjts.
    const stored = priceLines([{ productKey: "STAMPLINGSSKARM", quantity: 1 }], {
      STAMPLINGSSKARM: 1_990_000,
    });

    expect(orderTotals(stored, 0).goodsOre).toBe(1_990_000);
  });

  it("pris inklusive moms", () => {
    expect(withVat(2_490_000, 25)).toBe(3_112_500);
  });
});
