import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import { DEFAULT_STATION_HOURS, stationsFor } from "@/lib/planning";
import { capacityOf } from "@/lib/plan-calendar";
import { formatMinuteOfDay } from "@/lib/weekly-hours";
import { formatDuration } from "@/lib/format";
import StationDialog from "@/components/admin/StationDialog";
import ActionDialog from "@/components/ui/ActionDialog";
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
  saveStationAction,
  toggleStationAction,
  moveStationAction,
} from "../actions";

/**
 * STATIONSREGISTRET.
 *
 * En station är en maskin eller arbetsplats som kör ETT arbetsmoment. Momentet
 * ÄR maskinen (CLAUDE.md § 3 regel 2), men en verkstad har ofta två fräsar —
 * därför kan samma moment ligga på flera stationer, och en station bara ha ett
 * moment.
 *
 * Öppettiderna är stationens, inte personalens. En maskin kan gå när ingen
 * står vid den, och den kan stå still fastän skiftet pågår. Det är hela skälet
 * att de ligger i egna tabeller och inte i lönemodulens scheman.
 */

export const dynamic = "force-dynamic";

const WEEKDAYS = ["mån", "tis", "ons", "tors", "fre", "lör", "sön"];

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
          <CardHeader title={`${stations.length} stationer`} />
          <Table>
            <thead>
              <tr>
                <Th>Namn</Th>
                <Th>Arbetsmoment</Th>
                <Th>Öppettider</Th>
                <Th numeric>Per vecka (tim:min)</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {stations.map((station, index) => {
                const weekMinutes = station.hours.reduce(
                  (total, day) => total + capacityOf(day),
                  0
                );

                return (
                  <Tr key={station.id} dimmed={!station.active}>
                    <Td>
                      <span className="font-medium">{station.name}</span>
                    </Td>
                    <Td>{station.momentName}</Td>
                    <Td muted={station.hours.length === 0}>
                      {station.hours.length === 0
                        ? "Inga dagar"
                        : station.hours
                            .map(
                              (day) =>
                                `${WEEKDAYS[day.weekday - 1]} ${formatMinuteOfDay(
                                  day.startMinute
                                )}–${formatMinuteOfDay(day.endMinute)}`
                            )
                            .join(", ")}
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
                      <div className="flex justify-end gap-2">
                        <OrderButtons
                          stationId={station.id}
                          first={index === 0}
                          last={index === stations.length - 1}
                        />

                        <StationDialog
                          trigger="Ändra"
                          triggerTone="ghost"
                          title="Ändra station"
                          submitLabel="Spara"
                          action={saveStationAction}
                          stationId={station.id}
                          name={station.name}
                          momentId={station.momentId}
                          moments={moments}
                          days={toDayValues(station.hours)}
                          lockedMoment={station.upcomingBlocks > 0}
                        />

                        <ActionDialog
                          trigger={station.active ? "Stäng" : "Öppna"}
                          title={
                            station.active ? "Stäng station" : "Öppna station"
                          }
                          description={
                            station.active
                              ? "Stationen försvinner från tavlan. Planerad tid som ligger kvar måste flyttas först."
                              : "Stationen visas på tavlan igen."
                          }
                          action={toggleStationAction}
                          initial={{}}
                          submitLabel={station.active ? "Stäng" : "Öppna"}
                        >
                          <input
                            type="hidden"
                            name="stationId"
                            value={station.id}
                          />
                          <input
                            type="hidden"
                            name="active"
                            value={String(station.active)}
                          />
                          {station.active && station.upcomingBlocks > 0 && (
                            <p className="text-[13px] text-neutral-600">
                              {station.upcomingBlocks} planerade jobb ligger
                              kvar.
                            </p>
                          )}
                        </ActionDialog>

                        {/* ATT TA BORT ÄR INTE ATT STÄNGA. Stänga är "inte
                            just nu"; ta bort är "den här skulle aldrig ha
                            funnits". Därför två knappar och inte ett läge. */}
                        <ActionDialog
                          trigger="Ta bort"
                          triggerTone="danger"
                          title={`Ta bort ${station.name}`}
                          action={deleteStationAction}
                          initial={{}}
                          submitLabel="Ta bort"
                          submitTone="danger"
                        >
                          <input
                            type="hidden"
                            name="stationId"
                            value={station.id}
                          />

                          <p className="text-[13px] leading-relaxed text-neutral-600">
                            {station.upcomingBlocks > 0
                              ? `Stationen och ${station.upcomingBlocks} planerade jobb tas bort. Jobbens tid går tillbaka till Oplacerat och kan placeras om.`
                              : "Stationen tas bort. Vill du bara pausa den, stäng den i stället."}
                          </p>
                        </ActionDialog>
                      </div>
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

/**
 * Pilarna som flyttar en station i listan.
 *
 * Ordningen på tavlan följer flödet genom lokalen, inte bokstäverna. Den som
 * planerar läser raderna i den ordning arbetet går, och en alfabetisk lista
 * tvingar ögat att hoppa.
 */
function OrderButtons({
  stationId,
  first,
  last,
}: {
  stationId: string;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="flex items-center">
      {!first && (
        <ActionDialog
          trigger="Upp"
          triggerTone="ghost"
          title="Flytta upp"
          action={moveStationAction}
          initial={{}}
          submitLabel="Flytta"
        >
          <input type="hidden" name="stationId" value={stationId} />
          <input type="hidden" name="direction" value="up" />
          <p className="text-[13px] text-neutral-600">
            Stationen byter plats med den ovanför.
          </p>
        </ActionDialog>
      )}
      {!last && (
        <ActionDialog
          trigger="Ner"
          triggerTone="ghost"
          title="Flytta ner"
          action={moveStationAction}
          initial={{}}
          submitLabel="Flytta"
        >
          <input type="hidden" name="stationId" value={stationId} />
          <input type="hidden" name="direction" value="down" />
          <p className="text-[13px] text-neutral-600">
            Stationen byter plats med den under.
          </p>
        </ActionDialog>
      )}
    </div>
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
