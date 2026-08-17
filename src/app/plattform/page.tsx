import Link from "next/link";
import {
  listCompanies,
  recentPlatformActivity,
  requirePlatformAdmin,
  summarizeRevenue,
} from "@/lib/platform-admin";
import { emailIsConfigured } from "@/lib/email";
import { isStripeConfigured } from "@/lib/stripe";
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
import PlatformShell from "@/components/platform/PlatformShell";
import RevenueChart from "@/components/platform/RevenueChart";
import {
  EndingTrialList,
  QuietCustomerList,
  SilentDeviceList,
} from "@/components/platform/WatchLists";
import {
  endingTrials,
  quietCustomers,
  silentDevices,
  systemHealth,
} from "@/lib/platform-health";
import { monthlyRevenueHistory } from "@/lib/revenue-history";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plattform — Tikkr" };

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { email } = await requirePlatformAdmin();
  const query = ((await searchParams).q ?? "").trim();

  const [companies, activity, devices, trials, quiet, history, health] =
    await Promise.all([
      listCompanies(),
      recentPlatformActivity(10),
      silentDevices(),
      endingTrials(),
      quietCustomers(),
      monthlyRevenueHistory(),
      systemHealth(),
    ]);

  const stripeReady = isStripeConfigured();

  // Siffrorna raknas pa ALLA foretag, aldrig pa soktraffarna. En manadsintakt
  // som andrar sig nar man soker ar inte en manadsintakt.
  const revenue = summarizeRevenue(companies);
  const usedLast30 = companies.filter(
    (company) => company.entriesLast30Days > 0
  ).length;

  const matches = query
    ? companies.filter((company) =>
        company.name.toLowerCase().includes(query.toLowerCase())
      )
    : companies;

  const kr = (value: number) => `${value.toLocaleString("sv-SE")} kr`;

  return (
    <PlatformShell email={email} current="/plattform">
      <PageHeader
        title="Kundöversikt"
        description="Alla företag som använder den här installationen."
      />

      <Alert tone="info">
        Panelen visar enbart aggregerade uppgifter: antal och tidpunkter.
        Kundernas innehåll — namn på anställda, ordrar och registrerade tider
        — är inte åtkomligt härifrån. För åtgärder i en kunds data krävs en
        inbjudan som administratör hos kunden.
        <span className="mt-1.5 block">
          Kontot tillhör inget kundföretag. För egen tidregistrering krävs en
          separat arbetsyta.
        </span>
      </Alert>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Månadsintäkt"
          value={kr(revenue.mrr)}
          tone={revenue.mrr > 0 ? "active" : "neutral"}
          hint={`${kr(revenue.arr)} på årsbasis`}
        />
        <Stat
          label="Betalande företag"
          value={revenue.payingCompanies}
          hint={`${kr(revenue.averagePerCompany)} i snitt per företag`}
        />
        <Stat
          label="Sålda licenser"
          value={revenue.licensesSold}
          hint="stämplingsskärmar"
        />
        <Stat
          label="Provperiod"
          value={revenue.trialingCompanies}
          hint={`${revenue.pastDueCompanies} med utebliven betalning`}
          tone={revenue.pastDueCompanies > 0 ? "warning" : "neutral"}
        />
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        Månadsintäkten avser återkommande intäkt från aktiva prenumerationer.
        Årsbetalningar räknas om till motsvarande månadsbelopp. Belopp anges
        exklusive moms och tar inte hänsyn till Stripes avgifter.
      </p>

      <p className="mt-1 text-xs text-neutral-500">
        {usedLast30} av {companies.length} företag har registrerat tid de
        senaste 30 dagarna.
      </p>

      <div className="mt-6">
        <RevenueChart points={history} />
      </div>

      {/* Bevakningslistorna. Var och en visas bara när den har innehåll — är
          allt i sin ordning syns ingenting alls, vilket är rätt svar. */}
      <div className="mt-6 space-y-4">
        <SilentDeviceList devices={devices} />
        <EndingTrialList trials={trials} />
        <QuietCustomerList customers={quiet} />
      </div>

      <div className="mt-6">
        {companies.length === 0 ? (
          <EmptyState
            title="Inga registrerade företag"
            description="Registrerade företag visas här."
          />
        ) : (
          <Card>
            <CardHeader
              title="Företag"
              description="Senast registrerade först. Utebliven aktivitet kan indikera en kund på väg att avsluta."
              action={
                // Formulär utan JavaScript. Sökningen hamnar i adressen, så
                // att en träfflista går att spara och skicka vidare.
                <form className="flex gap-2">
                  <input
                    type="search"
                    name="q"
                    defaultValue={query}
                    placeholder="Sök företag…"
                    className="w-44 rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white"
                  >
                    Sök
                  </button>
                </form>
              }
            />
            <Table>
              <thead>
                <tr>
                  <Th>Företag</Th>
                  <Th>Prenumeration</Th>
                  <Th numeric>Licenser</Th>
                  <Th numeric>Per månad</Th>
                  <Th numeric>Anställda</Th>
                  <Th numeric>Stämplingar 30 d</Th>
                  <Th>Senaste aktivitet</Th>
                  <Th>Upplagt</Th>
                </tr>
              </thead>
              <tbody>
                {matches.map((company) => (
                  <Tr key={company.id}>
                    <Td>
                      <Link
                        href={`/plattform/${company.id}`}
                        className="font-medium text-blue-600"
                      >
                        {company.name}
                      </Link>
                    </Td>
                    <Td>
                      <SubscriptionBadge status={company.subscriptionStatus} />
                    </Td>
                    <Td numeric muted>
                      {company.licenses}
                    </Td>
                    <Td numeric>
                      {company.monthlyRevenue > 0 ? kr(company.monthlyRevenue) : "—"}
                    </Td>
                    <Td numeric muted>
                      {company.employees}
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

            {matches.length === 0 && (
              <p className="px-5 py-6 text-center text-[13px] text-neutral-500">
                Inget företag matchar ”{query}”.{" "}
                <Link href="/plattform" className="text-blue-600">
                  Visa alla
                </Link>
              </p>
            )}
          </Card>
        )}
      </div>

      {activity.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Senaste åtgärderna"
            description="Åtgärder utförda från den här panelen, samtliga kunder."
          />
          <Table>
            <thead>
              <tr>
                <Th>När</Th>
                <Th>Vem</Th>
                <Th>Vad</Th>
              </tr>
            </thead>
            <tbody>
              {activity.map((row) => (
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
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Driftläge"
          description="Siffror som visar om något är på väg att gå fel innan det gör det."
        />
        <dl className="divide-y divide-neutral-100 text-[13px]">
          <Row
            label="Schemajobbet"
            value={
              health.lastCronRun
                ? `Senast ${formatDateTime(health.lastCronRun)}${
                    // Jobbet ska köra var femtonde minut. Har det inte hörts av
                    // på en timme har det slutat köra, och glömda stämplingar
                    // ligger öppna tills någon upptäcker det.
                    Date.now() - health.lastCronRun.getTime() > 60 * 60 * 1000
                      ? " — har inte kört på över en timme"
                      : ""
                  }`
                : "Har aldrig rapporterat in — kontrollera crontab"
            }
          />
          <Row
            label="Öppna stämplingar"
            value={`${health.openEntries} just nu`}
          />
          <Row
            label="Väntar på granskning"
            value={`${health.needsReview} poster hos kunderna`}
          />
          <Row
            label="Databasens storlek"
            value={health.databaseSize ?? "Kunde inte läsas"}
          />
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
            value={
              stripeReady
                ? "Stripe är kopplat"
                : "Stripe är inte kopplat — status sätts för hand"
            }
          />
        </dl>
      </Card>
    </PlatformShell>
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
