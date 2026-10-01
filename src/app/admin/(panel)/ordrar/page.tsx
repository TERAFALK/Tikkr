import { requireAdmin } from "@/lib/admin-session";
import NewOrderDialog from "@/components/admin/NewOrderDialog";
import OrdersTable from "@/components/admin/OrdersTable";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { orderRows } from "@/lib/orders";
import { customerOptions } from "@/lib/customers";
import { closeOrders, createOrder, toggleOrder, updateOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { db } = await requireAdmin();

  // Hämtas parallellt: kundväljaren behöver hela registret, och en fråga till
  // kostar mindre än att sidan väntar på två i följd.
  const [customerList, moments, rows] = await Promise.all([
    customerOptions(db),
    db.workMoment.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    orderRows(db),
  ]);

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
          action={newOrder}
        />
      ) : (
        <OrdersTable
          orders={rows}
          customers={customerList}
          moments={moments}
          updateAction={updateOrder}
          toggleAction={toggleOrder}
          closeAction={closeOrders}
        />
      )}
    </>
  );
}
