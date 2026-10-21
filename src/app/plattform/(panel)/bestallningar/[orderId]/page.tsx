import Link from "next/link";
import { notFound } from "next/navigation";
import type { ShopEmailState, ShopEventKind, ShopOrderStatus } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  getShopOrder,
  MAX_CARRIER,
  MAX_CUSTOMER_MESSAGE,
  MAX_INVOICE_NUMBER,
  MAX_NOTE,
  MAX_TRACKING_URL,
  type ShopOrderDetail,
} from "@/lib/shop/admin";
import {
  allowedNext,
  allowedPaymentNext,
  orderLabel,
  PAYMENT_LABEL,
  STATUS_LABEL,
} from "@/lib/shop/status";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatCurrency } from "@/lib/money";
import { needsDelivery } from "@/lib/shop/pricing";
import { formatPhone } from "@/lib/phone";
import { toDateInput } from "@/lib/time-zone";
import ActionDialog from "@/components/ui/ActionDialog";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Textarea,
  Th,
  Tr,
} from "@/components/ui";
import {
  addNoteAction,
  changeStatusAction,
  resendEmailAction,
  setPaymentAction,
  setShippingAction,
  type ShopFormState,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beställning · Tikkr" };

const ZONE = "Europe/Stockholm";

/**
 * EN BESTÄLLNING, MED ALLT VI BEHÖVER FÖR ATT HANTERA DEN.
 *
 * Kunduppgifterna är beställningens ögonblicksbild, inte företagets uppgifter
 * idag. Det är dem fakturan och leveransen ska gå till.
 *
 * Interna anteckningar står för sig och följer aldrig med till kunden.
 */
export default async function ShopOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requirePlatformAdmin();
  const { orderId } = await params;

  const order = await getShopOrder(orderId);
  if (!order) notFound();

  const next = allowedNext(order.status);
  const paymentNext = allowedPaymentNext(order.paymentStatus);
  const shipped = order.status === "SHIPPED" || order.status === "DELIVERED";

  return (
    <>
      <PageHeader
        title={orderLabel(order.number)}
        description={`${order.companyName} · lagd ${formatDateTime(order.createdAt)} av ${order.placedByEmail}`}
        action={
          <Link
            href={`/plattform/kunder/${order.companyId}`}
            className="text-[13px] font-medium text-tick-deep hover:underline"
          >
            Till kunden
          </Link>
        }
      />

      {shipped && order.paymentStatus === "NOT_INVOICED" && (
        <div className="mb-6">
          <Alert tone="warning">
            Beställningen är skickad men inte fakturerad. Fakturera i Fortnox och
            ange fakturanumret under Betalning.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Status"
              action={
                next.length > 0 && (
                  <ActionDialog<ShopFormState>
                    trigger="Ändra status"
                    title="Ändra status"
                    action={changeStatusAction}
                    initial={{}}
                    submitLabel="Ändra"
                  >
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="from" value={order.status} />
                    <Field label="Ny status">
                      <Select name="to" defaultValue={next[0]}>
                        {next.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABEL[status]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label="Meddelande till kunden"
                      hint="Krävs vid Kräver åtgärd. Kunden får mejl vid Bekräftad, Under tillverkning, Skickad, Avbruten och Kräver åtgärd"
                    >
                      <Textarea name="message" rows={4} maxLength={MAX_CUSTOMER_MESSAGE} />
                    </Field>
                  </ActionDialog>
                )
              }
            />
            <div className="flex flex-wrap gap-x-8 gap-y-3 px-5 py-4 text-[13px]">
              <Labelled label="Beställning">
                <Badge tone={order.status === "PROBLEM" ? "warning" : "neutral"}>
                  {STATUS_LABEL[order.status]}
                </Badge>
              </Labelled>
              <Labelled label="Betalning">
                <Badge>{PAYMENT_LABEL[order.paymentStatus]}</Badge>
              </Labelled>
            </div>
          </Card>

          <Lines order={order} />

          <Card>
            <CardHeader title="Historik" />
            <ol className="divide-y divide-neutral-100">
              {order.events.map((event) => (
                <li key={event.id} className="px-5 py-3 text-[13px]">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="tabular-nums text-neutral-500">
                      {formatDateTime(event.createdAt)}
                    </span>
                    <span className="font-medium text-neutral-900">
                      {eventTitle(event.kind, event.fromStatus, event.toStatus)}
                    </span>
                    <span className="text-neutral-500">{event.actorEmail}</span>
                    {event.emailState && <EmailBadge state={event.emailState} />}
                  </div>
                  {event.detail && <p className="mt-1 text-neutral-600">{event.detail}</p>}
                  {event.customerMessage && (
                    <p className="mt-1 whitespace-pre-line rounded-md bg-neutral-50 px-3 py-2 text-neutral-700">
                      {event.customerMessage}
                    </p>
                  )}
                  {event.emailState === "FAILED" && (
                    <form action={resendEmailAction} className="mt-2 flex flex-wrap items-center gap-3">
                      <input type="hidden" name="eventId" value={event.id} />
                      <span className="text-xs text-red-700">{event.emailError}</span>
                      <Button type="submit" tone="secondary">
                        Skicka igen
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Customer order={order} />

          <Card>
            <CardHeader
              title="Leverans"
              action={
                <ActionDialog<ShopFormState>
                  trigger="Ändra"
                  title="Ändra leverans"
                  action={setShippingAction}
                  initial={{}}
                  submitLabel="Spara"
                >
                  <input type="hidden" name="orderId" value={order.id} />
                  <Field label="Transportör">
                    <Input name="carrier" defaultValue={order.carrier ?? ""} maxLength={MAX_CARRIER} />
                  </Field>
                  <Field label="Spårningslänk" hint="Börjar med https://">
                    <Input
                      name="trackingUrl"
                      type="url"
                      defaultValue={order.trackingUrl ?? ""}
                      maxLength={MAX_TRACKING_URL}
                    />
                  </Field>
                  <Field
                    label="Frakt, kr exkl. moms"
                    hint={
                      order.paymentStatus === "NOT_INVOICED"
                        ? "Tomt betyder inte satt. Totalen räknas om"
                        : "Fakturerad. Frakten ändras i Fortnox"
                    }
                  >
                    <Input
                      name="shipping"
                      inputMode="decimal"
                      defaultValue={
                        order.shippingOre === null
                          ? ""
                          : (order.shippingOre / 100).toFixed(2).replace(".", ",")
                      }
                      readOnly={order.paymentStatus !== "NOT_INVOICED"}
                    />
                  </Field>
                </ActionDialog>
              }
            />
            <dl className="divide-y divide-neutral-100 text-[13px]">
              <Row label="Transportör" value={order.carrier ?? "Inte angiven"} />
              <Row
                label="Spårning"
                value={
                  order.trackingUrl ? (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-tick-deep hover:underline"
                    >
                      Öppna
                    </a>
                  ) : (
                    "Ingen länk"
                  )
                }
              />
              <Row
                label="Frakt"
                value={order.shippingOre === null ? "Inte satt" : formatCurrency(order.shippingOre)}
              />
              {order.shippedAt && <Row label="Skickad" value={formatDate(order.shippedAt)} />}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Betalning"
              action={
                paymentNext.length > 0 && (
                  <ActionDialog<ShopFormState>
                    trigger="Ändra"
                    title="Ändra betalning"
                    action={setPaymentAction}
                    initial={{}}
                    submitLabel="Spara"
                  >
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="from" value={order.paymentStatus} />
                    <Field label="Ny betalstatus">
                      <Select name="to" defaultValue={paymentNext[0]}>
                        {paymentNext.map((status) => (
                          <option key={status} value={status}>
                            {PAYMENT_LABEL[status]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {order.paymentStatus === "NOT_INVOICED" && (
                      <Field label="Fakturanummer i Fortnox">
                        <Input name="invoiceNumber" maxLength={MAX_INVOICE_NUMBER} />
                      </Field>
                    )}
                    <Field
                      label="Datum"
                      hint="Fakturadatum vid Fakturerad, betaldatum vid Betald"
                    >
                      <Input
                        name="date"
                        type="date"
                        defaultValue={toDateInput(new Date(), ZONE)}
                      />
                    </Field>
                  </ActionDialog>
                )
              }
            />
            <dl className="divide-y divide-neutral-100 text-[13px]">
              <Row label="Status" value={PAYMENT_LABEL[order.paymentStatus]} />
              {order.invoiceNumber && <Row label="Faktura" value={order.invoiceNumber} />}
              {order.invoicedAt && <Row label="Fakturadatum" value={formatDate(order.invoicedAt)} />}
              {order.paidAt && <Row label="Betald" value={formatDate(order.paidAt)} />}
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Interna anteckningar"
              action={
                <ActionDialog<ShopFormState>
                  trigger="Ny anteckning"
                  title="Ny anteckning"
                  description="Syns bara här."
                  action={addNoteAction}
                  initial={{}}
                  submitLabel="Spara"
                >
                  <input type="hidden" name="orderId" value={order.id} />
                  <Field label="Anteckning">
                    <Textarea name="body" rows={5} maxLength={MAX_NOTE} required />
                  </Field>
                </ActionDialog>
              }
            />
            {order.notes.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-neutral-500">Inga anteckningar</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {order.notes.map((note) => (
                  <li key={note.id} className="px-5 py-3 text-[13px]">
                    <p className="text-xs text-neutral-500">
                      {formatDateTime(note.createdAt)} · {note.authorEmail}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-neutral-800">
                      {note.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Lines({ order }: { order: ShopOrderDetail }) {
  const shippingKnown = order.shippingOre !== null;

  return (
    <Card>
      <CardHeader title="Innehåll" />
      <Table>
        <thead>
          <tr>
            <Th>Produkt</Th>
            <Th numeric>Antal</Th>
            <Th numeric>À-pris exkl. moms</Th>
            <Th numeric>Summa exkl. moms</Th>
            <Th numeric>Moms</Th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <Tr key={line.id}>
              <Td>{line.name}</Td>
              <Td numeric>{line.quantity}</Td>
              <Td numeric>{formatCurrency(line.unitPriceOre)}</Td>
              <Td numeric>{formatCurrency(line.subtotalOre)}</Td>
              <Td numeric muted>
                {formatCurrency(line.vatOre)} ({line.vatRatePercent} %)
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <dl className="space-y-1 border-t border-neutral-200 px-5 py-4 text-[13px]">
        <SumRow label="Summa varor, exkl. moms" value={formatCurrency(order.goodsOre)} />
        <SumRow
          label="Frakt, exkl. moms"
          value={shippingKnown ? formatCurrency(order.shippingOre!) : "Inte satt"}
        />
        <SumRow label="Moms" value={formatCurrency(order.vatOre)} />
        <SumRow
          label={shippingKnown ? "Totalt inkl. moms" : "Totalt inkl. moms, exkl. frakt"}
          value={formatCurrency(order.totalOre)}
          strong
        />
      </dl>
    </Card>
  );
}

function Customer({ order }: { order: ShopOrderDetail }) {
  const separateBilling = Boolean(order.billingAddressLine);
  // Med bara tjänster finns inget att skicka, och adressen är fakturans.
  const ships = needsDelivery(order.lines);

  return (
    <Card>
      <CardHeader title="Kund" />
      <dl className="divide-y divide-neutral-100 text-[13px]">
        <Row label="Företag" value={order.companyName} />
        <Row label="Organisationsnummer" value={order.orgNumber} />
        <Row label="Kontaktperson" value={order.contactName} />
        <Row
          label="E-post"
          value={
            <a href={`mailto:${order.email}`} className="text-tick-deep hover:underline">
              {order.email}
            </a>
          }
        />
        <Row label="Telefon" value={formatPhone(order.phone)} />
        <Row
          label={ships ? "Leveransadress" : "Adress"}
          value={
            <>
              {order.addressLine}
              <br />
              {order.postalCode} {order.city}
              <br />
              {order.country}
            </>
          }
        />
        {order.reference && <Row label="Märkning" value={order.reference} />}
        {ships && (
          <Row
            label="Fakturaadress"
            value={
              separateBilling ? (
                <>
                  {order.billingAddressLine}
                  <br />
                  {order.billingPostalCode} {order.billingCity}
                </>
              ) : (
                "Samma som leveransadressen"
              )
            }
          />
        )}
        {order.invoiceEmail && <Row label="E-post för faktura" value={order.invoiceEmail} />}
      </dl>
    </Card>
  );
}

const KIND_LABEL: Record<ShopEventKind, string> = {
  CREATED: "Lagd",
  STATUS: "Status",
  PAYMENT: "Betalning",
  SHIPPING: "Leverans",
};

function eventTitle(kind: ShopEventKind, from: string | null, to: string | null): string {
  if (kind === "STATUS" && from && to) {
    return `${STATUS_LABEL[from as ShopOrderStatus]} till ${STATUS_LABEL[to as ShopOrderStatus]}`;
  }
  return KIND_LABEL[kind];
}

const EMAIL_LABEL: Record<ShopEmailState, { label: string; tone: "neutral" | "active" | "warning" | "muted" }> = {
  PENDING: { label: "Mejl väntar", tone: "neutral" },
  SENDING: { label: "Mejl skickas", tone: "neutral" },
  SENT: { label: "Mejl skickat", tone: "active" },
  FAILED: { label: "Mejlet gick inte iväg", tone: "warning" },
  SKIPPED: { label: "Redan meddelat", tone: "muted" },
};

function EmailBadge({ state }: { state: ShopEmailState }) {
  const { label, tone } = EMAIL_LABEL[state];
  return <Badge tone={tone}>{label}</Badge>;
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-neutral-500">{label}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-2.5">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="text-right text-neutral-900">{value}</dd>
    </div>
  );
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
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
