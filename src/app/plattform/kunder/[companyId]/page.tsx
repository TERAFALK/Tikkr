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
  Textarea,
  Th,
  Tr,
} from "@/components/ui";
import SaveForm from "@/components/admin/SaveForm";
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
import PriceForm, { type PriceRow } from "@/components/platform/PriceForm";
import DeleteCompanyForm from "@/components/platform/DeleteCompanyForm";
import ActivityTable from "@/components/platform/ActivityTable";
import {
  Fact,
  Facts,
  Section,
  SubscriptionBadge,
} from "@/components/platform/Pieces";
import { resetTwoStep, startSupport, updateNote } from "./actions";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getModulePricing, getScreenPricing } from "@/lib/stripe";
import { SCREEN_ITEM } from "@/lib/price-book";
import { discountFrom } from "@/lib/company-prices";
import { MODULES, MODULE_KEYS } from "@/lib/modules";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * ETT KUNDFÖRETAG.
 *
 * Sidan är en journal man LÄSER, med knappar för det som går att ändra. Den
 * var tidigare fem formulär utfällda ovanpå varandra, och man skrollade förbi
 * dem för att hitta vad som faktiskt stod. Ett formulär som alltid syns läses
 * som något man förväntas fylla i.
 *
 * Fem delar, i den ordning ett supportsamtal rör sig: nyckeltal, avtal,
 * åtkomst, spår, och sist raderingen.
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
    prices,
  } = detail;

  const managedByStripe = Boolean(company.stripeSubscriptionId);

  // Den som ringer först när något rör kontot: ägaren som registrerade
  // arbetsytan, alltså den äldsta. Listan är sorterad på roll och e-post, inte
  // på ålder, så den letas fram här.
  const owner = admins
    .filter((admin) => admin.role === "OWNER")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

  const screenPricing = await getScreenPricing();
  const modulePricing = await getModulePricing();

  const monthlyRevenue = monthlyRevenueFor(
    company,
    screenPricing,
    modulePricing,
    prices
  );

  // Raderna i prisrutan: skärmlicensen först, sedan tillvalen i registrets
  // ordning. Listpriset kommer från Stripe, det avtalade från kunden.
  const priceRow = (
    item: string,
    name: string,
    listMonth: number,
    agreed: number | undefined
  ): PriceRow => ({
    item,
    name,
    listMonth,
    agreed: agreed ?? null,
    discountPercent:
      agreed === undefined ? null : discountFrom(listMonth, agreed),
  });

  const priceRows: PriceRow[] = [
    priceRow(
      SCREEN_ITEM,
      "Skärmlicens",
      screenPricing.month,
      prices[SCREEN_ITEM]
    ),
    ...MODULE_KEYS.map((key) =>
      priceRow(key, MODULES[key].name, modulePricing[key].month, prices[key])
    ),
  ];

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
        className="text-[13px] font-medium text-tick-deep hover:underline"
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

        {owner && (
          <Section title="Kontaktperson">
            <Card>
              <div className="px-5 py-2">
                <Facts>
                  <Fact label="Ägare">{owner.name ?? "Saknas"}</Fact>
                  <Fact label="Telefon">
                    {owner.phone ? (
                      <a
                        href={`tel:${owner.phone}`}
                        className="font-medium text-tick-deep hover:underline"
                      >
                        {formatPhone(owner.phone)}
                      </a>
                    ) : (
                      "Saknas"
                    )}
                  </Fact>
                  <Fact label="E-postadress">
                    <a
                      href={`mailto:${owner.email}`}
                      className="font-medium text-tick-deep hover:underline"
                    >
                      {owner.email}
                    </a>
                  </Fact>
                </Facts>
              </div>
            </Card>
          </Section>
        )}

        <Section title="Avtal">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Prenumeration"
                action={
                  managedByStripe ? undefined : (
                    <SubscriptionOverrideForm
                      companyId={company.id}
                      currentStatus={company.subscriptionStatus}
                    />
                  )
                }
              />
              <div className="px-5 py-2">
                <Facts>
                  <Fact label="Status">
                    <SubscriptionBadge status={company.subscriptionStatus} />
                  </Fact>
                  <Fact label="Licenser">
                    <span className="flex items-center justify-end gap-2">
                      {company.screenLicenses}{" "}
                      {company.screenLicenses === 1 ? "skärm" : "skärmar"}
                      {!managedByStripe && (
                        <ManualLicenseForm
                          companyId={company.id}
                          current={company.screenLicenses}
                          used={devices.length}
                        />
                      )}
                    </span>
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
              </div>

              {/* EN förklaring, inte en per knapp. Status, licenser och tillval
                  styrs alla av samma sak. */}
              {managedByStripe && (
                <div className="border-t border-neutral-100 p-5">
                  <Alert tone="info">
                    Prenumerationen hanteras av Stripe. Status, licenser,
                    intervall och tillval ändras där och uppdateras här
                    automatiskt.
                  </Alert>
                </div>
              )}
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Tillval" />
                <div className="p-5">
                  <ModuleForm
                    companyId={company.id}
                    modules={modules}
                    managedByStripe={managedByStripe}
                  />
                </div>
              </Card>

              {/* AVTALADE PRISER. Egen ruta och inte en kolumn i tillvalen:
                  skärmlicensen har också ett pris, och den är inget tillval. */}
              <Card>
                <CardHeader
                  title="Avtalat pris"
                  description={
                    managedByStripe
                      ? "Priset styrs av artiklarna hos Stripe."
                      : "Visas för kunden med listpriset överstruket."
                  }
                />
                <div className="p-5">
                  <PriceForm
                    companyId={company.id}
                    prices={priceRows}
                    managedByStripe={managedByStripe}
                  />
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Anteckning"
                  description="Visas inte för kunden."
                />
                <SaveForm action={updateNote} className="space-y-3 p-5">
                  <input type="hidden" name="companyId" value={company.id} />
                  <Textarea
                    name="body"
                    rows={5}
                    defaultValue={note?.body ?? ""}
                    placeholder="Kontaktperson, avtal, supportärenden"
                  />
                  {note && (
                    <p className="text-xs text-neutral-400">
                      Senast ändrad {formatDateTime(note.updatedAt)} av{" "}
                      {note.updatedByEmail}
                    </p>
                  )}
                </SaveForm>
              </Card>
            </div>
          </div>
        </Section>

        <Section title="Åtkomst">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Administratörer" />
              <Table>
                <thead>
                  <tr>
                    <Th>Namn och e-post</Th>
                    <Th>Telefon</Th>
                    <Th>Behörighet</Th>
                    <Th>Tvåsteg</Th>
                    <Th>Upplagd</Th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <Tr key={admin.id}>
                      <Td>
                        {admin.name && (
                          <span className="block font-medium">{admin.name}</span>
                        )}
                        <a
                          href={`mailto:${admin.email}`}
                          className="text-tick-deep hover:underline"
                        >
                          {admin.email}
                        </a>
                      </Td>
                      <Td muted>
                        {admin.phone ? (
                          <a
                            href={`tel:${admin.phone}`}
                            className="hover:underline"
                          >
                            {formatPhone(admin.phone)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td muted>
                        {admin.role === "OWNER" ? "Ägare" : "Administratör"}
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          {admin.totpEnabledAt ? (
                            <Badge tone="active">Uppsatt</Badge>
                          ) : (
                            <Badge tone="muted">Inte uppsatt</Badge>
                          )}
                          {admin.totpEnabledAt && (
                            <form action={resetTwoStep}>
                              <input type="hidden" name="companyId" value={company.id} />
                              <input type="hidden" name="userId" value={admin.id} />
                              <ConfirmButton
                                type="submit"
                                tone="secondary"
                                question={`Nollställ tvåstegsinloggningen för ${admin.email}? Kontrollera först att det är personen själv som ber om det. Nästa inloggning visar en ny QR-kod, och alla inloggade sessioner avslutas.`}
                              >
                                Nollställ
                              </ConfirmButton>
                            </form>
                          )}
                        </span>
                      </Td>
                      <Td muted>{formatDate(admin.createdAt)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <Card>
              <CardHeader title="Stämplingsskärmar" />
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
              <CardHeader title="Senaste åtgärderna" />
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
