import { PRODUCT_KEYS, PRODUCTS, type ProductKey } from "./catalog";

/**
 * VARUKORGEN STÅR I ADRESSEN.
 *
 * `/admin/butik/kassa?stamplingsskarm=2`. Produktens adressnamn är nyckeln och
 * antalet värdet. Ingen lagring behövs, varken i databasen eller i
 * webbläsaren: en varukorg som står i adressen går att backa ur, ladda om och
 * länka till, som knappen på sidan Stämplingsskärmar gör.
 *
 * Adressen är bara ett förslag. Antalet prövas igen när beställningen läggs,
 * och priset kommer aldrig härifrån.
 *
 * Inga databasanrop och inga React-beroenden, så att både sidorna och
 * klientkomponenterna kan använda den.
 */

export type Cart = Record<ProductKey, number>;

export function emptyCart(): Cart {
  return Object.fromEntries(PRODUCT_KEYS.map((key) => [key, 0])) as Cart;
}

/**
 * Varukorgen ur adressens parametrar.
 *
 * Okända namn hoppas över. Ett antal som inte är ett heltal blir noll, och
 * ett för stort stannar vid produktens högsta: kunden ser sammanställningen
 * innan något beställs, och en sida som vägrar visas för att någon skrivit
 * 50 i adressfältet hjälper ingen.
 */
export function cartFromParams(
  params: Record<string, string | string[] | undefined>
): Cart {
  const cart = emptyCart();

  for (const key of PRODUCT_KEYS) {
    const product = PRODUCTS[key];
    const raw = params[product.slug];
    const value = Number(Array.isArray(raw) ? raw[0] : raw);

    if (Number.isInteger(value) && value > 0) {
      cart[key] = Math.min(value, product.maxQuantity);
    }
  }

  return cart;
}

/** Adressens frågedel för en varukorg, utan frågetecken. Tom korg ger "". */
export function cartQuery(cart: Partial<Cart>): string {
  const query = new URLSearchParams();

  for (const key of PRODUCT_KEYS) {
    const quantity = cart[key] ?? 0;
    if (quantity > 0) query.set(PRODUCTS[key].slug, String(quantity));
  }

  return query.toString();
}

export function cartCount(cart: Partial<Cart>): number {
  return PRODUCT_KEYS.reduce((sum, key) => sum + (cart[key] ?? 0), 0);
}

export function cartItems(cart: Partial<Cart>): { productKey: ProductKey; quantity: number }[] {
  return PRODUCT_KEYS.filter((key) => (cart[key] ?? 0) > 0).map((key) => ({
    productKey: key,
    quantity: cart[key]!,
  }));
}

/** Adressen till kassan med en varukorg, t.ex. från knappen på Stämplingsskärmar. */
export function checkoutHref(cart: Partial<Cart>): string {
  const query = cartQuery(cart);
  return `/admin/butik/kassa${query ? `?${query}` : ""}`;
}
