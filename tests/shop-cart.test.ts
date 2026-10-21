import { describe, expect, it } from "vitest";
import {
  cartCount,
  cartFromParams,
  cartItems,
  cartQuery,
  checkoutHref,
  emptyCart,
} from "@/lib/shop/cart";
import { PRODUCTS } from "@/lib/shop/catalog";
import { needsDelivery } from "@/lib/shop/pricing";

/**
 * VARUKORGEN I ADRESSEN.
 *
 * Det som måste hålla:
 *   korgen går fram och tillbaka mellan adress och antal utan att ändras
 *   okända namn och orimliga antal tar sig inte in
 *   kassan frågar efter leveransadress bara när något ska skickas
 *
 * Behöver ingen databas.
 */

describe("varukorgen", () => {
  it("går fram och tillbaka genom adressen", () => {
    const cart = { ...emptyCart(), STAMPLINGSSKARM: 2 };
    const query = cartQuery(cart);

    expect(query).toBe("stamplingsskarm=2");
    expect(cartFromParams(Object.fromEntries(new URLSearchParams(query)))).toEqual(cart);
    expect(checkoutHref(cart)).toBe("/admin/butik/kassa?stamplingsskarm=2");
  });

  it("en tom korg ger ingen frågedel", () => {
    expect(cartQuery(emptyCart())).toBe("");
    expect(checkoutHref(emptyCart())).toBe("/admin/butik/kassa");
    expect(cartItems(emptyCart())).toEqual([]);
    expect(cartCount(emptyCart())).toBe(0);
  });

  it("hoppar över okända namn och orimliga antal", () => {
    expect(cartFromParams({ skarm: "2", stamplingsskarm: "abc" })).toEqual(emptyCart());
    expect(cartFromParams({ stamplingsskarm: "-1" })).toEqual(emptyCart());
    expect(cartFromParams({ stamplingsskarm: "1.5" })).toEqual(emptyCart());
  });

  it("stannar vid produktens högsta antal", () => {
    const max = PRODUCTS.STAMPLINGSSKARM.maxQuantity;
    expect(cartFromParams({ stamplingsskarm: "500" }).STAMPLINGSSKARM).toBe(max);
  });

  it("tar första värdet när namnet står två gånger", () => {
    expect(cartFromParams({ stamplingsskarm: ["3", "7"] }).STAMPLINGSSKARM).toBe(3);
  });

  it("räknar antal och rader", () => {
    const cart = { ...emptyCart(), STAMPLINGSSKARM: 3 };
    expect(cartCount(cart)).toBe(3);
    expect(cartItems(cart)).toEqual([{ productKey: "STAMPLINGSSKARM", quantity: 3 }]);
  });
});

describe("leveransen", () => {
  it("en vara ska skickas", () => {
    expect(PRODUCTS.STAMPLINGSSKARM.kind).toBe("GOODS");
    expect(needsDelivery([{ productKey: "STAMPLINGSSKARM" }])).toBe(true);
  });

  it("en okänd produkt räknas som en vara, så att ingen adress tappas", () => {
    expect(needsDelivery([{ productKey: "OKAND" }])).toBe(true);
  });

  it("ingenting att skicka utan rader", () => {
    expect(needsDelivery([])).toBe(false);
  });
});
