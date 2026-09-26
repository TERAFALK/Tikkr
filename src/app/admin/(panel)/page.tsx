import { requireAdmin } from "@/lib/admin-session";
import {
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
import {
  IconClock,
  IconOrder,
  IconPeople,
  IconReview,
} from "@/components/ui/icons";
import { formatDuration, formatTime, minutesBetween } from "@/lib/format";
import { getOnboardingState } from "@/lib/onboarding";
import { mainMinutes, type Span } from "@/lib/spans";
import { companyTimeZone } from "@/lib/company";
import { startOfDayIn } from "@/lib/time-zone";
import { cronStatus } from "@/lib/platform-health";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { db, companyId, companyName } = await requireAdmin();
  const onboarding = await getOnboardingState(db);

  // Ligger schemajobbet nere stängs inga glömda stämplingar, och posterna
  // räknas upp i evighet. Det måste stå i panelen: en säkerhetsfunktion som
  // tyst slutat köra är värre än ingen alls, eftersom man litar på den.
  const cron = await cronStatus();

  // Dygnet börjar i FÖRETAGETS tidszon, inte serverns. Containern kör UTC, så
  // ett dygn räknat där börjar 02:00 på verkstadsgolvet på sommaren — och ett
  // kvällspass hamnar på fel dag jämfört med rapporten för samma datum.
  const timeZone = await companyTimeZone(companyId);
  const startOfToday = startOfDayIn(new Date(), timeZone);

  const [working, todaysEntries, needsReview, openOrders] = await Promise.all([
    db.timeEntry.findMany({
      where: { clockOutAt: null },
      orderBy: { clockInAt: "asc" },
      select: {
        id: true,
        employeeId: true,
        clockInAt: true,
        employee: { select: { name: true } },
        kind: true,
        order: {
          select: { orderNumber: true, customer: { select: { name: true } } },
        },
        moment: { select: { name: true } },
        indirectMoment: { select: { name: true } },
      },
    }),
    db.timeEntry.findMany({
      where: { clockInAt: { gte: startOfToday } },
      select: { employeeId: true, clockInAt: true, clockOutAt: true },
    }),
    db.timeEntry.count({ where: { needsReview: true } }),
    db.order.count({ where: { status: "OPEN" } }),
  ]);

  // Antalet PERSONER som arbetar, inte antalet öppna stämplingar. Sedan en
  // operatör kan köra två maskiner är de två olika tal, och rutan påstår
  // annars att verkstaden är dubbelt så full som den är.
  const peopleWorking = new Set(working.map((entry) => entry.employeeId)).size;

  // Samma räknesätt som veckovyn: bara huvudstämplingen, och per person — se
  // spans.ts. Ett sidojobb är inte en extra timme någon varit på plats, det är
  // samma timme bokförd på en order till. Rapporten för samma dag visar mer,
  // och ska göra det.
  //
  // Pågående jobb räknas fram till en och samma tidpunkt, annars får två jobb
  // som fortfarande löper olika sluttid och överlappet blir fel.
  const now = Date.now();

  const spansByEmployee = new Map<string, Span[]>();

  for (const entry of todaysEntries) {
    const spans = spansByEmployee.get(entry.employeeId) ?? [];
    spans.push({
      from: entry.clockInAt.getTime(),
      to: entry.clockOutAt?.getTime() ?? now,
    });
    spansByEmployee.set(entry.employeeId, spans);
  }

  const minutesToday = [...spansByEmployee.values()].reduce(
    (total, spans) => total + mainMinutes(spans),
    0
  );

  return (
    <>
      <PageHeader
        title="Översikt"
        description={`Läget just nu hos ${companyName}.`}
        action={
          <ButtonLink href="/admin/rapporter" tone="secondary">
            Till rapporter
          </ButtonLink>
        }
      />

      {!onboarding.ready && (
        <Card className="mb-6 border-blue-200 bg-blue-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-900">
                {onboarding.completed} av {onboarding.total} steg klara
              </p>
              <p className="mt-0.5 text-[13px] text-blue-800">
                Stämplingsskärmen kan användas när uppsättningen är slutförd.
              </p>
            </div>
            <ButtonLink href="/admin/kom-igang">Fortsätt uppsättningen</ButtonLink>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Arbetar just nu"
          value={peopleWorking}
          tone={peopleWorking > 0 ? "active" : "neutral"}
          hint={
            // Antalet PERSONER, inte antalet stämplingar. En operatör som kör
            // två maskiner har två öppna poster men är fortfarande en person.
            working.length > peopleWorking
              ? `${working.length} pågående jobb`
              : peopleWorking === 1
                ? "person instämplad"
                : "personer instämplade"
          }
          icon={<IconPeople />}
        />
        <Stat
          label="Registrerat idag"
          value={formatDuration(minutesToday)}
          hint="inklusive pågående jobb"
          icon={<IconClock />}
        />
        <Stat
          label="Att granska"
          value={needsReview}
          tone={needsReview > 0 ? "warning" : "neutral"}
          hint="poster systemet stängt automatiskt"
          icon={<IconReview />}
        />
        <Stat label="Öppna ordrar" value={openOrders} icon={<IconOrder />} />
      </div>

      {cron.stale && (
        /* Rött och inte gult. Det här är inte något att titta på när man får
           tid — tid som inte stängs blir fel fakturaunderlag, och varje dygn
           som går lägger till en post till. */
        <Card className="mt-6 border-red-200 bg-red-50/60 p-4">
          <p className="text-sm font-medium text-red-900">
            Automatisk utstämpling körs inte
          </p>
          <p className="mt-0.5 text-[13px] text-red-800">
            {cron.lastRun
              ? `Schemajobbet rapporterade senast in för ${cron.minutesAgo} minuter sedan. Det ska köra var 15:e minut.`
              : "Schemajobbet har aldrig rapporterat in."}{" "}
            Glömda stämplingar stängs inte, utan ligger öppna och räknas upp.
            Kontakta den som driftar servern — jobbet läggs in där, inte här.
          </p>
        </Card>
      )}

      {needsReview > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-900">
                {needsReview} {needsReview === 1 ? "post" : "poster"} behöver
                granskas
              </p>
              <p className="mt-0.5 text-[13px] text-amber-800">
                Utstämpling saknas. Sluttiden är beräknad av systemet och bör
                kontrolleras före fakturering.
              </p>
            </div>
            <ButtonLink href="/admin/granskning">Granska nu</ButtonLink>
          </div>
        </Card>
      )}

      <div className="mt-6">
        {working.length === 0 ? (
          <EmptyState
            title="Ingen är instämplad just nu"
            description="Pågående arbete visas här så snart någon stämplat in."
          />
        ) : (
          <Card>
            <CardHeader
              title="Pågående arbete"
              description="Tiden räknas upp till dess att posten avslutas."
            />
            <Table>
            <thead>
              <tr>
                <Th>Anställd</Th>
                <Th>Order</Th>
                <Th>Arbetsmoment</Th>
                <Th>Sedan</Th>
                <Th numeric>Tid (tim:min)</Th>
              </tr>
            </thead>
            <tbody>
              {working.map((entry) => (
                <Tr key={entry.id}>
                  <Td>
                    <span className="font-medium">{entry.employee.name}</span>
                  </Td>
                  <Td>
                    {entry.order?.orderNumber ?? (
                      <Badge tone="muted">Improduktiv</Badge>
                    )}
                    {entry.order?.customer && (
                      <span className="ml-2 text-neutral-500">
                        {entry.order.customer.name}
                      </span>
                    )}
                  </Td>
                  <Td muted>
                    {entry.moment?.name ?? entry.indirectMoment?.name ?? "—"}
                  </Td>
                  <Td muted>{formatTime(entry.clockInAt, timeZone)}</Td>
                  <Td numeric>
                    <Badge tone="active">
                      {formatDuration(minutesBetween(entry.clockInAt, null))}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
