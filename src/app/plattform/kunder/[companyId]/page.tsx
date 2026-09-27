import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCompanyDetail,
  monthlyRevenueFor,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  minutesBetween,
} from "@/lib/format";
import SubscriptionOverrideForm from "@/components/platform/SubscriptionOverrideForm";
import PlatformShell from "@/components/platform/PlatformShell";
import ManualLicenseForm from "@/components/platform/ManualLicenseForm";
import ModuleForm from "@/components/platform/ModuleForm";
import DeleteCompanyForm from "@/components/platform/DeleteCompanyForm";
import ActivityTable from "@/components/platform/ActivityTable";
import {
  Fact,
  Facts,
  Section,
  SubscriptionBadge,
} from "@/components/platform/Pieces";
import { startSupport, updateNote } from "./actions";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getModulePricing, getScreenPricing } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * ETT KUNDFÖRETAG.
 *
 * Sidan var tidigare sju kort i rad, alla lika viktiga för ögat, och man fick
 * läsa den uppifrån och ned för att hitta något. Nu är den fem delar med
 * varsin rubrik, i den ordning ett supportsamtal rör sig:
 *
 *   Nyckeltal   hur ser det ut?
 *   Avtal       vad betalar de för?
 *   Åtkomst     vilka kan logga in, vilka skärmar finns?
 *   Spår        vad har hänt, och vem har varit inne?
 *   Farlig zon  raderingen, avskild och sist.
 *
 * Gränsen för vad som visas står i getCompanyDetail: driftuppgifter är
 * åtkomliga, verksamhetsinnehåll är det inte.
 */
