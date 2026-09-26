import { requireAdmin } from "@/lib/admin-session";
import NewOrderDialog from "@/components/admin/NewOrderDialog";
import OrdersTable from "@/components/admin/OrdersTable";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { minutesBetween } from "@/lib/format";
import { budgetTotal } from "@/lib/order-budget";
import { customerOptions } from "@/lib/customers";
import { createOrder, toggleOrder, updateOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { db } = await requireAdmin();

  // Hämtas parallellt: kundväljaren behöver hela registret, och en fråga till
  // kostar mindre än att sidan väntar på två i följd.
  const [customerList, moments, orders] = await Promise.all([
    customerOptions(db),
    db.workMoment.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    db.order.findMany({
    orderBy: [{ status: "asc" }, { orderNumber: "asc" }],
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      customer: { select: { name: true } },
      status: true,
      markupPercent: true,
      fixedPriceOre: true,
      isQuickJob: true,
      // Beräknad tid är egna rader, en per arbetsmoment. Orderns totala
      // beräkning är summan av dem — se src/lib/order-budget.ts.
      budgets: {
        orderBy: { moment: { name: "asc" } },
        select: { momentId: true, minutes: true, moment: { select: { name: true } } },
      },
      timeEntries: {
        select: { clockInAt: true, clockOutAt: true, momentId: true },
      },
    },
    }),
  ]);

  const rows = orders.map((order) => {
    // Upparbetad tid per moment, så att varje beräkning går att jämföra med
    // sitt eget utfall och inte bara med orderns total.
    const usedByMoment = new Map<string, number>();

    for (const entry of order.timeEntries) {
      if (!entry.momentId) continue;
      usedByMoment.set(
        entry.momentId,
        (usedByMoment.get(entry.momentId) ?? 0) +
          minutesBetween(entry.clockInAt, entry.clockOutAt)
      );
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customer?.name ?? null,
      status: order.status,
      budgetMinutes: budgetTotal(order.budgets),
      budgets: order.budgets.map((budget) => ({
        momentId: budget.momentId,
        momentName: budget.moment.name,
        minutes: budget.minutes,
        usedMinutes: usedByMoment.get(budget.momentId) ?? 0,
      })),
      markupPercent: order.markupPercent,
      fixedPriceOre: order.fixedPriceOre,
      isQuickJob: order.isQuickJob,
      entries: order.timeEntries.length,
      minutes: order.timeEntries.reduce(
        (total, entry) =>
          total + minutesBetween(entry.clockInAt, entry.clockOutAt),
        0
      ),
    };
  });

  const newOrder = (
    <NewOrderDialog
      customers={customerList}
      moments={moments}
      action={createOrder}
    />
  );

  const quickJobs = rows.filter((order) => order.isQuickJob).length;

  return (
    <>
      <PageHeader
        title="Ordrar"
        description="Välj ett ordernummer för underlag och ändringar. Även stängda ordrar."
        action={newOrder}
      />

      {/* Ordrar som verkstaden lagt upp själv. De har ofta ett avskrivet
          nummer och saknar kund, och tiden på dem faktureras ändå — därför
          en rad som inte går att missa, inte bara en bricka i tabellen. */}
      {quickJobs > 0 && (
        <div className="mb-4">
          <Alert tone="warning">
            {quickJobs === 1
              ? "En order är skapad från en stämplingsskärm och behöver kompletteras."
              : `${quickJobs} ordrar är skapade från stämplingsskärmar och behöver kompletteras.`}{" "}
            Kontrollera ordernummer och kund. Märkningen försvinner när du
            sparat orderns uppgifter.
          </Alert>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Inga ordrar upplagda"
          description="Minst en öppen order krävs för att kunna stämpla in."
          action={newOrder}
        />
      ) : (
        <OrdersTable
          orders={rows}
          customers={customerList}
          moments={moments}
          updateAction={updateOrder}
          toggleAction={toggleOrder}
        />
      )}
    </>
  );
}
