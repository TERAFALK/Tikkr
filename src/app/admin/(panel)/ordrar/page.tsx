import { requireAdmin } from "@/lib/admin-session";
import FormDialog from "@/components/admin/FormDialog";
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
      <Field label="Kund" hint="Valfritt, men gör ordern lättare att känna igen på skärmen.">
        <Input name="customerName" placeholder="Volvo Lastvagnar" />
      </Field>
    </FormDialog>
  );

  return (
    <>
      <PageHeader
        title="Ordrar"
        description="Stängda ordrar döljs på stämplingsskärmen men behåller sin tid."
        action={newOrder}
      />

      {orders.length === 0 ? (
        <EmptyState
          title="Inga ordrar upplagda"
          description="Utan minst en öppen order kan ingen stämpla in — all tid måste höra till en order som ska faktureras."
          action={newOrder}
        />
      ) : (
        <Card>
          <CardHeader
            title={`${orders.length} ${orders.length === 1 ? "order" : "ordrar"}`}
            description="Öppna först."
          />
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Kund</Th>
                <Th>Status</Th>
                <Th numeric>Upparbetad tid</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
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
                      <span className="font-medium">{order.orderNumber}</span>
                    </Td>
                    <Td muted>{order.customerName ?? "—"}</Td>
                    <Td>
                      {isOpen ? (
                        <Badge tone="active">Öppen</Badge>
                      ) : (
                        <Badge tone="muted">Stängd</Badge>
                      )}
                    </Td>
                    <Td numeric>{formatDuration(minutes)}</Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <FormDialog
                          trigger="Ändra"
                          triggerTone="ghost"
                          title={`Ändra order ${order.orderNumber}`}
                          action={updateOrder}
                          submitLabel="Spara"
                        >
                          <input type="hidden" name="id" value={order.id} />
                          <Field label="Ordernummer">
                            <Input
                              name="orderNumber"
                              defaultValue={order.orderNumber}
                              required
                              autoFocus
                            />
                          </Field>
                          <Field label="Kund">
                            <Input
                              name="customerName"
                              defaultValue={order.customerName ?? ""}
                              placeholder="Valfritt"
                            />
                          </Field>
                        </FormDialog>

                        <form action={toggleOrder}>
                          <input type="hidden" name="id" value={order.id} />
                          <input type="hidden" name="status" value={order.status} />
                          <Button type="submit" tone="secondary">
                            {isOpen ? "Stäng order" : "Öppna igen"}
                          </Button>
                        </form>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
