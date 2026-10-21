import { randomUUID } from "node:crypto";
import { isOwner, requireAdmin } from "@/lib/admin-session";
import { formatCurrency } from "@/lib/money";
import { cartFromParams, cartItems } from "@/lib/shop/cart";
import { PRODUCTS } from "@/lib/shop/catalog";
import { shopPrices } from "@/lib/shop/prices";
import {
  needsDelivery,
  orderTotals,
  priceLines,
  PricingError,
  type PricedLine,
} from "@/lib/shop/pricing";
import { profileToValues } from "@/lib/shop/profile";
import CheckoutForm from "@/components/admin/CheckoutForm";
import { BackToShop } from "@/components/admin/ShopCatalog";
import { Alert, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kassa · Butik · Tikkr" };

/**
 * KASSAN.
 *
 * Varukorgen kommer ur adressen och räknas här, på servern, med samma
 * prislista som beställningen sedan räknas med. Säljsidans Beställ och
 * knappen på Stämplingsskärmar leder hit med en skärm i korgen.
 *
 * Leveransadressen efterfrågas bara när något i korgen ska skickas. Med
 * bara tjänster är adressen fakturaadressen.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const [params, prices, profile] = await Promise.all([
    searchParams,
    shopPrices(),
    session.db.companyProfile.findFirst(),
  ]);

  const cart = cartFromParams(params);
  const items = cartItems(cart);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Varukorgen är tom"
        action={<ButtonLink href="/admin/butik">Till produkterna</ButtonLink>}
      />
    );
  }

  let lines: PricedLine[];
  try {
    lines = priceLines(items, prices);
  } catch (error) {
    if (!(error instanceof PricingError)) throw error;
    return (
      <div className="max-w-xl space-y-4">
        <Alert>{error.message}</Alert>
        <ButtonLink href="/admin/butik" tone="secondary">
          Till produkterna
        </ButtonLink>
      </div>
    );
  }

  const delivery = needsDelivery(lines);
  const totals = orderTotals(lines, null);
  const form = profileToValues(profile);
  const canOrder = isOwner(session) && !session.support;

  const deliveryTexts = [...new Set(lines.map((line) => PRODUCTS[line.productKey].delivery))];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="lg:order-2 lg:sticky lg:top-6">
        <CardHeader title="Varukorg" action={<BackToShop cart={cart} />} />
        <dl className="space-y-1.5 px-5 py-4 text-[13px]">
          {lines.map((line) => (
            <Row
              key={line.productKey}
              label={`${line.quantity} × ${line.name}`}
              value={formatCurrency(line.subtotalOre)}
            />
          ))}
          <Row label="Summa, exkl. moms" value={formatCurrency(totals.goodsOre)} />
          <Row label="Moms 25 %" value={formatCurrency(totals.vatOre)} />
          <Row
            label={delivery ? "Summa inkl. moms, exkl. frakt" : "Totalt inkl. moms"}
            value={formatCurrency(totals.totalOre)}
            strong
          />
        </dl>
        <div className="space-y-1 border-t border-neutral-100 px-5 py-3 text-xs leading-relaxed text-neutral-500">
          {delivery && <p>Frakt tillkommer. Faktureras vid leverans.</p>}
          {deliveryTexts.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      </Card>

      <Card className="lg:order-1">
        <CardHeader title={delivery ? "Leverans och faktura" : "Faktura"} />
        {canOrder ? (
          <CheckoutForm
            quantities={lines.map((line) => ({ key: line.productKey, quantity: line.quantity }))}
            profile={form.values}
            separateBilling={form.separateBilling}
            idempotencyKey={randomUUID()}
            delivery={delivery}
          />
        ) : (
          <p className="p-5 text-[13px] text-neutral-500">Arbetsytans ägare beställer.</p>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
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
