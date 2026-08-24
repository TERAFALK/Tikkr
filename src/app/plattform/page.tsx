import Link from "next/link";
import {
  companyNameById,
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
  ButtonLink,
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
import ActivityTable from "@/components/platform/ActivityTable";
import Pager from "@/components/platform/Pager";
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

/** Antal företag per sida i listan. */
const COMPANIES_PER_PAGE = 25;

export const dynamic = "force-dynamic";
export const metadata = { title: "Plattform — Tikkr" };

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sida?: string }>;
}) {
  const { email } = await requirePlatformAdmin();

  const search = await searchParams;
  const query = (search.q ?? "").trim();

  const [companies, activity, names, devices, trials, quiet, history, health] =
    await Promise.all([
      listCompanies(),
      recentPlatformActivity(),
      companyNameById(),
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

  // Sidbläddring. Företagen är redan hämtade — summeringarna ovanför räknas på
  // samtliga och får inte ändra sig när man bläddrar — så det här är en
  // uppdelning av en lista vi ändå har, inte en extra databasfråga.
  const pageCount = Math.max(1, Math.ceil(matches.length / COMPANIES_PER_PAGE));
  const page = Math.min(Math.max(1, Number(search.sida) || 1), pageCount);
  const shown = matches.slice(
    (page - 1) * COMPANIES_PER_PAGE,
    page * COMPANIES_PER_PAGE
  );

  /** Bevarar sökningen när man bläddrar. */
  const listHref = (next: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("sida", String(next));
    return `/plattform?${params}`;
  };

  const kr = (value: number) => `${value.toLocaleString("sv-SE")} kr`;

  return (
    <PlatformShell email={email} current="/plattform">
      <PageHeader
        title="Kundöversikt"
        description="Alla företag som använder den här installationen."
      />

      <Alert tone="info">
        Panelen visar aggregerade uppgifter. Kundernas innehåll — namn på
        anställda, ordrar och registrerade tider — är inte åtkomligt härifrån.
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
        Belopp exklusive moms och före betaltjänstens avgifter. {usedLast30} av{" "}
        {companies.length} företag har registrerat tid de senaste 30 dagarna.
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
              description="Senast registrerade först."
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
                {shown.map((company) => (
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

            <Pager
              page={page}
              pageCount={pageCount}
              total={matches.length}
              unit={query ? "träffar" : "företag"}
              hrefFor={listHref}
            />
          </Card>
        )}
      </div>

      {/* Bara de senaste. Hela loggen ligger under Händelser — den växte
          annars i all oändlighet längst ned på den här sidan. */}
      {activity.length > 0 && (
        <Card className="mt-6">
          <CardHeader
            title="Senaste åtgärderna"
            description="Utförda från plattformspanelen."
            action={
              <ButtonLink href="/plattform/handelser" tone="secondary">
                Alla händelser
              </ButtonLink>
            }
          />
          <ActivityTable rows={activity} companyNames={names} />
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Driftläge" />
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
                      ? " (över en timme sedan)"
                      : ""
                  }`
                : "Ingen registrerad körning"
            }
          />
          <Row
            label="Öppna stämplingar"
            value={`${health.openEntries} just nu`}
          />
          <Row
            label="Väntar på granskning"
            value={`${health.needsReview} poster`}
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
