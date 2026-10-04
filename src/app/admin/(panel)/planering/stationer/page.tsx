import { Fragment } from "react";
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
 * LISTAN ÄR GRUPPERAD PÅ ARBETSMOMENT, som tavlan. Momentet står som en rubrik
 * över sin grupp i stället för i en kolumn på varje rad: det upprepades annars
 * en gång per station och sa ingenting nytt efter den första.
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

  // Stationerna kommer redan grupperade på moment från stationsFor. Grupperna
  // byggs här bara för att rubrikerna och pilarna ska veta var en grupp
  // börjar och slutar: en pil får inte kunna flytta en station förbi kanten.
  const groups: { momentName: string; rows: typeof stations }[] = [];

  for (const station of stations) {
    const last = groups[groups.length - 1];

    if (last && last.momentName === station.momentName) last.rows.push(station);
    else groups.push({ momentName: station.momentName, rows: [station] });
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
                <Th>Namn</Th>
                <Th>Öppettider</Th>
                <Th numeric>Per vecka (tim:min)</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {groups.map((group) => (
                <Fragment key={group.momentName}>
                  {/* Momentet som rubrik över sin grupp. Stationerna under den
                      är utbytbara mot varandra och inget annat, och det är
                      själva skälet att de ligger ihop. */}
                  <tr>
                    <Td colSpan={5}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                        {group.momentName}
                      </span>
                    </Td>
                  </tr>

                  {group.rows.map((station, index) => {
                    const weekMinutes = station.hours.reduce(
                      (total, day) => total + capacityOf(day),
                      0
                    );

                    return (
                      <Tr key={station.id} dimmed={!station.active}>
                        <Td>
                          <span className="font-medium">{station.name}</span>
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
                            first={index === 0}
                            last={index === group.rows.length - 1}
                            saveAction={saveStationAction}
                            toggleAction={toggleStationAction}
                            deleteAction={deleteStationAction}
                            moveAction={moveStationAction}
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </Fragment>
              ))}
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
