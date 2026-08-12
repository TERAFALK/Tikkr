import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin-session";
import NewDeviceForm from "@/components/admin/NewDeviceForm";
import ConfirmButton from "@/components/admin/ConfirmButton";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { getLicenseState } from "@/lib/licenses";
import { deleteDevice, toggleDevice } from "./actions";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const { db, companyId } = await requireAdmin();
  const licenses = await getLicenseState(companyId);

  const devices = await db.kioskDevice.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      lastSeenAt: true,
      createdAt: true,
      _count: { select: { timeEntries: true } },
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
        description={`${licenses.used} av ${licenses.total} licenser används. En licens ger en stämplingsskärm, som kopplas en gång med en egen länk och därefter inte kräver någon inloggning.`}
        action={
          <NewDeviceForm baseUrl={baseUrl} available={licenses.available} />
        }
      />

      {/* Antalet licenser kan sänkas hos betaltjänsten utan att vi kan hindra
          det. Skärmarna stängs inte av — stämplingen fortsätter, och kunden
          får själv peka ut vilken skärm som ska bort. */}
      {licenses.used > licenses.total ? (
        <Alert tone="warning">
          {licenses.used} skärmar är kopplade men ni har {licenses.total}{" "}
          {licenses.total === 1 ? "licens" : "licenser"}. Återkalla{" "}
          {licenses.used - licenses.total}{" "}
          {licenses.used - licenses.total === 1 ? "skärm" : "skärmar"} nedan,
          eller utöka antalet licenser under{" "}
          <Link
            href="/admin/installningar/prenumeration"
            className="font-medium underline"
          >
            Inställningar → Prenumeration
          </Link>
          . Skärmarna fortsätter fungera under tiden.
        </Alert>
      ) : (
        licenses.available === 0 && (
          <Alert tone="warning">
            Samtliga {licenses.total} licenser används. Antalet utökas under{" "}
            <Link
              href="/admin/installningar/prenumeration"
              className="font-medium underline"
            >
              Inställningar → Prenumeration
            </Link>
            , alternativt återkallas en skärm som inte längre används.
          </Alert>
        )
      )}

      {devices.length === 0 ? (
        <EmptyState
          title="Inga skärmar upplagda"
          description="Skapa en skärm och öppna dess kopplingslänk på den enhet som ska användas för stämpling."
          action={
          <NewDeviceForm baseUrl={baseUrl} available={licenses.available} />
        }
        />
      ) : (
        <Card>
          <CardHeader
            title={`${devices.length} ${devices.length === 1 ? "skärm" : "skärmar"}`}
            description="Aktiva visas först. En återkallad skärm slutar fungera omedelbart."
          />
          <Table>
            <thead>
              <tr>
                <Th>Namn</Th>
                <Th>Status</Th>
                <Th>Senast aktiv</Th>
                <Th numeric>Stämplingar</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <Tr key={device.id} dimmed={!device.active}>
                  <Td>
                    <span className="font-medium">{device.name}</span>
                    <span className="mt-0.5 block text-xs text-neutral-400">
                      Upplagd {formatDateTime(device.createdAt)}
                    </span>
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
                  <Td numeric muted>
                    {device._count.timeEntries}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <form action={toggleDevice}>
                        <input type="hidden" name="id" value={device.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(device.active)}
                        />
                        <Button
                          type="submit"
                          tone={device.active ? "danger" : "secondary"}
                        >
                          {device.active ? "Återkalla" : "Återaktivera"}
                        </Button>
                      </form>

                      {/* Bara återkallade går att radera. En aktiv skärm står
                          och används av någon just nu. */}
                      {!device.active && (
                        <form action={deleteDevice}>
                          <input type="hidden" name="id" value={device.id} />
                          <ConfirmButton
                            type="submit"
                            tone="ghost"
                            question={
                              device._count.timeEntries > 0
                                ? `Radera skärmen ${device.name}? De ${device._count.timeEntries} stämplingar som gjorts på den finns kvar med sin tid, men tappar noteringen om vilken skärm de kom från.`
                                : `Radera skärmen ${device.name}?`
                            }
                          >
                            Radera
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
