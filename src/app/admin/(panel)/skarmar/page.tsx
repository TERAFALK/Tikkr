import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin-session";
import NewDeviceForm from "@/components/admin/NewDeviceForm";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { toggleDevice } from "./actions";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const { db } = await requireAdmin();

  const devices = await db.kioskDevice.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });

  // Adressen byggs ur anropet istället för att gissas, så kopplingslänken
  // pekar rätt oavsett om panelen nås via IP, testdomän eller tikkr.se.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  return (
    <>
      <PageHeader
        title="Stämplingsskärmar"
        description="Varje fysisk skärm kopplas en gång med en egen länk. Ingen inloggning behövs sedan."
      />

      <NewDeviceForm baseUrl={baseUrl} />

      {devices.length === 0 ? (
        <EmptyState
          title="Inga skärmar upplagda"
          description="Skapa en skärm och öppna dess kopplingslänk på surfplattan eller datorn som ska stå i verkstaden."
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Namn</Th>
                <Th>Status</Th>
                <Th>Senast aktiv</Th>
                <Th>Upplagd</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map((device) => (
                <tr key={device.id} className={device.active ? "" : "bg-slate-50"}>
                  <Td>
                    <span className="font-medium">{device.name}</span>
                  </Td>
                  <Td>
                    {device.active ? (
                      <Badge tone="active">Aktiv</Badge>
                    ) : (
                      <Badge tone="muted">Återkallad</Badge>
                    )}
                  </Td>
                  <Td muted>
                    {device.lastSeenAt
                      ? formatDateTime(device.lastSeenAt)
                      : "Aldrig kopplad"}
                  </Td>
                  <Td muted>{formatDateTime(device.createdAt)}</Td>
                  <Td>
                    <form action={toggleDevice}>
                      <input type="hidden" name="id" value={device.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(device.active)}
                      />
                      <Button type="submit" tone={device.active ? "danger" : "secondary"}>
                        {device.active ? "Återkalla" : "Återaktivera"}
                      </Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
