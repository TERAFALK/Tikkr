import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCompanyDetail,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import SubscriptionOverrideForm from "@/components/admin/SubscriptionOverrideForm";
import PlatformShell from "@/components/platform/PlatformShell";
import ManualLicenseForm from "@/components/platform/ManualLicenseForm";
import { monthlyRevenueFor } from "@/lib/platform-admin";
import { getScreenPricing } from "@/lib/stripe";
import { updateNote } from "./actions";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { email } = await requirePlatformAdmin();
  const { companyId } = await params;

  const detail = await getCompanyDetail(companyId);
  if (!detail) notFound();

  const { company, admins, devices, note, history, stats } = detail;
  const monthlyRevenue = monthlyRevenueFor(company, await getScreenPricing());

  const inactiveDays = stats.lastActivityAt
    ? Math.floor(
        (Date.now() - stats.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000)
      )
    : null;

  return (
    <PlatformShell email={email} current="/plattform">
      <Link
        href="/plattform"
        className="text-[13px] font-medium text-blue-600 hover:underline"
      >
        ← Kundöversikt
      </Link>

      <div className="mt-4">
        <PageHeader
          title={company.name}
          description={`Upplagt ${formatDate(company.createdAt)} · tidszon ${company.timezone} · stänger glömda stämplingar ${company.autoCloseAt}`}
        />

        {inactiveDays !== null && inactiveDays >= 14 && (
          <Alert tone="warning">
            Ingen registrerad tid på {inactiveDays} dagar. Utebliven aktivitet
            kan indikera en kund på väg att avsluta.
          </Alert>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Stämplingar 30 d"
            value={stats.entriesLast30Days}
            tone={stats.entriesLast30Days > 0 ? "active" : "warning"}
            hint={`${stats.totalEntries} totalt`}
          />
          <Stat label="Anställda" value={stats.employees} />
          <Stat label="Öppna ordrar" value={stats.openOrders} />
          <Stat
            label="Ogranskade poster"
            value={stats.needsReview}
            tone={stats.needsReview > 0 ? "warning" : "neutral"}
            hint={`${stats.openNow} pågår just nu`}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Prenumeration */}
          <Card>
            <CardHeader
              title="Prenumeration"
              description="Manuell status används för fakturakunder och förlängda provperioder."
            />
            <div className="space-y-4 p-5">
              <dl className="divide-y divide-neutral-100 text-[13px]">
                <Row
                  label="Status"
                  value={<SubscriptionBadge status={company.subscriptionStatus} />}
                />
                <Row
                  label="Licenser"
                  value={`${company.screenLicenses} skärmar`}
                />
                <Row
                  label="Betalningsintervall"
                  value={
                    company.subscriptionInterval === "year"
                      ? "Årsvis"
                      : company.subscriptionInterval === "month"
                        ? "Månadsvis"
                        : "—"
                  }
                />
                <Row
                  label="Månadsintäkt"
                  value={
                    monthlyRevenue > 0
                      ? `${monthlyRevenue.toLocaleString("sv-SE")} kr`
                      : "—"
                  }
                />
              </dl>

              <SubscriptionOverrideForm
                companyId={company.id}
                currentStatus={company.subscriptionStatus}
                managedByStripe={Boolean(company.stripeSubscriptionId)}
              />
            </div>
          </Card>

          {/* Licenser för fakturakunder */}
          <Card>
            <CardHeader
              title="Antal licenser"
              description="En licens ger en stämplingsskärm. Sätts här för kunder som betalar mot faktura."
            />
            <ManualLicenseForm
              companyId={company.id}
              current={company.screenLicenses}
              used={devices.filter((device) => device.active).length}
              managedByStripe={Boolean(company.stripeSubscriptionId)}
            />
          </Card>

          {/* Anteckning */}
          <Card>
            <CardHeader
              title="Intern anteckning"
              description="Interna noteringar. Visas inte för kunden."
            />
            <form action={updateNote} className="space-y-3 p-5">
              <input type="hidden" name="companyId" value={company.id} />
              <textarea
                name="body"
                rows={6}
                defaultValue={note?.body ?? ""}
                placeholder="Kontaktperson, avtalsdetaljer, vad supportärendet handlade om…"
                className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
              {note && (
                <p className="text-xs text-neutral-400">
                  Senast ändrad {formatDateTime(note.updatedAt)} av{" "}
                  {note.updatedByEmail}
                </p>
              )}
              <Button type="submit" tone="secondary">
                Spara anteckning
              </Button>
            </form>
          </Card>
        </div>

        {/* Kontakter */}
        <Card className="mt-6">
          <CardHeader
            title="Vilka som kan logga in"
            description="Kontaktadresser för supportärenden och fakturering."
          />
          <Table>
            <thead>
              <tr>
                <Th>E-postadress</Th>
                <Th>Behörighet</Th>
                <Th>Upplagd</Th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <Tr key={admin.id}>
                  <Td>
                    <a
                      href={`mailto:${admin.email}`}
                      className="font-medium text-blue-600"
                    >
                      {admin.email}
                    </a>
                  </Td>
                  <Td muted>
                    {admin.role === "OWNER" ? "Ägare" : "Administratör"}
                  </Td>
                  <Td muted>{formatDate(admin.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        {/* Skärmar */}
        <Card className="mt-6">
          <CardHeader
            title="Stämplingsskärmar"
            description="Kopplade stämplingsskärmar och tidpunkt för senaste kontakt."
          />
          {devices.length === 0 ? (
            <p className="p-5 text-[13px] text-neutral-500">
              Ingen skärm upplagd. Kunden kan alltså inte stämpla än.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Namn</Th>
                  <Th>Status</Th>
                  <Th>Senast aktiv</Th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <Tr key={device.id} dimmed={!device.active}>
                    <Td>{device.name}</Td>
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
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Logg */}
        <Card className="mt-6">
          <CardHeader
            title="Vad som gjorts härifrån"
            description="Samtliga åtgärder i panelen loggas och kan redovisas i efterhand."
          />
          {history.length === 0 ? (
            <p className="p-5 text-[13px] text-neutral-500">
              Ingenting har ändrats för det här företaget.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>När</Th>
                  <Th>Vem</Th>
                  <Th>Vad</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <Tr key={row.id}>
                    <Td muted>{formatDateTime(row.createdAt)}</Td>
                    <Td muted>{row.actorEmail}</Td>
                    <Td>
                      {row.action}
                      {row.detail && (
                        <span className="mt-0.5 block text-neutral-500">
                          {row.detail}
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Alert tone="info">
          Innehållet i kundens data — namn på anställda, ordernummer och
          registrerade tider — är inte åtkomligt från plattformspanelen. För
          åtgärder som kräver sådan åtkomst krävs en inbjudan som administratör
          i kundens arbetsyta, med en behörighet kunden själv kan återkalla.
        </Alert>
      </div>
    </PlatformShell>
  );
}

function SubscriptionBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge tone="active">Aktiv</Badge>;
  if (status === "TRIALING") return <Badge>Provperiod</Badge>;
  if (status === "PAST_DUE") return <Badge tone="warning">Obetald</Badge>;
  return <Badge tone="muted">Avslutad</Badge>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
