import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getConfig } from "@/lib/kiosk-config-store";
import { formatDateTime } from "@/lib/format";
import {
  ConfigEditor,
  RestoreVersion,
} from "@/components/platform/KioskConfigForms";
import ActionDialog from "@/components/ui/ActionDialog";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import {
  deleteKioskConfig,
  makeDefaultKioskConfig,
  renameKioskConfig,
  type ConfigFormState,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Skärmkonfiguration · Tikkr" };

/**
 * EN KONFIGURATION: innehållet, versionerna och vilka som använder den.
 *
 * Varje sparning blir en ny version, och skärmarna läser in den inom någon
 * minut. En äldre version återställs genom att sparas som en ny.
 */
export default async function KioskConfigPage({
  params,
}: {
  params: Promise<{ configId: string }>;
}) {
  await requirePlatformAdmin();
  const { configId } = await params;

  const config = await getConfig(configId);
  if (!config) notFound();

  return (
    <>
      <p className="mb-2 text-[13px]">
        <Link href="/plattform/skarmar" className="text-neutral-500 hover:underline">
          Skärmar
        </Link>
      </p>

      <PageHeader
        title={config.name}
        action={
          <div className="flex flex-wrap gap-2">
            {!config.isDefault && (
              <ActionDialog<ConfigFormState>
                trigger="Gör till standard"
                title="Gör till standard"
                description="Gäller alla skärmar hos kunder utan eget val."
                action={makeDefaultKioskConfig}
                initial={{}}
                submitLabel="Gör till standard"
              >
                <input type="hidden" name="configId" value={config.id} />
              </ActionDialog>
            )}
            <ActionDialog<ConfigFormState>
              trigger="Byt namn"
              title="Byt namn"
              action={renameKioskConfig}
              initial={{}}
              submitLabel="Spara"
            >
              <input type="hidden" name="configId" value={config.id} />
              <Field label="Namn">
                <Input name="name" defaultValue={config.name} autoComplete="off" required />
              </Field>
            </ActionDialog>
            {!config.isDefault && (
              <ActionDialog<ConfigFormState>
                trigger="Ta bort"
                triggerTone="danger"
                title={`Ta bort ${config.name}`}
                description="Alla versioner tas bort. Kan inte ångras."
                action={deleteKioskConfig}
                initial={{}}
                submitLabel="Ta bort"
                submitTone="danger"
              >
                <input type="hidden" name="configId" value={config.id} />
              </ActionDialog>
            )}
          </div>
        }
      />

      {config.isDefault && (
        <p className="-mt-3 mb-6">
          <Badge tone="active">Standard</Badge>
        </p>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader
            title={config.latest ? `Version ${config.latest.version}` : "Innehåll"}
            description="Sparas som en ny version. Skärmarna läser in den inom någon minut."
          />
          <ConfigEditor
            configId={config.id}
            settings={config.latest?.settings ?? {}}
            secrets={config.latest?.secrets ?? {}}
          />
        </Card>

        <Card>
          <CardHeader title="Används av" />
          <div className="space-y-3 p-5 text-[13px]">
            {config.isDefault && (
              <p className="text-neutral-700">Alla kunder utan eget val.</p>
            )}
            {config.companies.length > 0 && (
              <p>
                <span className="text-neutral-500">Kunder: </span>
                {config.companies.map((company, index) => (
                  <span key={company.id}>
                    {index > 0 && ", "}
                    <Link href={`/plattform/kunder/${company.id}`} className="hover:underline">
                      {company.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {config.devices.length > 0 && (
              <p>
                <span className="text-neutral-500">Enskilda skärmar: </span>
                {config.devices.map((device, index) => (
                  <span key={device.id}>
                    {index > 0 && ", "}
                    <Link href={`/plattform/kunder/${device.company.id}`} className="hover:underline">
                      {device.name} ({device.company.name})
                    </Link>
                  </span>
                ))}
              </p>
            )}
            {!config.isDefault && config.companies.length === 0 && config.devices.length === 0 && (
              <p className="text-neutral-500">Ingen.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Versioner" />
          <Table>
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Sparad</Th>
                <Th>Av</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {config.versions.map((version, index) => (
                <Tr key={version.id}>
                  <Td>
                    {version.version}
                    {index === 0 && (
                      <span className="ml-2">
                        <Badge tone="active">Gäller</Badge>
                      </span>
                    )}
                  </Td>
                  <Td muted>{formatDateTime(version.createdAt)}</Td>
                  <Td muted>{version.createdByEmail}</Td>
                  <Td>
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      <ButtonLink
                        href={`/api/plattform/skarmar/fil/${version.id}`}
                        tone="secondary"
                        prefetch={false}
                      >
                        Ladda ner
                      </ButtonLink>
                      {index > 0 && (
                        <RestoreVersion
                          configId={config.id}
                          versionId={version.id}
                          version={version.version}
                        />
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
