import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import PairingCodeDialog from "@/components/admin/PairingCodeDialog";
import ConfirmButton from "@/components/admin/ConfirmButton";
import {
  Alert,
  Badge,
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
import { formatDateTime } from "@/lib/format";
import { getLicenseState } from "@/lib/licenses";
import { deviceState } from "@/lib/kiosk-auth";
import { addDevice, deleteDevice, repairDevice } from "./actions";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const { db, companyId } = await requireAdmin();
  const licenses = await getLicenseState(companyId);

  const devices = await db.kioskDevice.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      tokenHash: true,
      pairingExpiresAt: true,
      lastSeenAt: true,
      createdAt: true,
      _count: { select: { timeEntries: true } },
    },
  });

  const newDevice = (
    <PairingCodeDialog
      trigger="Ny skärm"
      title="Lägg till skärm"
      description="Ange ett namn som beskriver var skärmen är placerad. Kopplingskoden visas direkt."
      action={addDevice}
      submitLabel="Skapa kod"
      disabled={licenses.available <= 0}
    >
      <Field
        label="Namn"
        hint={
          licenses.available === 1
            ? "En ledig licens återstår."
            : `${licenses.available} lediga licenser återstår.`
        }
      >
        <Input name="name" placeholder="Verkstaden, entrén, monteringen…" required autoFocus />
      </Field>
    </PairingCodeDialog>
  );

  return (
    <>
      <PageHeader
        title="Stämplingsskärmar"
        description={`${devices.length} av ${licenses.total} licenser används. En skärm kopplas med en sexsiffrig kod och kräver därefter ingen inloggning.`}
        action={newDevice}
      />

      {/* Antalet licenser kan sänkas hos betaltjänsten under antalet upplagda
          skärmar. Ingen skärm slutar fungera för det — vilken som ska bort är
          kundens beslut, inte vårt. */}
      {devices.length > licenses.total ? (
        <Alert tone="warning">
          {devices.length} skärmar är upplagda men ni har {licenses.total}{" "}
          {licenses.total === 1 ? "licens" : "licenser"}. Radera{" "}
          {devices.length - licenses.total}{" "}
          {devices.length - licenses.total === 1 ? "skärm" : "skärmar"} nedan,
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
            , alternativt raderas en skärm som inte längre används.
          </Alert>
        )
      )}

      {devices.length === 0 ? (
        <EmptyState
          title="Inga skärmar upplagda"
          description="Skapa en skärm och knappa in koden på den enhet som ska användas för stämpling."
          action={newDevice}
        />
      ) : (
        <Card>
          <CardHeader
            title={`${devices.length} ${devices.length === 1 ? "skärm" : "skärmar"}`}
            description="Koppla om ger en ny kod och stänger ute den gamla enheten. Historiken följer med."
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
              {devices.map((device) => {
                const state = deviceState(device);

                return (
                  <Tr key={device.id} dimmed={state !== "kopplad"}>
                    <Td>
                      <span className="font-medium">{device.name}</span>
                      <span className="mt-0.5 block text-xs text-neutral-400">
                        Upplagd {formatDateTime(device.createdAt)}
                      </span>
                    </Td>

                    <Td>
                      {state === "kopplad" && (
                        <Badge tone="active">Kopplad</Badge>
                      )}
                      {state === "väntar" && <Badge>Väntar på kod</Badge>}
                      {state === "utgången" && (
                        <Badge tone="warning">Ej kopplad</Badge>
                      )}
                    </Td>

                    <Td muted>
                      {device.lastSeenAt
                        ? formatDateTime(device.lastSeenAt)
                        : "Aldrig"}
                    </Td>

                    <Td numeric muted>
                      {device._count.timeEntries}
                    </Td>

                    <Td>
                      <div className="flex justify-end gap-2">
                        <PairingCodeDialog
                          trigger={state === "kopplad" ? "Koppla om" : "Ny kod"}
                          triggerTone="secondary"
                          title={`Ny kod för ${device.name}`}
                          description={
                            state === "kopplad"
                              ? "Den nuvarande enheten slutar fungera i samma stund. Skärmens namn, historik och licens är kvar."
                              : "Skapar en ny kod. Den föregående slutar gälla."
                          }
                          action={repairDevice}
                          submitLabel="Skapa kod"
                        >
                          <input type="hidden" name="id" value={device.id} />
                          <p className="text-[13px] leading-relaxed text-neutral-600">
                            {state === "kopplad"
                              ? "Använd detta när enheten bytts ut, tömts eller kommit bort."
                              : "Den tidigare koden gäller inte längre."}
                          </p>
                        </PairingCodeDialog>

                        <form action={deleteDevice}>
                          <input type="hidden" name="id" value={device.id} />
                          <ConfirmButton
                            type="submit"
                            tone="ghost"
                            question={
                              device._count.timeEntries > 0
                                ? `Radera skärmen ${device.name}? De ${device._count.timeEntries} stämplingar som gjorts på den finns kvar med sin tid, men tappar noteringen om vilken skärm de kom från. Licensen frigörs.`
                                : `Radera skärmen ${device.name}? Licensen frigörs.`
                            }
                          >
                            Radera
                          </ConfirmButton>
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
