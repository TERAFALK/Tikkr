import Link from "next/link";
import type { ShopOrderStatus, ShopPaymentStatus } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listShopOrders } from "@/lib/shop/admin";
import { needsAttention, PAYMENT_LABEL, STATUS_LABEL } from "@/lib/shop/status";
import { formatDate } from "@/lib/format";
import { formatCurrency } from "@/lib/money";
import { addDaysInZone, parseLocalDate, startOfDayIn } from "@/lib/time-zone";
import Pager from "@/components/platform/Pager";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beställningar · Tikkr" };

const ZONE = "Europe/Stockholm";

/**
 * BESTÄLLNINGARNA AV TILLBEHÖR, FRÅN ALLA KUNDER.
 *
 * Förvalet är "Att hantera": nya, de som kräver åtgärd, och skickade som inte
 * fakturerats. Det är dem man öppnar sidan för, och samma urval som siffran
 * i menyn. Filtren står i adressen, så att ett urval går att spara.
 */
export default async function ShopOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    betalning?: string;
    vy?: string;
    fran?: string;
    till?: string;
    sida?: string;
  }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;

  const q = (params.q ?? "").trim();
  const status = isStatus(params.status) ? params.status : undefined;
  const payment = isPayment(params.betalning) ? params.betalning : undefined;
  const from = params.fran ? parseLocalDate(params.fran, ZONE) : null;
  const to = params.till ? parseLocalDate(params.till, ZONE) : null;

  // Utan något filter visas det som väntar på oss. "Alla" är ett eget val.
  const anyFilter = Boolean(q || status || payment || from || to);
  const attention = params.vy !== "alla" && !anyFilter;

  const { rows, total, page, pages } = await listShopOrders({
    q,
    status,
    payment,
    attention,
    from: from ? startOfDay(from) : undefined,
    to: to ? addDaysInZone(startOfDay(to), 1, ZONE) : undefined,
    page: Number(params.sida) || 1,
  });

  const hrefFor = (next: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "sida") query.set(key, value);
    }
    if (next > 1) query.set("sida", String(next));
    const text = query.toString();
    return `/plattform/bestallningar${text ? `?${text}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Beställningar" />

      <div className="mb-4 flex flex-wrap gap-1">
        <ViewLink href="/plattform/bestallningar" active={attention}>
          Att hantera
        </ViewLink>
        <ViewLink href="/plattform/bestallningar?vy=alla" active={!attention}>
          Alla
        </ViewLink>
      </div>

      {/* Formulär utan JavaScript, som kundlistan. Urvalet hamnar i adressen. */}
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="vy" value="alla" />
        <Labelled label="Sök">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nummer eller företag"
            className="w-52 rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-400 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </Labelled>
        <Labelled label="Status">
          <Select name="status" defaultValue={status ?? ""} className="w-44">
            <option value="">Alla</option>
            {(Object.keys(STATUS_LABEL) as ShopOrderStatus[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABEL[key]}
              </option>
            ))}
          </Select>
        </Labelled>
        <Labelled label="Betalning">
          <Select name="betalning" defaultValue={payment ?? ""} className="w-40">
            <option value="">Alla</option>
            {(Object.keys(PAYMENT_LABEL) as ShopPaymentStatus[]).map((key) => (
              <option key={key} value={key}>
                {PAYMENT_LABEL[key]}
              </option>
            ))}
          </Select>
        </Labelled>
        <Labelled label="Från">
          <DateInput name="fran" value={params.fran} />
        </Labelled>
        <Labelled label="Till">
          <DateInput name="till" value={params.till} />
        </Labelled>
        <Button type="submit" tone="secondary">
          Visa
        </Button>
        {anyFilter && (
          <ButtonLink href="/plattform/bestallningar?vy=alla" tone="ghost">
            Rensa
          </ButtonLink>
        )}
      </form>

      {rows.length === 0 ? (
        <EmptyState title={attention ? "Inget att hantera" : "Inga beställningar"} />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Nummer</Th>
                <Th>Företag</Th>
                <Th>Innehåll</Th>
                <Th>Status</Th>
                <Th>Betalning</Th>
                <Th numeric>Totalt inkl. moms</Th>
                <Th>Lagd</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <Tr key={order.id}>
                  <Td>
                    <Link
                      href={`/plattform/bestallningar/${order.id}`}
                      className="font-medium text-tick-deep"
                    >
                      {order.number}
                    </Link>
                  </Td>
                  <Td>{order.companyName}</Td>
                  <Td muted>
                    {order.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}
                  </Td>
                  <Td>
                    <Badge tone={order.status === "PROBLEM" || order.status === "RECEIVED" ? "warning" : "neutral"}>
                      {STATUS_LABEL[order.status]}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={needsAttention(order) && order.paymentStatus === "NOT_INVOICED" ? "warning" : "neutral"}>
                      {PAYMENT_LABEL[order.paymentStatus]}
                    </Badge>
                  </Td>
                  <Td numeric>
                    {formatCurrency(order.totalOre)}
                    {order.shippingOre === null && (
                      <span className="block text-xs text-neutral-400">exkl. frakt</span>
                    )}
                  </Td>
                  <Td muted>{formatDate(order.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pager
            page={page}
            pageCount={pages}
            total={total}
            unit="beställningar"
            hrefFor={hrefFor}
          />
        </Card>
      )}
    </>
  );
}

function isStatus(value: string | undefined): value is ShopOrderStatus {
  return Boolean(value) && Object.hasOwn(STATUS_LABEL, value!);
}

function isPayment(value: string | undefined): value is ShopPaymentStatus {
  return Boolean(value) && Object.hasOwn(PAYMENT_LABEL, value!);
}

/** parseLocalDate landar klockan 12; urvalet börjar vid dygnets början. */
function startOfDay(date: Date): Date {
  return startOfDayIn(date, ZONE);
}

function ViewLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
        active ? "bg-fjord text-white" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {children}
    </Link>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function DateInput({ name, value }: { name: string; value?: string }) {
  return (
    <input
      type="date"
      name={name}
      defaultValue={value ?? ""}
      className="rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-blue-600"
    />
  );
}
