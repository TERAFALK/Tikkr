import Link from "next/link";
import {
  listCompanies,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import { emailIsConfigured } from "@/lib/email";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plattform — Tikkr" };

export default async function PlatformPage() {
  const { email } = await requirePlatformAdmin();
  const companies = await listCompanies();

  const active = companies.filter(
    (company) => company.subscriptionStatus === "ACTIVE"
  ).length;
  const trialing = companies.filter(
    (company) => company.subscriptionStatus === "TRIALING"
  ).length;
  const totalDevices = companies.reduce(
    (sum, company) => sum + company.devices,
    0
  );
  const usedLast30 = companies.filter(
    (company) => company.entriesLast30Days > 0
  ).length;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-[13px] font-semibold text-white">
            T
          </span>
          <span className="text-[13px] font-semibold">Tikkr · Plattform</span>
          <span className="ml-auto text-[13px] text-neutral-400">{email}</span>
          <Link
            href="/admin"
            className="text-[13px] font-medium text-blue-600"
          >
            Till min arbetsyta
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          title="Kundöversikt"
          description="Alla företag som använder den här installationen."
        />

        <Alert tone="info">
          Vyn visar bara siffror — antal och tidpunkter. Innehållet i kundernas
          data, alltså namn på anställda, ordrar och registrerade tider, är
          medvetet inte åtkomligt härifrån. Behöver du hjälpa en kund med något
          konkret får de bjuda in dig som administratör hos sig.
        </Alert>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Kundföretag" value={companies.length} />
          <Stat
            label="Betalande"
            value={active}
            tone={active > 0 ? "active" : "neutral"}
          />
          <Stat label="Provperiod" value={trialing} />
          <Stat
            label="Aktiva senaste 30 dagarna"
            value={usedLast30}
            hint={`${totalDevices} skärmar totalt`}
          />
        </div>

        <div className="mt-6">
          {companies.length === 0 ? (
            <EmptyState
              title="Inga företag än"
              description="Så fort någon registrerar sig dyker de upp här."
            />
          ) : (
            <Card>
              <CardHeader
                title="Företag"
                description="Nyast först. Ett företag utan aktivitet på länge är en kund på väg att sluta."
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Företag</Th>
                    <Th>Prenumeration</Th>
                    <Th numeric>Admins</Th>
                    <Th numeric>Anställda</Th>
                    <Th numeric>Skärmar</Th>
                    <Th numeric>Ordrar</Th>
                    <Th numeric>Stämplingar 30 d</Th>
                    <Th>Senaste aktivitet</Th>
                    <Th>Upplagt</Th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <Tr key={company.id}>
                      <Td>
                        <span className="font-medium">{company.name}</span>
                      </Td>
                      <Td>
                        <SubscriptionBadge status={company.subscriptionStatus} />
                      </Td>
                      <Td numeric muted>
                        {company.admins}
                      </Td>
                      <Td numeric muted>
                        {company.employees}
                      </Td>
                      <Td numeric muted>
                        {company.devices}
                      </Td>
                      <Td numeric muted>
                        {company.openOrders}
                      </Td>
                      <Td numeric>
                        {company.entriesLast30Days === 0 ? (
                          <span className="text-neutral-400">0</span>
                        ) : (
                          company.entriesLast30Days
                        )}
                      </Td>
                      <Td muted>
                        {company.lastActivityAt
                          ? formatDateTime(company.lastActivityAt)
                          : "Aldrig"}
                      </Td>
                      <Td muted>{formatDate(company.createdAt)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>

        <Card className="mt-6">
          <CardHeader title="Driftläge" />
          <dl className="divide-y divide-neutral-100 text-[13px]">
            <Row
              label="E-postutskick"
              value={
                emailIsConfigured()
                  ? "Konfigurerat"
                  : "Avstängt — mejl skrivs bara i loggen"
              }
            />
            <Row
              label="Betalningar"
              value="Stripe är inte kopplat än"
            />
          </dl>
        </Card>
      </main>
    </div>
  );
}

function SubscriptionBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge tone="active">Aktiv</Badge>;
  if (status === "TRIALING") return <Badge>Provperiod</Badge>;
  if (status === "PAST_DUE") return <Badge tone="warning">Obetald</Badge>;
  return <Badge tone="muted">Avslutad</Badge>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
