import type { CompanyDb } from "./tenant";
import { blockEnd, type StationHours } from "./plan-calendar";
import { isoWeekdayIn } from "./weekly-hours";
import { startOfDayIn } from "./time-zone";
import { loadWorkSchedules } from "./work-hours";

/**
 * PERSONALENS TILLGÄNGLIGHET I PLANERINGEN (tillagt 2026-10-17, fas 3 av
 * issue #21).
 *
 * Vems tider som gäller, och om ett pass ligger utanför dem eller i ett annat.
 * Tiderna själva är ARBETSYTANS, samma som löneunderlaget mäter flexen mot,
 * och läses i work-hours.ts. Planeringen skriver aldrig några tider.
 *
 * Två sorters tider:
 *
 *   FÖRETAGETS SCHEMA   under Inställningar, Arbetsytan, Arbetstider.
 *   EGNA TIDER          under Anställda. Gäller i stället för schemat.
 *
 * Saknas båda finns inga tider, och då räknas passet i väggklockans minuter
 * och dagen ritas vit. Det är skillnaden mellan "inga tider" (`null`) och
 * "inte den här dagen" (en vecka utan just den veckodagen). Det första är
 * okänt, det andra är ledigt.
 *
 * EN TIMANSTÄLLD FÅR FÖRETAGETS TIDER HÄR (produktägarens val 2026-10-17).
 * I löneunderlaget har hen inget schema alls, eftersom hen inte lovat några
 * timmar och då inte ska mätas mot några. På tavlan behöver planeraren ändå
 * se när verkstaden är öppen, och en helt vit dag vore att säga att hen kan
 * planeras när som helst.
 *
 * Frånvaro syns inte. Den hör till löneunderlaget och är känslig, och
 * planeringen delar ingen kod med det. Bevisas av
 * tests/planning-boundary.test.ts.
 */

/** Alla tider i arbetsytan, som tavlan och passen läser dem. */
export interface StaffHoursSet {
  standard: StationHours[];
  own: Map<string, StationHours[]>;
}

/* -------------------------------------------------------------------------- */
/* Läsning                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Arbetsytans tider för planeringen: företagets schema och de egna.
 *
 * Alla anställda på en gång, eftersom tavlan behöver alla som syns och
 * schemana är få.
 */
export async function loadStaffHours(db: CompanyDb): Promise<StaffHoursSet> {
  const { schedules, defaultId, employees } = await loadWorkSchedules(db);

  const toHours = (scheduleId: string | null): StationHours[] =>
    (scheduleId ? schedules.get(scheduleId)?.days ?? [] : []).map((day) => ({
      weekday: day.weekday,
      startMinute: day.startMinute,
      endMinute: day.endMinute,
      breaks: day.breaks.map(({ startMinute, endMinute }) => ({
        startMinute,
        endMinute,
      })),
    }));

  const own = new Map<string, StationHours[]>();

  for (const [id, employee] of employees) {
    // Ett eget schema är ett annat än företagets. Pekar någon på
    // standardschemat är det ingen egen tid.
    if (employee.scheduleId && employee.scheduleId !== defaultId) {
      own.set(id, toHours(employee.scheduleId));
    }
  }

  return { standard: toHours(defaultId), own };
}

/**
 * Tiderna som gäller för en anställd: egna om hen har några, annars
 * företagets standard, och null när ingen av dem finns.
 */
export function hoursForEmployee(
  set: StaffHoursSet,
  employeeId: string
): StationHours[] | null {
  const own = set.own.get(employeeId);
  if (own && own.length > 0) return own;
  return set.standard.length > 0 ? set.standard : null;
}

/**
 * Tiderna en viss dag, för den som räknar ett pass.
 *
 * `undefined` när personen inte har några tider alls: då räknas passet i
 * väggklockans minuter, som före fas 3. `null` när personen har tider men inte
 * den här dagen: då är hela passet utanför arbetstid, men minuterna är
 * fortfarande arbete, samma regel som överbokning av en station.
 */
export function hoursOnDay(
  hours: StationHours[] | null,
  instant: Date,
  timeZone: string
): StationHours | null | undefined {
  if (!hours) return undefined;

  const weekday = isoWeekdayIn(instant, timeZone);
  return hours.find((day) => day.weekday === weekday) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Tillgänglighet                                                              */
/* -------------------------------------------------------------------------- */

const MS_PER_MINUTE = 60_000;

/** Minuter från dygnets början på väggen. */
function wallMinute(instant: Date, timeZone: string): number {
  return (instant.getTime() - startOfDayIn(instant, timeZone).getTime()) /
    MS_PER_MINUTE;
}

/**
 * Om ett pass ligger, helt eller delvis, utanför personens arbetstid.
 *
 * Bara en varning, aldrig ett hinder, samma hållning som överbokning av en
 * station: den som planerar vet ibland att någon ska jobba över.
 *
 * Utan några tider alls finns ingenting att vara utanför, och svaret är nej.
 * Rasterna räknas inte som utanför: passet hoppar över dem.
 */
export function outsideHours(
  hours: StationHours[] | null,
  startsAt: Date,
  minutes: number,
  timeZone: string
): boolean {
  const day = hoursOnDay(hours, startsAt, timeZone);

  if (day === undefined) return false;
  if (day === null) return true;

  const end = blockEnd(day, startsAt, minutes, timeZone);
  const from = wallMinute(startsAt, timeZone);

  // Slutar passet precis vid midnatt räknas det som dagens sista minut, inte
  // som nästa dags första.
  const to =
    end.getTime() === startOfDayIn(end, timeZone).getTime() &&
    end.getTime() > startsAt.getTime()
      ? 24 * 60
      : wallMinute(end, timeZone);

  return from < day.startMinute || to > day.endMinute;
}

/** Ett pass som det behövs för att se krockar. */
export interface PassSpan {
  id: string;
  employeeId: string;
  startsAt: Date;
  minutes: number;
}

/**
 * Passen som ligger i ett annat pass för samma person.
 *
 * Bara en varning: en operatör kör ibland två maskiner, och då är två pass
 * samtidigt helt riktigt (CLAUDE.md § 3 regel 2). Ett pass som slutar när
 * nästa börjar krockar inte.
 */
export function overlappingPasses(
  passes: PassSpan[],
  hoursOf: (employeeId: string) => StationHours[] | null,
  timeZone: string
): Set<string> {
  const byEmployee = new Map<string, { id: string; from: number; to: number }[]>();

  for (const pass of passes) {
    const day = hoursOnDay(hoursOf(pass.employeeId), pass.startsAt, timeZone);
    const end = blockEnd(day ?? null, pass.startsAt, pass.minutes, timeZone);

    const list = byEmployee.get(pass.employeeId) ?? [];
    list.push({ id: pass.id, from: pass.startsAt.getTime(), to: end.getTime() });
    byEmployee.set(pass.employeeId, list);
  }

  const result = new Set<string>();

  for (const list of byEmployee.values()) {
    list.sort((a, b) => a.from - b.from);

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].from < list[i].to; j++) {
        result.add(list[i].id);
        result.add(list[j].id);
      }
    }
  }

  return result;
}
