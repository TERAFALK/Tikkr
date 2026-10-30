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
 * Produkterna kommer som argument, så att filen saknar databasanrop och
 * React-beroenden och kan användas av både sidorna och klientkomponenterna.
 */

/** Antal per produktnyckel. Saknad nyckel betyder noll. */
export type Cart = Record<string, number>;

interface CartProduct {
  key: string;
  slug: string;
  maxQuantity: number;
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
  params: Record<string, string | string[] | undefined>,
  products: CartProduct[]
): Cart {
  const cart: Cart = {};

  for (const product of products) {
    const raw = params[product.slug];
    const value = Number(Array.isArray(raw) ? raw[0] : raw);

    if (Number.isInteger(value) && value > 0) {
      cart[product.key] = Math.min(value, product.maxQuantity);
    }
  }

  return cart;
}

/** Adressens frågedel för en varukorg, utan frågetecken. Tom korg ger "". */
export function cartQuery(cart: Cart, products: CartProduct[]): string {
  const query = new URLSearchParams();

  for (const product of products) {
    const quantity = cart[product.key] ?? 0;
    if (quantity > 0) query.set(product.slug, String(quantity));
  }

  return query.toString();
}

export function cartCount(cart: Cart): number {
  return Object.values(cart).reduce((sum, quantity) => sum + (quantity > 0 ? quantity : 0), 0);
}

export function cartItems(cart: Cart): { productKey: string; quantity: number }[] {
  return Object.entries(cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([productKey, quantity]) => ({ productKey, quantity }));
}

/**
 * Adressen till kassan med en produkt i korgen, efter dess adressnamn.
 * Används av knapparna där behovet uppstår, som inte känner produkternas
 * nycklar.
 */
export function checkoutHrefFor(slug: string, quantity = 1): string {
  return `/admin/butik/kassa?${new URLSearchParams({ [slug]: String(quantity) })}`;
}

/** Adressen till kassan med en hel varukorg. */
export function checkoutHref(cart: Cart, products: CartProduct[]): string {
  const query = cartQuery(cart, products);
  return `/admin/butik/kassa${query ? `?${query}` : ""}`;
}
