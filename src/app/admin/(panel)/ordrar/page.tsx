import { requireAdmin } from "@/lib/admin-session";
import FormDialog from "@/components/admin/FormDialog";
import OrdersTable from "@/components/admin/OrdersTable";
import { EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { minutesBetween } from "@/lib/format";
import { createOrder, toggleOrder, updateOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { db } = await requireAdmin();

  const orders = await db.order.findMany({
    orderBy: [{ status: "asc" }, { orderNumber: "asc" }],
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      status: true,
      budgetMinutes: true,
      timeEntries: { select: { clockInAt: true, clockOutAt: true } },
    },
  });

  const rows = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    status: order.status,
    budgetMinutes: order.budgetMinutes,
    entries: order.timeEntries.length,
    minutes: order.timeEntries.reduce(
      (total, entry) => total + minutesBetween(entry.clockInAt, entry.clockOutAt),
      0
    ),
  }));

  const newOrder = (
    <FormDialog
      trigger="Ny order"
      title="Lägg till order"
      description="Öppna ordrar är valbara på stämplingsskärmen."
      action={createOrder}
      submitLabel="Lägg till"
    >
      <Field label="Ordernummer">
        <Input name="orderNumber" placeholder="2601" required autoFocus />
      </Field>
      <Field
        label="Kund"
        hint="Valfritt. Visas som rubrik på underlag som skickas vidare."
      >
        <Input name="customerName" placeholder="Volvo Lastvagnar" />
      </Field>
      <Field
        label="Beräknad tid"
        hint="Valfritt. Timmar, exempelvis 40 eller 7,5."
      >
        <Input name="budgetHours" inputMode="decimal" placeholder="40" />
      </Field>
    </FormDialog>
  );

  return (
    <>
      <PageHeader
        title="Ordrar"
        description="Välj ett ordernummer för underlag och ändringar. Även stängda ordrar."
        action={newOrder}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Inga ordrar upplagda"
          description="Minst en öppen order krävs för att kunna stämpla in."
          action={newOrder}
        />
      ) : (
        <OrdersTable
          orders={rows}
          updateAction={updateOrder}
          toggleAction={toggleOrder}
        />
      )}
    </>
  );
}
