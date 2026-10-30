import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import { customerOptions } from "@/lib/customers";
import { formatDate, formatDuration } from "@/lib/format";
import { formatCurrency, formatMarkup } from "@/lib/money";
import { orderMoments, orderRows } from "@/lib/orders";
import BudgetBar from "@/components/admin/BudgetBar";
import OrderActions from "@/components/admin/OrderActions";
import {
  Alert,
  Card,
  CardHeader,
  Stat,
  SectionTitle,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { toggleOrder, updateOrder } from "../actions";

export const metadata = { title: "Order · Tikkr" };

/**
 * ORDERNS EGEN SIDA.
 *
 * Öppnas från ordernumret i listorna och från Ordrar i arbete på översikten,
 * som en kund från kundregistret. Här tas efterkalkyl och underlag ut, ordern
 * stängs och ändras, och här syns hur tiden fördelat sig mot beräkningen.
 *
 * Talen kommer från `orderRows`, samma funktion som orderlistan, så att en
 * order aldrig visar olika tid beroende på var man tittar.
 */

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { db, companyId } = await requireAdmin();
  const { orderId } = await params;

  // Företagsfiltret ligger i `db`, så en annan kunds order ger en tom lista
  // och därmed samma 404 som en order som inte finns.
  const [order] = await orderRows(db, { ids: [orderId] });
  if (!order) notFound();

  // Leveransdatumet hör till tillvalet Planering. Att det döljs här är
  // kosmetik, serveråtgärden frågar om modulen själv, se ordrar/actions.ts.
  const planning = await hasModule(companyId, "PLANNING");

  const [moments, momentRows, customers, timeZone] = await Promise.all([
    db.workMoment.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    orderMoments(db, order),
    // Ändra-rutan kan byta orderns kund, och då behövs hela registret.
    customerOptions(db),
    companyTimeZone(companyId),
  ]);

  const dueDate = planning ? order.plannedDueDate : null;

  return (
    <>
      <Link
        href="/admin/ordrar"
        className="text-[13px] font-medium text-link hover:underline"
      >
        ← Ordrar
      </Link>

      <div className="mt-4">
        <OrderActions
          order={order}
          customers={customers}
          moments={moments}
          updateAction={updateOrder}
          toggleAction={toggleOrder}
          planning={planning}
        />

        {order.isQuickJob && (
          <div className="mt-4">
            <Alert tone="warning">
              Ordern är skapad från en stämplingsskärm. Kontrollera ordernummer
              och kund. Märkningen försvinner när du sparat orderns uppgifter.
            </Alert>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Registrerad tid"
            value={formatDuration(order.minutes)}
          />
          <Stat
            label="Beräknad tid"
            value={
              order.budgetMinutes === null
                ? "Ingen"
                : formatDuration(order.budgetMinutes)
            }
          />
          <Stat label="Stämplingar" value={order.entries} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card className="p-5">
            <SectionTitle>Uppgifter</SectionTitle>

            <dl className="mt-3 space-y-2 text-[13px]">
              <Detail label="Kund">
                {order.customerId ? (
                  <Link
                    href={`/admin/kunder/${order.customerId}`}
                    className="font-medium text-link hover:underline"
                  >
                    {order.customerName}
                  </Link>
                ) : (
                  "Ingen kund angiven"
                )}
              </Detail>
              {order.markupPercent !== null && (
                <Detail label="Påslag">
                  {formatMarkup(order.markupPercent)}
                </Detail>
              )}
              {order.fixedPriceOre !== null && (
                <Detail label="Fast pris">
                  {formatCurrency(order.fixedPriceOre)}
                </Detail>
              )}
              {dueDate && (
                <Detail label="Leveransdatum">
                  {formatDate(dueDate, timeZone)}
                </Detail>
              )}
            </dl>
          </Card>

          <Card className="min-w-0 lg:col-span-2">
            <CardHeader
              title="Tid per arbetsmoment"
              action={
                <span className="flex gap-3 text-[13px] font-medium">
                  <Link
                    href={`/admin/stamplingar?orderId=${order.id}`}
                    className="text-link hover:underline"
                  >
                    Stämplingar
                  </Link>
                  <Link
                    href={`/admin/rapporter?orderId=${order.id}`}
                    className="text-link hover:underline"
                  >
                    Rapport
                  </Link>
                </span>
              }
            />
            {momentRows.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-neutral-500">
                Ingen registrerad tid än.
              </p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Arbetsmoment</Th>
                    <Th numeric>Registrerad tid (timmar)</Th>
                    <Th>Mot beräknad tid</Th>
                  </tr>
                </thead>
                <tbody>
                  {momentRows.map((moment) => (
                    <Tr key={moment.momentId}>
                      <Td>{moment.momentName}</Td>
                      <Td numeric>{formatDuration(moment.minutes)}</Td>
                      <Td>
                        <BudgetBar
                          budgetMinutes={moment.budgetMinutes}
                          usedMinutes={moment.minutes}
                        />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** En rad i Uppgifter: etiketten till vänster, värdet till höger. */
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right text-neutral-700">{children}</dd>
    </div>
  );
}
