import {
  companyNameById,
  listCompanies,
  recentPlatformActivity,
  requirePlatformAdmin,
  summarizeRevenue,
} from "@/lib/platform-admin";
import { emailIsConfigured } from "@/lib/email";
import { paymentsAvailable } from "@/lib/stripe";
import { ButtonLink, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import PlatformShell from "@/components/platform/PlatformShell";
import RevenueChart from "@/components/platform/RevenueChart";
import ActivityTable from "@/components/platform/ActivityTable";
import { Fact, Facts, Section } from "@/components/platform/Pieces";
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
export const metadata = { title: "Översikt · Tikkr" };

/**
 * ÖVERSIKTEN.
 *
 * Sidan svarar på en fråga: behöver något min uppmärksamhet i dag?
 *
 * Den hette tidigare Kundöversikt och gjorde sex saker — nyckeltal, graf, tre
 * bevakningslistor, en sökbar kundtabell, åtgärdslogg och driftläge. Tabellen
 * var det man kom för när man letade en viss kund, allt annat det man kom för
 * när man inte letade något särskilt. Två olika ärenden på samma sida, och det
 * ena drunknade alltid i det andra.
 *
 * Kundlistan har därför en egen sida. Här står bara det som ändrar sig av sig
 * självt och som man vill se utan att leta.
 *
 * Tre delar, i den ordning de blir viktiga: vad som kräver handling, hur det
 * går, och om maskineriet mår bra.
 */
export default async function PlatformPage() {
  const { email } = await requirePlatformAdmin();

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

  const stripeReady = await paymentsAvailable();

  const revenue = summarizeRevenue(companies);
  const usedLast30 = companies.filter(
    (company) => company.entriesLast30Days > 0
  ).length;

  const watching = devices.length + trials.length + quiet.length;
  const kr = (value: number) => `${value.toLocaleString("sv-SE")} kr`;

  return (
    <PlatformShell email={email}>
      <PageHeader
        title="Översikt"
        description={`${companies.length} företag på installationen, varav ${usedLast30} har registrerat tid senaste 30 dagarna.`}
        action={
          <ButtonLink href="/plattform/kunder" tone="secondary">
            Alla kunder
          </ButtonLink>
        }
      />

      {/* ATT BEVAKA LIGGER ÖVERST, och bara när det finns något. Listorna
          döljer sig själva när de är tomma — en panel full av tomma rutor lär
          ögat att hoppa över dem, och då syns inte den dagen något står där. */}
      {watching > 0 && (
        <Section title="Att bevaka" description="Visas bara när något avviker.">
          <div className="space-y-4">
            <SilentDeviceList devices={devices} />
            <EndingTrialList trials={trials} />
            <QuietCustomerList customers={quiet} />
          </div>
        </Section>
      )}

      <Section title="Intäkt" description="Belopp exklusive moms.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        <div className="mt-4">
          <RevenueChart points={history} />
        </div>
      </Section>

      <Section
        title="Drift"
        action={
          <ButtonLink href="/plattform/handelser" tone="secondary">
            Alla händelser
          </ButtonLink>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Tjänstens tillstånd" />
            <div className="px-5 pb-2">
              <Facts>
                <Fact label="Schemajobbet">
                  {health.lastCronRun
                    ? `Senast ${formatDateTime(health.lastCronRun)}${
                        // Jobbet ska köra var femtonde minut. Har det inte
                        // hörts av på en timme har det slutat köra, och glömda
                        // stämplingar ligger öppna tills någon upptäcker det.
                        Date.now() - health.lastCronRun.getTime() >
                        60 * 60 * 1000
                          ? " (över en timme sedan)"
                          : ""
                      }`
                    : "Ingen registrerad körning"}
                </Fact>
                <Fact label="Öppna stämplingar">{health.openEntries}</Fact>
                <Fact label="Väntar på granskning">{health.needsReview}</Fact>
                <Fact label="Databasens storlek">
                  {health.databaseSize ?? "Kunde inte läsas"}
                </Fact>
                <Fact label="E-postutskick">
                  {emailIsConfigured()
                    ? "Konfigurerat"
                    : "Avstängt. Mejl skrivs bara i loggen"}
                </Fact>
                <Fact label="Betalningar">
                  {stripeReady
                    ? "Stripe är kopplat"
                    : "Inte kopplat. Status sätts för hand"}
                </Fact>
              </Facts>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Senaste åtgärderna"
              description="Utförda från plattformspanelen."
            />
            {activity.length === 0 ? (
              <p className="p-5 text-[13px] text-neutral-500">
                Ingenting har gjorts från panelen än.
              </p>
            ) : (
              <ActivityTable rows={activity} companyNames={names} />
            )}
          </Card>
        </div>
      </Section>
    </PlatformShell>
  );
}
