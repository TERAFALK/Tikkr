import { requireAdmin } from "@/lib/admin-session";
import FormDialog from "@/components/admin/FormDialog";
import SearchSelect from "@/components/admin/SearchSelect";
import OrdersTable from "@/components/admin/OrdersTable";
import { Alert, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { minutesBetween } from "@/lib/format";
import { customerOptions } from "@/lib/customers";
import { createOrder, toggleOrder, updateOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { db } = await requireAdmin();

  // Hämtas parallellt: kundväljaren behöver hela registret, och en fråga till
  // kostar mindre än att sidan väntar på två i följd.
  const [customerList, orders] = await Promise.all([
    customerOptions(db),
    db.order.findMany({
    orderBy: [{ status: "asc" }, { orderNumber: "asc" }],
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      customer: { select: { name: true } },
      status: true,
      budgetMinutes: true,
      markupPercent: true,
      fixedPriceOre: true,
      isQuickJob: true,
      timeEntries: { select: { clockInAt: true, clockOutAt: true } },
    },
    }),
  ]);

  const rows = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerName: order.customer?.name ?? null,
    status: order.status,
    budgetMinutes: order.budgetMinutes,
    markupPercent: order.markupPercent,
    fixedPriceOre: order.fixedPriceOre,
    isQuickJob: order.isQuickJob,
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
        hint="Valfritt. Sök på namn, kundnummer eller org.nr."
      >
        <SearchSelect
          name="customerId"
          options={customerList}
          emptyLabel="Ingen kund"
          placeholder="Sök kund…"
        />
      </Field>
      <Field
        label="Beräknad tid"
        hint="Valfritt. Timmar, exempelvis 40 eller 7,5."
      >
        <Input name="budgetHours" inputMode="decimal" placeholder="40" />
      </Field>
    </FormDialog>
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
          updateAction={updateOrder}
          toggleAction={toggleOrder}
        />
      )}
    </>
  );
}
