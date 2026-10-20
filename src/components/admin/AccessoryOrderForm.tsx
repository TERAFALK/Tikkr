"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  placeAccessoryOrder,
  type OrderFormState,
} from "@/app/admin/(panel)/installningar/tillbehor/actions";
import ProfileFields from "@/components/admin/ProfileFields";
import { Alert, Button } from "@/components/ui";
import { formatCurrency } from "@/lib/money";
import { vatOf } from "@/lib/shop/pricing";
import type { ProfileValues } from "@/lib/shop/profile";

export interface OrderableProduct {
  key: string;
  slug: string;
  name: string;
  summary: string;
  priceOre: number;
  vatRatePercent: number;
  maxQuantity: number;
  delivery: string;
  image: { src: string; alt: string; illustration: boolean } | null;
}

/**
 * BESTÄLLNINGSFORMULÄRET.
 *
 * Antal per produkt, leveransuppgifterna och en sammanställning. Beloppen
 * här är en förhandsvisning med samma räkning som servern använder
 * (pricing.ts), men det är servern som räknar beställningen. Ett belopp som
 * ändrats i webbläsaren påverkar ingenting.
 *
 * Nyckeln i det dolda fältet sattes när sidan ritades. Skickas formuläret
 * två gånger blir det en beställning, se placeOrder.
 */
export default function AccessoryOrderForm({
  products,
  profile,
  separateBilling,
  idempotencyKey,
  preselect,
}: {
  products: OrderableProduct[];
  profile: ProfileValues;
  separateBilling: boolean;
  idempotencyKey: string;
  /** Produkten man kom hit för, från butiken. Börjar på en. */
  preselect: string | null;
}) {
  const [state, submit] = useActionState<OrderFormState, FormData>(placeAccessoryOrder, {});

  // Ett fel ritar om formuläret med det som skrevs. Nyckeln byts, så att
  // fälten verkligen tar de skickade värdena och inte står kvar som de var.
  const attempt = state.error ? `${state.error}:${JSON.stringify(state.values)}` : "first";

  return (
    <form action={submit} className="space-y-6 p-5">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {state.error && <Alert>{state.error}</Alert>}

      <OrderBody
        key={attempt}
        products={products}
        profile={state.values ?? profile}
        separateBilling={state.separateBilling ?? separateBilling}
        initialQuantities={
          state.quantities ??
          Object.fromEntries(
            products.map((product) => [product.key, product.key === preselect ? "1" : "0"])
          )
        }
        saveProfile={state.saveProfile ?? true}
        fieldErrors={state.fieldErrors}
      />
    </form>
  );
}

function OrderBody({
  products,
  profile,
  separateBilling,
  initialQuantities,
  saveProfile,
  fieldErrors,
}: {
  products: OrderableProduct[];
  profile: ProfileValues;
  separateBilling: boolean;
  initialQuantities: Record<string, string>;
  saveProfile: boolean;
  fieldErrors?: OrderFormState["fieldErrors"];
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      products.map((product) => {
        const value = Number(initialQuantities[product.key] ?? 0);
        return [product.key, Number.isInteger(value) && value >= 0 ? value : 0];
      })
    )
  );

  const set = (key: string, value: number, max: number) =>
    setQuantities((current) => ({ ...current, [key]: Math.max(0, Math.min(max, value)) }));

  const chosen = products.filter((product) => (quantities[product.key] ?? 0) > 0);

  const goods = chosen.reduce((sum, p) => sum + p.priceOre * quantities[p.key], 0);
  const vat = chosen.reduce(
    (sum, p) => sum + vatOf(p.priceOre * quantities[p.key], p.vatRatePercent),
    0
  );

  return (
    <>
      <section aria-labelledby="order-products">
        <h3 id="order-products" className="mb-3 text-[13px] font-semibold text-neutral-900">
          Produkter
        </h3>

        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {products.map((product) => {
            const quantity = quantities[product.key] ?? 0;

            return (
              <li key={product.key} className="flex flex-wrap items-center gap-4 p-4">
                {product.image && (
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-md bg-neutral-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.image.src}
                      alt={product.image.alt}
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900">{product.name}</p>
                  <p className="mt-0.5 text-[13px] text-neutral-500">{product.summary}</p>
                  <p className="mt-1 text-[13px] text-neutral-700">
                    <span className="font-medium tabular-nums">
                      {formatCurrency(product.priceOre)}
                    </span>{" "}
                    exkl. moms ·{" "}
                    <a
                      href={`/tillbehor/${product.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="text-tick-deep underline-offset-2 hover:underline"
                    >
                      Om produkten
                    </a>
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    tone="secondary"
                    aria-label={`En ${product.name.toLowerCase()} färre`}
                    disabled={quantity === 0}
                    onClick={() => set(product.key, quantity - 1, product.maxQuantity)}
                  >
                    −
                  </Button>
                  <label className="sr-only" htmlFor={`qty-${product.key}`}>
                    Antal {product.name.toLowerCase()}
                  </label>
                  <input
                    id={`qty-${product.key}`}
                    name={`qty-${product.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={product.maxQuantity}
                    value={quantity}
                    onChange={(event) =>
                      set(product.key, Math.floor(Number(event.target.value) || 0), product.maxQuantity)
                    }
                    className="w-14 rounded-md border-0 px-2 py-1.5 text-center text-base tabular-nums ring-1 ring-inset ring-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-blue-600 sm:text-[13px]"
                  />
                  <Button
                    type="button"
                    tone="secondary"
                    aria-label={`En ${product.name.toLowerCase()} till`}
                    disabled={quantity >= product.maxQuantity}
                    onClick={() => set(product.key, quantity + 1, product.maxQuantity)}
                  >
                    +
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="order-details">
        <h3 id="order-details" className="sr-only">
          Leverans och faktura
        </h3>
        <ProfileFields
          values={profile}
          separateBilling={separateBilling}
          errors={fieldErrors}
          requireForOrder
        />

        <label className="mt-4 flex items-center gap-2 text-[13px] text-neutral-700">
          <input
            type="checkbox"
            name="saveProfile"
            defaultChecked={saveProfile}
            className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
          />
          Spara uppgifterna för kommande beställningar
        </label>
      </section>

      <section
        aria-labelledby="order-summary"
        className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-4"
      >
        <h3 id="order-summary" className="mb-2 text-[13px] font-semibold text-neutral-900">
          Sammanställning
        </h3>

        {chosen.length === 0 ? (
          <p className="text-[13px] text-neutral-500">Välj antal ovan.</p>
        ) : (
          <dl className="space-y-1 text-[13px]">
            {chosen.map((product) => (
              <SummaryRow
                key={product.key}
                label={`${quantities[product.key]} × ${product.name}`}
                value={formatCurrency(product.priceOre * quantities[product.key])}
              />
            ))}
            <SummaryRow label="Summa varor, exkl. moms" value={formatCurrency(goods)} />
            <SummaryRow label="Moms 25 %" value={formatCurrency(vat)} />
            <SummaryRow label="Summa inkl. moms" value={formatCurrency(goods + vat)} strong />
          </dl>
        )}

        <p className="mt-3 text-xs leading-relaxed text-neutral-500">
          Frakt tillkommer. Faktureras vid leverans.{" "}
          {[...new Set(chosen.map((product) => product.delivery))].join(" ")}
        </p>
      </section>

      <Submit disabled={chosen.length === 0} />
    </>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 ${
        strong ? "border-t border-neutral-200 pt-1.5 font-semibold text-neutral-900" : "text-neutral-700"
      }`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Skickar…" : "Skicka beställning"}
    </Button>
  );
}
