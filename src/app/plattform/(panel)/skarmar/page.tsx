import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { unsafeGlobalPrisma } from "@/lib/db";
import { listConfigs } from "@/lib/kiosk-config-store";
import { formatDateTime } from "@/lib/format";
import { CreateConfigDialog } from "@/components/platform/KioskConfigForms";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th, Tr } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Skärmar · Tikkr" };

/**
 * KONFIGURATIONERNA FÖR SKÄRMARNA VI SÅLT.
 *
 * En konfiguration är en hel inställningsfil för kioskappen. Standarden
 * gäller alla skärmar utan annat val, en kund kan ha en egen, och en enskild
 * skärm kan få en för att prova. Se kiosk-config.ts och CLAUDE.md.
 */
export default async function KioskConfigsPage() {
  await requirePlatformAdmin();

  const [configs, sold] = await Promise.all([
    listConfigs(),
    unsafeGlobalPrisma.kioskDevice.count({ where: { fullyVersion: { not: null } } }),
  ]);

  return (
    <>
      <PageHeader title="Skärmar" action={<CreateConfigDialog />} />

      <div className="mt-6 space-y-6">
        <Card>
          <CardHeader
            title="Konfigurationer"
            description={`${sold} ${sold === 1 ? "skärm" : "skärmar"} kör kioskappen och läser in sin konfiguration härifrån.`}
          />
          {configs.length === 0 ? (
            <p className="p-5 text-[13px] text-neutral-500">
              Ingen konfiguration än. Skapa en ur en export från ProMGR.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Namn</Th>
                  <Th>Version</Th>
                  <Th>Kunder</Th>
                  <Th>Egna skärmar</Th>
                  <Th>Sparad</Th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <Tr key={config.id}>
                    <Td>
                      <Link
                        href={`/plattform/skarmar/${config.id}`}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {config.name}
                      </Link>
                      {config.isDefault && (
                        <span className="ml-2">
                          <Badge tone="active">Standard</Badge>
                        </span>
                      )}
                    </Td>
                    <Td>{config.latest?.version ?? "—"}</Td>
                    <Td>{config.isDefault ? "Alla utan eget val" : config.companies}</Td>
                    <Td>{config.devices}</Td>
                    <Td muted>
                      {config.latest
                        ? `${formatDateTime(config.latest.createdAt)}, ${config.latest.createdByEmail}`
                        : "—"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
