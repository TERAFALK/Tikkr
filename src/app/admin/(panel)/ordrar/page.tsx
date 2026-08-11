import { requireAdmin } from "@/lib/admin-session";
import FormDialog from "@/components/admin/FormDialog";
import OrderActions from "@/components/admin/OrderActions";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDuration, minutesBetween } from "@/lib/format";
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
      timeEntries: { select: { clockInAt: true, clockOutAt: true } },
    },
  });

  const newOrder = (
    <FormDialog
      trigger="Ny order"
      title="Lägg till order"
      description="Öppna ordrar går att stämpla på. All registrerad tid hör till en order som ska faktureras."
      action={createOrder}
      submitLabel="Lägg till"
    >
      <Field label="Ordernummer">
        <Input name="orderNumber" placeholder="2601" required autoFocus />
      </Field>
      <Field
        label="Kund"
        hint="Valfritt, men syns som rubrik på underlaget ni skickar vidare."
      >
        <Input name="customerName" placeholder="Volvo Lastvagnar" />
      </Field>
    </FormDialog>
  );

  return (
    <>
      <PageHeader
        title="Ordrar"
        description="Klicka på ett ordernummer för att ladda ner underlag eller ändra ordern."
        action={newOrder}
      />

      {orders.length === 0 ? (
        <EmptyState
          title="Inga ordrar upplagda"
          description="Utan minst en öppen order kan ingen stämpla in — all tid måste höra till en order som ska faktureras."
          action={newOrder}
        />
      ) : (
        // Vanligt GET-formulär. Kryssrutorna hamnar i adressen och skickas
        // till exportadressen, utan en rad JavaScript för markeringen.
        <form action="/api/admin/export/orders" method="GET">
          <Card>
            <CardHeader
              title={`${orders.length} ${orders.length === 1 ? "order" : "ordrar"}`}
              description="Markera flera för att få ut dem samlat — en PDF med en order per sida, eller en Excel med en flik per order."
              action={
                <div className="flex gap-2">
                  <Button type="submit" name="format" value="pdf">
                    PDF
                  </Button>
                  <Button
                    type="submit"
                    name="format"
                    value="excel"
                    tone="secondary"
                  >
                    Excel
                  </Button>
                </div>
              }
            />

            <Table>
              <thead>
                <tr>
                  <Th>
                    <span className="sr-only">Markera</span>
                  </Th>
                  <Th>Order</Th>
                  <Th>Kund</Th>
                  <Th>Status</Th>
                  <Th numeric>Stämplingar</Th>
                  <Th numeric>Upparbetad tid</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const minutes = order.timeEntries.reduce(
                    (total, entry) =>
                      total + minutesBetween(entry.clockInAt, entry.clockOutAt),
                    0
                  );
                  const isOpen = order.status === "OPEN";

                  return (
                    <Tr key={order.id} dimmed={!isOpen}>
                      <Td>
                        <input
                          type="checkbox"
                          name="order"
                          value={order.id}
                          aria-label={`Markera order ${order.orderNumber}`}
                          className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
                        />
                      </Td>
                      <Td>
                        <OrderActions
                          order={{
                            id: order.id,
                            orderNumber: order.orderNumber,
                            customerName: order.customerName,
                            status: order.status,
                            entries: order.timeEntries.length,
                          }}
                          updateAction={updateOrder}
                          toggleAction={toggleOrder}
                        />
                      </Td>
                      <Td muted>{order.customerName ?? "—"}</Td>
                      <Td>
                        {isOpen ? (
                          <Badge tone="active">Öppen</Badge>
                        ) : (
                          <Badge tone="muted">Stängd</Badge>
                        )}
                      </Td>
                      <Td numeric muted>
                        {order.timeEntries.length}
                      </Td>
                      <Td numeric>{formatDuration(minutes)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>

            <p className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500">
              Markerar du ingen order tas alla öppna med.
            </p>
          </Card>
        </form>
      )}
    </>
  );
}
