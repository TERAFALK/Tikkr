import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import { DEFAULT_STATION_HOURS, stationsFor } from "@/lib/planning";
import { capacityOf } from "@/lib/plan-calendar";
import { describeWeek, formatMinuteOfDay } from "@/lib/weekly-hours";
import { formatDuration } from "@/lib/format";
import StationDialog from "@/components/admin/StationDialog";
import StationRowActions from "@/components/admin/StationRowActions";
import type { ScheduleDayValue } from "@/components/admin/ScheduleDays";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import {
  deleteStationAction,
  moveStationAction,
  saveStationAction,
  toggleStationAction,
} from "../actions";

/**
 * STATIONSREGISTRET.
 *
 * En station är en maskin eller arbetsplats som kör ETT arbetsmoment. Momentet
 * ÄR maskinen (CLAUDE.md § 3 regel 2), men en verkstad har ofta två fräsar —
 * därför kan samma moment ligga på flera stationer, och en station bara ha ett
 * moment.
 *
 * ARBETSMOMENTET STÅR UNDER STATIONSNAMNET, precis som på tavlan. Det låg en
 * kort tid som en rubrikrad över varje grupp, och blev då en tom rad mellan
 * varje station: en verkstad med fyra maskiner på fyra moment fick fyra rader
 * som bara upprepade ett ord. Listan är fortfarande sorterad på moment, så
 * stationer som kan ersätta varandra står ihop — det syns på att namnet under
 * dem är detsamma, utan att något behöver ritas.
 *
 * Öppettiderna skrivs ihop — "mån–fre 07:00–16:00" och inte fem rader med
 * samma klockslag. Se describeWeek.
 */

export const dynamic = "force-dynamic";

export default async function StationsPage() {
  const session = await requireAdmin();
  await requireModule(session, "PLANNING");

  const { db, companyId } = session;
  const timeZone = await companyTimeZone(companyId);

  const [stations, moments] = await Promise.all([
    stationsFor(db, timeZone),
    db.workMoment.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
  ]);

  const activeMoments = moments.filter((moment) => moment.active);

  const newStation = (
    <StationDialog
      trigger="Ny station"
      triggerTone="primary"
      title="Lägg till station"
      submitLabel="Lägg till"
      action={saveStationAction}
      moments={activeMoments}
      days={toDayValues(DEFAULT_STATION_HOURS)}
    />
  );

  // Stationerna kommer redan grupperade på moment från stationsFor. Var och en
  // behöver veta var i SIN grupp den står: pilarna flyttar inom gruppen, och en
  // pil som pekade förbi kanten hade inte gjort någonting.
  const place = new Map<string, { first: boolean; last: boolean; alone: boolean }>();

  for (let index = 0; index < stations.length; index++) {
    const moment = stations[index].momentId;
    const first = index === 0 || stations[index - 1].momentId !== moment;
    const last =
      index === stations.length - 1 ||
      stations[index + 1].momentId !== moment;

    place.set(stations[index].id, { first, last, alone: first && last });
  }

  return (
    <>
      <PageHeader
        title="Stationer"
        action={
          <div className="flex gap-2">
            <ButtonLink href="/admin/planering" tone="secondary">
              Till tavlan
            </ButtonLink>
            {activeMoments.length > 0 && newStation}
          </div>
        }
      />

      {activeMoments.length === 0 ? (
        <EmptyState
          title="Inga arbetsmoment upplagda"
          description="En station kör ett arbetsmoment. Lägg upp momenten först."
          action={
            <ButtonLink href="/admin/moment">Till arbetsmoment</ButtonLink>
          }
        />
      ) : stations.length === 0 ? (
        <EmptyState title="Inga stationer upplagda" action={newStation} />
      ) : (
        <Card>
          <CardHeader
            title={`${stations.length} ${
              stations.length === 1 ? "station" : "stationer"
            }`}
          />
          <Table>
            <thead>
              <tr>
                <Th>Station</Th>
                <Th>Öppettider</Th>
                <Th numeric>Per vecka (tim:min)</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {stations.map((station) => {
                const weekMinutes = station.hours.reduce(
                  (total, day) => total + capacityOf(day),
                  0
                );

                const spot = place.get(station.id)!;

                return (
                  <Tr key={station.id} dimmed={!station.active}>
                    <Td>
                      <span className="font-medium">{station.name}</span>
                      <span className="mt-0.5 block text-[12px] text-neutral-500">
                        {station.momentName}
                      </span>
                    </Td>

                    <Td muted={station.hours.length === 0}>
                      {station.hours.length === 0
                        ? "Stängd hela veckan"
                        : describeWeek(station.hours)}
                    </Td>

                    <Td numeric muted={weekMinutes === 0}>
                      {formatDuration(weekMinutes)}
                    </Td>

                    <Td>
                      {station.active ? (
                        <Badge tone="active">Öppen</Badge>
                      ) : (
                        <Badge tone="muted">Stängd</Badge>
                      )}
                    </Td>

                    <Td>
                      <StationRowActions
                        station={{
                          id: station.id,
                          name: station.name,
                          momentId: station.momentId,
                          active: station.active,
                          upcomingBlocks: station.upcomingBlocks,
                          days: toDayValues(station.hours),
                        }}
                        moments={moments}
                        first={spot.first}
                        last={spot.last}
                        alone={spot.alone}
                        saveAction={saveStationAction}
                        toggleAction={toggleStationAction}
                        deleteAction={deleteStationAction}
                        moveAction={moveStationAction}
                      />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

/** Minuter från midnatt till klockslag, som formuläret vill ha dem. */
function toDayValues(
  days: {
    weekday: number;
    startMinute: number;
    endMinute: number;
    breaks: { startMinute: number; endMinute: number }[];
  }[]
): ScheduleDayValue[] {
  return days.map((day) => ({
    weekday: day.weekday,
    start: formatMinuteOfDay(day.startMinute),
    end: formatMinuteOfDay(day.endMinute),
    breaks: day.breaks.map((rest) => ({
      start: formatMinuteOfDay(rest.startMinute),
      end: formatMinuteOfDay(rest.endMinute),
    })),
  }));
}
