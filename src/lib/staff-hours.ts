import type { CompanyDb } from "./tenant";
import { blockEnd, type StationHours } from "./plan-calendar";
import { isoWeekdayIn, type WeekdayHours } from "./weekly-hours";
import { startOfDayIn } from "./time-zone";

/**
 * PERSONALENS ARBETSTIDER I PLANERINGEN (tillagt 2026-10-17, fas 3 av
 * issue #21).
 *
 * Enda vägen in till `staff_days` och `staff_breaks`. Två sorters rader:
 *
 *   FÖRETAGETS STANDARD   utan anställd. Gäller alla som inte har egna.
 *   EGNA TIDER            med en anställd. Gäller i stället för standarden,
 *                         hela veckan.
 *
 * Saknas båda finns inga tider alls, och då gäller det som gällde före fas 3:
 * passet räknas i väggklockans minuter och dagen ritas vit. Det är skillnaden
 * mellan "inga tider" (`null`) och "inte den här dagen" (en vecka utan just
 * den veckodagen). Det första är okänt, det andra är ledigt.
 *
 * ── PLANERINGENS EGNA, INTE LÖNEUNDERLAGETS ──────────────────────────────
 *
 * Tiderna läses aldrig ur `work_schedules`, och frånvaro syns inte. Modulerna
 * säljs var för sig, och planeringen och löneunderlaget delar ingen kod.
 * Bevisas av tests/planning-boundary.test.ts. Formuläret de ändå delar bor i
 * weekly-hours.ts, som är neutral.
 *
 * ── EGNA TIDER ÄR EN PERSONUPPGIFT ───────────────────────────────────────
 *
 * Att en namngiven person arbetar 07–12 säger något om hen. Raderna med en
 * anställd raderas vid anonymisering och följer med i registerutdraget.
 * Företagets standard bär ingen person.
 */

/** Alla tider i arbetsytan, som tavlan och passen läser dem. */
export interface StaffHoursSet {
  standard: StationHours[];
  own: Map<string, StationHours[]>;
}

export interface StaffHoursResult {
  error?: string;
}

const DAY_SELECT = {
  employeeId: true,
  weekday: true,
  startMinute: true,
  endMinute: true,
  breaks: {
    orderBy: { startMinute: "asc" },
    select: { startMinute: true, endMinute: true },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Läsning                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Arbetsytans tider. Hela tabellen på en gång: den har högst sju rader per
 * person som har egna tider, och tavlan behöver alla som syns.
 */
export async function loadStaffHours(db: CompanyDb): Promise<StaffHoursSet> {
  const rows = await db.staffDay.findMany({
    orderBy: { weekday: "asc" },
    select: DAY_SELECT,
  });

  const standard: StationHours[] = [];
  const own = new Map<string, StationHours[]>();

  for (const row of rows) {
    const day = {
      weekday: row.weekday,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      breaks: row.breaks,
    };

    if (row.employeeId === null) {
      standard.push(day);
    } else {
      own.set(row.employeeId, [...(own.get(row.employeeId) ?? []), day]);
    }
  }

  return { standard, own };
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

/* -------------------------------------------------------------------------- */
/* Skrivning                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Skriver om en uppsättning dagar från grunden: företagets standard eller en
 * anställds egna. En omskrivning kan inte lämna kvar en dag som tagits bort i
 * rutan, och den håller "en rad per veckodag" utan att databasen behöver kunna
 * det.
 */
async function replaceDays(
  db: CompanyDb,
  companyId: string,
  employeeId: string | null,
  days: WeekdayHours[]
): Promise<StaffHoursResult> {
  const weekdays = days.map((day) => day.weekday);

  if (new Set(weekdays).size !== weekdays.length) {
    return { error: "En veckodag står två gånger." };
  }

  if (weekdays.some((weekday) => weekday < 1 || weekday > 7)) {
    return { error: "Okänd veckodag." };
  }

  await db.$transaction(async (tx) => {
    await tx.staffDay.deleteMany({ where: { employeeId } });

    for (const day of days) {
      await tx.staffDay.create({
        data: {
          companyId,
          employeeId,
          weekday: day.weekday,
          startMinute: day.startMinute,
          endMinute: day.endMinute,
          breaks: {
            create: day.breaks.map((rest) => ({
              companyId,
              startMinute: rest.startMinute,
              endMinute: rest.endMinute,
            })),
          },
        },
      });
    }
  });

  return {};
}

/**
 * Företagets standard. Noll dagar är tillåtet och betyder att ingen standard
 * finns: då gäller väggklockan för alla utan egna tider.
 */
export async function saveStandardStaffHours(
  db: CompanyDb,
  companyId: string,
  days: WeekdayHours[]
): Promise<StaffHoursResult> {
  return replaceDays(db, companyId, null, days);
}

/**
 * En anställds egna tider.
 *
 * PERSONEN SLÅS UPP GENOM FÖRETAGSKLIENTEN FÖRST. Id:t kommer från ett
 * formulär, och filtreringslagret stämplar företaget på raden men kan inte
 * veta vem den utpekade personen tillhör.
 *
 * Minst en dag: egna tider utan dagar finns inte. Den som vill att standarden
 * ska gälla tar bort de egna, se `removeOwnStaffHours`.
 */
export async function saveOwnStaffHours(
  db: CompanyDb,
  companyId: string,
  employeeId: string,
  days: WeekdayHours[]
): Promise<StaffHoursResult> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: { id: true },
  });

  if (!employee) return { error: "Den anställda finns inte." };
  if (days.length === 0) return { error: "Kryssa i minst en dag." };

  return replaceDays(db, companyId, employee.id, days);
}

/** Tar bort en anställds egna tider. Företagets standard gäller igen. */
export async function removeOwnStaffHours(
  db: CompanyDb,
  employeeId: string
): Promise<StaffHoursResult> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: { id: true },
  });

  if (!employee) return { error: "Den anställda finns inte." };

  await db.staffDay.deleteMany({ where: { employeeId: employee.id } });
  return {};
}
