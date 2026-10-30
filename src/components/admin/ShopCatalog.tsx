"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui";
import { formatCurrency } from "@/lib/money";
import { cartCount, cartQuery, checkoutHref, type Cart } from "@/lib/shop/cart";
import { KIND_LABEL, type ProductKind } from "@/lib/shop/catalog";

export interface ShopProduct {
  key: string;
  kind: ProductKind;
  slug: string;
  name: string;
  summary: string;
  priceOre: number;
  maxQuantity: number;
  delivery: string;
  image: { src: string; alt: string; illustration: boolean } | null;
  /** Har en egen sida på säljsidan, som Om produkten leder till. */
  onSite: boolean;
}

/**
 * BUTIKENS PRODUKTER, OCH VARUKORGEN.
 *
 * Ett kort per produkt, grupperade som varor och tjänster. Lägg till gör
 * knappen till ett antal. Varukorgen står i adressen (cart.ts), så att den
 * följer med tillbaka från kassan och överlever en omladdning.
 *
 * Beloppen här är en förhandsvisning. Kassan räknar på servern.
 */
export default function ShopCatalog({
  products,
  initialCart,
  canOrder,
}: {
  products: ShopProduct[];
  initialCart: Cart;
  /** Bara ägaren beställer. Andra ser produkterna men lägger inget i korgen. */
  canOrder: boolean;
}) {
  const [cart, setCart] = useState<Cart>(initialCart);
  const router = useRouter();
  const pathname = usePathname();

  const update = (key: string, quantity: number, max: number) => {
    const next = { ...cart, [key]: Math.max(0, Math.min(max, quantity)) };
    setCart(next);

    // Adressen följer korgen, utan att sidan laddas om eller hoppar.
    const query = cartQuery(next, products);
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  };

  const count = cartCount(cart);
  const goods = products.reduce((sum, p) => sum + p.priceOre * (cart[p.key] ?? 0), 0);

  const kinds = (Object.keys(KIND_LABEL) as ProductKind[]).filter((kind) =>
    products.some((product) => product.kind === kind)
  );

  return (
    <div>
      {!canOrder && (
        <p className="mb-6 text-[13px] text-neutral-500">Arbetsytans ägare beställer.</p>
      )}

      <div className="space-y-10">
        {kinds.map((kind) => (
          <section key={kind} aria-labelledby={`kind-${kind}`}>
            <h2
              id={`kind-${kind}`}
              className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-neutral-500"
            >
              {KIND_LABEL[kind]}
            </h2>

            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {products
                .filter((product) => product.kind === kind)
                .map((product) => {
                  const quantity = cart[product.key] ?? 0;

                  return (
                    <li
                      key={product.key}
                      className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white"
                    >
                      {product.image && (
                        <div className="relative aspect-[4/3] bg-neutral-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={product.image.src}
                            alt={product.image.alt}
                            className="h-full w-full object-contain"
                          />
                          {product.image.illustration && (
                            <span className="absolute bottom-2 left-2 rounded bg-white/90 px-1.5 py-0.5 text-[11px] text-neutral-500 ring-1 ring-neutral-200">
                              Illustration
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="text-sm font-semibold text-neutral-900">{product.name}</h3>
                        <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
                          {product.summary}
                        </p>
                        <p className="mt-3 text-[13px] text-neutral-900">
                          <span className="font-semibold tabular-nums">
                            {formatCurrency(product.priceOre)}
                          </span>{" "}
                          <span className="text-neutral-500">exkl. moms</span>
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">{product.delivery}</p>

                        <div className="mt-4 flex flex-1 items-end justify-between gap-3">
                          {product.onSite ? (
                            <a
                              href={`/tillbehor/${product.slug}`}
                              target="_blank"
                              rel="noopener"
                              className="text-[13px] text-link underline-offset-2 hover:underline"
                            >
                              Om produkten
                            </a>
                          ) : (
                            <span />
                          )}

                          {canOrder &&
                            (quantity === 0 ? (
                              <Button
                                type="button"
                                tone="secondary"
                                onClick={() => update(product.key, 1, product.maxQuantity)}
                              >
                                Lägg till
                              </Button>
                            ) : (
                              <Stepper
                                name={product.name}
                                quantity={quantity}
                                max={product.maxQuantity}
                                onChange={(value) =>
                                  update(product.key, value, product.maxQuantity)
                                }
                              />
                            ))}
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>

      {/* VARUKORGEN SVÄVAR NEDERST, med luft runt om.

          `sticky` och inte `fixed`. Panelens sidbyte tonar in innehållet med
          en förflyttning (`.panel-content > *` i globals.css), och ett
          element med en förflyttning gör att `fixed` räknas mot det i
          stället för mot fönstret. Listen hamnade då längst ner på sidan,
          och den som tryckt Lägg till fick skrolla för att hitta den.
          `sticky` står fast nederst i fönstret oavsett. */}
      {canOrder && count > 0 && (
        <div className="sticky bottom-4 z-30 mt-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-neutral-200 bg-white/95 px-5 py-3 shadow-[0_12px_32px_-12px_rgba(14,26,43,0.35)] backdrop-blur">
            <p className="text-[13px] text-neutral-700">
              <span className="font-semibold text-neutral-900">
                {count} {count === 1 ? "produkt" : "produkter"}
              </span>{" "}
              · <span className="tabular-nums">{formatCurrency(goods)}</span> exkl. moms
            </p>
            <ButtonLink href={checkoutHref(cart, products)} className="ml-auto">
              Till kassan
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({
  name,
  quantity,
  max,
  onChange,
}: {
  name: string;
  quantity: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const label = name.toLowerCase();

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        tone="secondary"
        aria-label={`En ${label} färre`}
        onClick={() => onChange(quantity - 1)}
      >
        −
      </Button>
      <span className="w-8 text-center text-[13px] font-semibold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <Button
        type="button"
        tone="secondary"
        aria-label={`En ${label} till`}
        disabled={quantity >= max}
        onClick={() => onChange(quantity + 1)}
      >
        +
      </Button>
    </div>
  );
}

/** Länk tillbaka till butiken med samma korg, från kassan. */
export function BackToShop({
  cart,
  products,
}: {
  cart: Cart;
  products: { key: string; slug: string; maxQuantity: number }[];
}) {
  const query = cartQuery(cart, products);
  return (
    <Link
      href={`/admin/butik${query ? `?${query}` : ""}`}
      className="text-[13px] font-medium text-link hover:underline"
    >
      Ändra
    </Link>
  );
}
