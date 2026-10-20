import { randomUUID } from "node:crypto";
import { isOwner, requireAdmin } from "@/lib/admin-session";
import { formatDate } from "@/lib/format";
import { formatCurrency } from "@/lib/money";
import { allProducts, productBySlug } from "@/lib/shop/catalog";
import { customerOrders, type CustomerOrder } from "@/lib/shop/orders";
import { shopPrices } from "@/lib/shop/prices";
import { profileToValues } from "@/lib/shop/profile";
import { PAYMENT_LABEL, STATUS_LABEL, orderLabel } from "@/lib/shop/status";
import AccessoryOrderForm from "@/components/admin/AccessoryOrderForm";
import { Alert, Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import type { ShopOrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tillbehör · Tikkr" };

/**
 * TILLBEHÖR: beställa och följa sina beställningar.
 *
 * Alla administratörer ser produkterna och beställningarna. Bara ägaren får
 * formuläret, och åtgärden bakom det prövar ägaren själv, se actions.ts.
 *
 * Säljsidans Beställ-knapp leder hit genom inloggningen, med produkten i
 * adressen (`?produkt=stamplingsskarm`), så att den man kom för redan står
 * på en.
 */
export default async function AccessoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ produkt?: string; bestallning?: string }>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;

  const [profile, prices, orders] = await Promise.all([
    session.db.companyProfile.findFirst(),
    shopPrices(),
    customerOrders(session.db),
  ]);

  const products = allProducts().map((product) => ({
    key: product.key,
    slug: product.slug,
    name: product.name,
    summary: product.summary,
    priceOre: prices[product.key],
    vatRatePercent: product.vatRatePercent,
    maxQuantity: product.maxQuantity,
    delivery: product.delivery,
    image: product.images[0] ?? null,
  }));

  const form = profileToValues(profile);
  const preselect = params.produkt ? (productBySlug(params.produkt)?.key ?? null) : null;

  const placedNumber = Number(params.bestallning);
  const placed = Number.isInteger(placedNumber)
    ? orders.find((order) => order.number === placedNumber)
    : undefined;

  const canOrder = isOwner(session) && !session.support;

  return (
    <div className="space-y-6">
      {placed && (
        <Alert tone="info">
          {orderLabel(placed.number)} är skickad. Orderbekräftelsen går till{" "}
          {placed.email}.
        </Alert>
      )}

      <Card>
        <CardHeader title="Beställ" />
        {canOrder ? (
          <AccessoryOrderForm
            products={products}
            profile={form.values}
            separateBilling={form.separateBilling}
            idempotencyKey={randomUUID()}
            preselect={preselect}
          />
        ) : (
          <div className="space-y-4 p-5">
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
              {products.map((product) => (
                <li key={product.key} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{product.name}</p>
                    <p className="text-[13px] text-neutral-500">{product.summary}</p>
                  </div>
                  <p className="text-[13px] tabular-nums text-neutral-700">
                    {formatCurrency(product.priceOre)} exkl. moms
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-neutral-500">
              Arbetsytans ägare beställer.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Beställningar" />
        {orders.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Inga beställningar" />
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {orders.map((order) => (
              <OrderItem key={order.id} order={order} open={order.number === placed?.number} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const TONE: Record<ShopOrderStatus, "neutral" | "active" | "warning" | "muted"> = {
  RECEIVED: "neutral",
  CONFIRMED: "neutral",
  IN_PRODUCTION: "neutral",
  READY: "neutral",
  SHIPPED: "active",
  DELIVERED: "muted",
  CANCELED: "muted",
  PROBLEM: "warning",
};

function OrderItem({ order, open }: { order: CustomerOrder; open: boolean }) {
  const lines = order.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ");
  const shippingKnown = order.shippingOre !== null;

  return (
    <li>
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-neutral-50/70">
          <span className="text-[13px] font-semibold text-neutral-900">
            {orderLabel(order.number)}
          </span>
          <span className="text-[13px] text-neutral-500">{formatDate(order.createdAt)}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-700">{lines}</span>
          <Badge tone={TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
        </summary>

        <div className="grid gap-6 px-5 pb-5 pt-1 text-[13px] md:grid-cols-2">
          <div>
            <dl className="space-y-1">
              {order.lines.map((line, index) => (
                <Row
                  key={index}
                  label={`${line.quantity} × ${line.name}`}
                  value={formatCurrency(line.subtotalOre)}
                />
              ))}
              <Row label="Summa varor, exkl. moms" value={formatCurrency(order.goodsOre)} />
              <Row
                label={shippingKnown ? "Frakt, exkl. moms" : "Frakt"}
                value={shippingKnown ? formatCurrency(order.shippingOre!) : "Tillkommer"}
              />
              <Row label="Moms" value={formatCurrency(order.vatOre)} />
              <Row
                label={shippingKnown ? "Totalt inkl. moms" : "Summa inkl. moms, exkl. frakt"}
                value={formatCurrency(order.totalOre)}
                strong
              />
            </dl>

            {(order.paymentStatus === "INVOICED" || order.paymentStatus === "PAID") && (
              <p className="mt-3 text-neutral-500">{PAYMENT_LABEL[order.paymentStatus]}</p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="font-medium text-neutral-900">Leverans</p>
              <p className="mt-1 leading-relaxed text-neutral-600">
                {order.contactName}
                <br />
                {order.addressLine}
                <br />
                {order.postalCode} {order.city}
                {order.reference && (
                  <>
                    <br />
                    Märkning: {order.reference}
                  </>
                )}
              </p>
              {(order.carrier || order.trackingUrl) && (
                <p className="mt-2 text-neutral-600">
                  {order.carrier}
                  {order.carrier && order.trackingUrl && " · "}
                  {order.trackingUrl && (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-tick-deep underline-offset-2 hover:underline"
                    >
                      Följ leveransen
                    </a>
                  )}
                </p>
              )}
            </div>

            <div>
              <p className="font-medium text-neutral-900">Historik</p>
              <ol className="mt-1 space-y-1.5">
                {order.events.map((event, index) => (
                  <li key={index} className="text-neutral-600">
                    <span className="tabular-nums text-neutral-500">{formatDate(event.createdAt)}</span>{" "}
                    {event.toStatus ? STATUS_LABEL[event.toStatus as ShopOrderStatus] : ""}
                    {event.customerMessage && (
                      <span className="mt-0.5 block whitespace-pre-line text-neutral-700">
                        {event.customerMessage}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </details>
    </li>
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
