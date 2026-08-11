import { requireAdmin } from "@/lib/admin-session";
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

  return (
    <>
      <PageHeader
        title="Ordrar"
        description="Öppna ordrar går att stämpla på. Stängda döljs på skärmen men behåller sin tid."
      />

      <Card className="mb-6">
        <CardHeader title="Lägg till order" />
        <form action={createOrder} className="flex flex-wrap items-end gap-3 p-5">
          <div className="w-40">
            <Field label="Ordernummer">
              <Input name="orderNumber" placeholder="2601" required />
            </Field>
          </div>
          <div className="min-w-64 flex-1">
            <Field label="Kund" hint="Valfritt, men gör ordern lättare att känna igen">
              <Input name="customerName" placeholder="Volvo Lastvagnar" />
            </Field>
          </div>
          <Button type="submit">Lägg till</Button>
        </form>
      </Card>

      {orders.length === 0 ? (
        <EmptyState
          title="Inga ordrar upplagda"
          description="Utan minst en öppen order kan ingen stämpla in — all tid måste höra till en order som ska faktureras."
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Order och kund</Th>
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
                      <form
                        action={updateOrder}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="id" value={order.id} />
                        <Input
                          name="orderNumber"
                          defaultValue={order.orderNumber}
                          className="w-28"
                          aria-label="Ordernummer"
                        />
                        <Input
                          name="customerName"
                          defaultValue={order.customerName ?? ""}
                          placeholder="Kund"
                          className="w-52"
                          aria-label="Kund"
                        />
                        <Button type="submit" tone="ghost">
                          Spara
                        </Button>
                      </form>
                    </Td>
                    <Td>
                      {isOpen ? (
                        <Badge tone="active">Öppen</Badge>
                      ) : (
                        <Badge tone="muted">Stängd</Badge>
                      )}
                    </Td>
                    <Td numeric>{formatDuration(minutes)}</Td>
                    <Td>
                      <form action={toggleOrder}>
                        <input type="hidden" name="id" value={order.id} />
                        <input type="hidden" name="status" value={order.status} />
                        <Button type="submit" tone="secondary">
                          {isOpen ? "Stäng order" : "Öppna igen"}
                        </Button>
                      </form>
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
