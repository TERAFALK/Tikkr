import { describe, expect, it } from "vitest";
import {
  cartCount,
  cartFromParams,
  cartItems,
  cartQuery,
  checkoutHref,
  checkoutHrefFor,
} from "@/lib/shop/cart";

/**
 * VARUKORGEN I ADRESSEN.
 *
 * Det som måste hålla:
 *   korgen går fram och tillbaka mellan adress och antal utan att ändras
 *   okända namn och orimliga antal tar sig inte in
 *
 * Behöver ingen databas.
 */

const PRODUCTS = [
  { key: "STAMPLINGSSKARM", slug: "stamplingsskarm", maxQuantity: 20 },
  { key: "UTBILDNING", slug: "utbildning", maxQuantity: 5 },
];

describe("varukorgen", () => {
  it("går fram och tillbaka genom adressen", () => {
    const cart = { STAMPLINGSSKARM: 2, UTBILDNING: 1 };
    const query = cartQuery(cart, PRODUCTS);

    expect(query).toBe("stamplingsskarm=2&utbildning=1");
    expect(cartFromParams(Object.fromEntries(new URLSearchParams(query)), PRODUCTS)).toEqual(cart);
    expect(checkoutHref(cart, PRODUCTS)).toBe("/admin/butik/kassa?stamplingsskarm=2&utbildning=1");
  });

  it("en tom korg ger ingen frågedel", () => {
    expect(cartQuery({}, PRODUCTS)).toBe("");
    expect(checkoutHref({}, PRODUCTS)).toBe("/admin/butik/kassa");
    expect(cartItems({})).toEqual([]);
    expect(cartCount({})).toBe(0);
  });

  it("hoppar över okända namn och orimliga antal", () => {
    expect(cartFromParams({ skarm: "2", stamplingsskarm: "abc" }, PRODUCTS)).toEqual({});
    expect(cartFromParams({ stamplingsskarm: "-1" }, PRODUCTS)).toEqual({});
    expect(cartFromParams({ stamplingsskarm: "1.5" }, PRODUCTS)).toEqual({});
  });

  it("stannar vid produktens högsta antal", () => {
    expect(cartFromParams({ utbildning: "500" }, PRODUCTS).UTBILDNING).toBe(5);
  });

  it("tar första värdet när namnet står två gånger", () => {
    expect(cartFromParams({ stamplingsskarm: ["3", "7"] }, PRODUCTS).STAMPLINGSSKARM).toBe(3);
  });

  it("räknar antal och rader", () => {
    const cart = { STAMPLINGSSKARM: 3, UTBILDNING: 0 };
    expect(cartCount(cart)).toBe(3);
    expect(cartItems(cart)).toEqual([{ productKey: "STAMPLINGSSKARM", quantity: 3 }]);
  });

  it("knapparna där behovet uppstår leder till kassan med en i korgen", () => {
    expect(checkoutHrefFor("stamplingsskarm")).toBe("/admin/butik/kassa?stamplingsskarm=1");
  });
});