export default async function CompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { email } = await requirePlatformAdmin();
  const { companyId } = await params;

  const detail = await getCompanyDetail(companyId);
  if (!detail) notFound();

  const {
    company,
    admins,
    devices,
    note,
    history,
    historyTotal,
    stats,
    modules,
  } = detail;

  const managedByStripe = Boolean(company.stripeSubscriptionId);

  const monthlyRevenue = monthlyRevenueFor(
    company,
    await getScreenPricing(),
    await getModulePricing()
  );

  // Senaste tjugo besöken. Går utanför tenant-filtreringen med flit: raden
  // gäller LEVERANTÖRENS åtkomst till kunden, inte kundens egen data, och läses
  // bara här. Se SupportVisit i schemat.
  const visits = await unsafeGlobalPrisma.supportVisit.findMany({
    where: { companyId },
    orderBy: { startedAt: "desc" },
    take: 20,
    select: { id: true, email: true, startedAt: true, lastSeenAt: true },
  });

  const inactiveDays = stats.lastActivityAt
    ? Math.floor(
        (Date.now() - stats.lastActivityAt.getTime()) / (24 * 60 * 60 * 1000)
      )
    : null;

  return (
    <PlatformShell email={email}>
      <Link
        href="/plattform/kunder"
        className="text-[13px] font-medium text-blue-600 hover:underline"
      >
        ← Kunder
      </Link>

      <div className="mt-4">
        <PageHeader
          title={company.name}
          description={`Upplagt ${formatDate(company.createdAt)} · tidszon ${company.timezone} · stänger glömda stämplingar ${company.autoCloseAt}`}
          action={
            /* Vägen in i kundens panel, i läsläge. Ligger i rubriken och inte
               längst ner: när kunden ringer är det första man vill göra att se
               vad de ser. */
            <form action={startSupport}>
              <input type="hidden" name="companyId" value={company.id} />
              <Button type="submit" tone="secondary">
                Öppna kundens panel
              </Button>
            </form>
          }
        />

        {inactiveDays !== null && inactiveDays >= 14 && (
          <Alert tone="warning">
            Ingen registrerad tid på {inactiveDays} dagar.
          </Alert>
        )}

        <Section title="Nyckeltal">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        </Section>

        <Section title="Avtal">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Prenumeration" />
              <div className="space-y-4 p-5">
                <Facts>
                  <Fact label="Status">
                    <SubscriptionBadge status={company.subscriptionStatus} />
                  </Fact>
                  <Fact label="Licenser">
                    {company.screenLicenses}{" "}
                    {company.screenLicenses === 1 ? "skärm" : "skärmar"}
                  </Fact>
                  <Fact label="Betalningsintervall">
                    {company.subscriptionInterval === "year"
                      ? "Årsvis"
                      : company.subscriptionInterval === "month"
                        ? "Månadsvis"
                        : "—"}
                  </Fact>
                  <Fact label="Månadsintäkt">
                    {monthlyRevenue > 0
                      ? `${monthlyRevenue.toLocaleString("sv-SE")} kr`
                      : "—"}
                  </Fact>
                </Facts>

                {/* EN förklaring, inte en per formulär. Status, licenser och
                    tillval styrs alla av samma sak, och tre rutor som sa samma
                    mening lästes som tre olika besked. */}
                {managedByStripe ? (
                  <Alert tone="info">
                    Prenumerationen hanteras av Stripe. Status, licenser,
                    intervall och tillval ändras där och uppdateras här
                    automatiskt.
                  </Alert>
                ) : (
                  <>
                    <SubscriptionOverrideForm
                      companyId={company.id}
                      currentStatus={company.subscriptionStatus}
                      managedByStripe={false}
                    />

                    <div className="border-t border-neutral-100 pt-4">
                      <ManualLicenseForm
                        companyId={company.id}
                        current={company.screenLicenses}
                        used={devices.length}
                        managedByStripe={false}
                      />
                    </div>
                  </>
                )}
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Tillval" />
                <div className="p-5">
                  {/* Listan visas även för Stripe-kunder. Vad de köpt står
                      ingen annanstans i panelen. */}
                  <ModuleForm
                    companyId={company.id}
                    modules={modules}
                    managedByStripe={managedByStripe}
                  />
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Anteckning"
                  description="Visas inte för kunden."
                />
                <form action={updateNote} className="space-y-3 p-5">
                  <input type="hidden" name="companyId" value={company.id} />
                  <textarea
                    name="body"
                    rows={5}
                    defaultValue={note?.body ?? ""}
                    placeholder="Kontaktperson, avtal, supportärenden"
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
          </div>
        </Section>

        <Section title="Åtkomst">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Administratörer"
                description="Konton med åtkomst till arbetsytan."
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

            <Card>
              <CardHeader
                title="Stämplingsskärmar"
                description="Status och senaste kontakt."
              />
              {devices.length === 0 ? (
                <p className="p-5 text-[13px] text-neutral-500">
                  Ingen skärm upplagd. Kunden kan inte stämpla än.
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
                      <Tr key={device.id} dimmed={!device.tokenHash}>
                        <Td>{device.name}</Td>
                        <Td>
                          {device.tokenHash ? (
                            <Badge tone="active">Kopplad</Badge>
                          ) : (
                            <Badge tone="muted">Ej kopplad</Badge>
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
          </div>
        </Section>

        <Section
          title="Spår"
          action={
            historyTotal > 0 ? (
              <ButtonLink
                href={`/plattform/kunder/${company.id}/historik`}
                tone="secondary"
              >
                Hela historiken ({historyTotal})
              </ButtonLink>
            ) : undefined
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Senaste åtgärderna"
                description="Utförda från plattformspanelen."
              />
              {history.length === 0 ? (
                <p className="p-5 text-[13px] text-neutral-500">
                  Ingenting har ändrats för det här företaget.
                </p>
              ) : (
                <ActivityTable rows={history} />
              )}
            </Card>

            <Card>
              <CardHeader
                title="Supportbesök"
                description="Besök i kundens panel. Endast läsning."
              />
              {visits.length === 0 ? (
                <p className="p-5 text-[13px] text-neutral-500">
                  Ingen har öppnat kundens panel.
                </p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Startade</Th>
                      <Th>Vem</Th>
                      <Th numeric>Längd</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((visit) => (
                      <Tr key={visit.id}>
                        <Td muted>{formatDateTime(visit.startedAt)}</Td>
                        <Td>{visit.email}</Td>
                        <Td numeric muted>
                          {/* Räknas ur lastSeenAt, inte ur en utloggning. En
                              stängd flik lämnar aldrig ett slut, och ett tomt
                              fält hade sett ut som ett fel i loggen. */}
                          {formatDuration(
                            minutesBetween(visit.startedAt, visit.lastSeenAt)
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </Section>

        {/* Raderingen ligger sist, under en egen rubrik och en linje. Den ska
            gå att hitta av den som söker den, och aldrig råkas ut för av den
            som skummar. */}
        <div className="mt-12 border-t border-neutral-200 pt-8">
          <Section title="Farlig zon">
            <DeleteCompanyForm
              companyId={company.id}
              companyName={company.name}
              managedByStripe={managedByStripe}
            />
          </Section>
        </div>
      </div>
    </PlatformShell>
  );
}
