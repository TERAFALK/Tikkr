import type { CompanyDb } from "./tenant";
import { addDaysInZone, wallTimeIn } from "./time-zone";

/**
 * ARBETSTIDSSCHEMAT — PLANERAD TID.
 *
 * Schemat svarar på hur lång en dag är TÄNKT att vara. Det är den siffran
 * flexsaldot mäts mot, och därmed den som avgör om en vecka blev plus eller
 * minus.
 *
 * Planerad tid är NETTO: schemats spann minus schemats raster. Kundens
 * normalvecka är mån–tors 06:30–16:00 med 20 minuters frukost och 40 minuters
 * lunch, alltså 9,5 − 1,0 = 8,5 timmar, och fredag 06:30–13:00 med frukost och
 * tio minuters fika, alltså 6,0. Veckan blir 40,0.
 *
 * Rasterna i schemat och de stämplade rasterna svarar på olika frågor.
 * Schemats säger hur lång dagen är planerad; de stämplade säger vad personen
 * faktiskt tog. Tar någon en timmes lunch när fyrtio minuter är schemalagt
 * kostar de tjugo minuterna flex — vilket är hela poängen med att mäta.
 *
 * TIDER LAGRAS SOM MINUTER FRÅN MIDNATT. Ett schema ska gå att räkna på, och
 * "06:30" är inte ett tal.
 *
 * VECKODAGAR ÄR ISO: 1 = måndag … 7 = söndag. Samma räkning som veckovyn.
 */

/** En schemalagd rast, i minuter från midnatt. */
export interface ScheduleBreakSpan {
  startMinute: number;
  endMinute: number;
  breakTypeId: string | null;
}

/** En schemalagd dag. */
export interface ScheduleDaySpan {
  weekday: number;
  startMinute: number;
  endMinute: number;
  breaks: ScheduleBreakSpan[];
}

/** Ett helt schema, som beräkningen använder det. */
export interface Schedule {
  id: string;
  name: string;
  days: ScheduleDaySpan[];
}

/**
 * Veckodagen ett datum har, som ISO-nummer i företagets tidszon.
 *
 * Går via kalenderdatumet och inte via `getDay()` på instansen, eftersom
 * servern kör UTC: ett kvällspass i Stockholm hör till dagen på väggen, inte
 * till den UTC råkar visa.
 */
export function isoWeekdayIn(instant: Date, timeZone: string): number {
  const wall = wallTimeIn(instant, timeZone);
  const day = new Date(
    Date.UTC(wall.year, wall.month - 1, wall.day)
  ).getUTCDay();

  // getUTCDay() ger 0 för söndag. ISO vill ha 7.
  return day === 0 ? 7 : day;
}

/**
 * Planerad tid för en veckodag, i minuter netto.
 *
 * Saknas dagen i schemat är den arbetsfri och ger noll — vilket är rätt svar
 * för en lördag och gör att helgarbete blir ren flex.
 *
 * En rast som sträcker sig utanför arbetspasset räknas bara till den del som
 * ligger innanför. Annars skulle en lunch som schemalagts 12:00–13:00 på en
 * dag som slutar 12:30 dra av trettio minuter för mycket.
 */
export function plannedMinutesForDay(
  schedule: Schedule | null,
  weekday: number
): number {
  const day = schedule?.days.find((d) => d.weekday === weekday);
  if (!day) return 0;

  const span = Math.max(0, day.endMinute - day.startMinute);

  const breakMinutes = day.breaks.reduce((total, rest) => {
    const from = Math.max(rest.startMinute, day.startMinute);
    const to = Math.min(rest.endMinute, day.endMinute);
    return total + Math.max(0, to - from);
  }, 0);

  return Math.max(0, span - breakMinutes);
}

/** Planerad tid för en hel vecka, i minuter. Mest för att kontrollera schemat. */
export function plannedMinutesPerWeek(schedule: Schedule | null): number {
  let total = 0;
  for (let weekday = 1; weekday <= 7; weekday++) {
    total += plannedMinutesForDay(schedule, weekday);
  }
  return total;
}

/**
 * Schemat som gäller för varje anställd i en lista.
 *
 * Personen går på sitt eget schema om hen har ett, annars på företagets
 * standardschema. Saknas båda finns ingen planerad tid, och flexsaldot blir
 * då summan av all arbetad tid — vilket syns direkt som en orimlig siffra och
 * är bättre än att tyst gissa åtta timmar om dagen.
 */
export async function schedulesForEmployees(
  db: CompanyDb,
  employeeIds: string[]
): Promise<Map<string, Schedule | null>> {
  const [employees, schedules] = await Promise.all([
    db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, scheduleId: true },
    }),
    db.workSchedule.findMany({
      select: {
        id: true,
        name: true,
        isDefault: true,
        days: {
          select: {
            weekday: true,
            startMinute: true,
            endMinute: true,
            breaks: {
              select: {
                startMinute: true,
                endMinute: true,
                breakTypeId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const byId = new Map<string, Schedule>(
    schedules.map((s) => [s.id, { id: s.id, name: s.name, days: s.days }])
  );

  const fallback = schedules.find((s) => s.isDefault);
  const fallbackSchedule = fallback ? byId.get(fallback.id) ?? null : null;

  const result = new Map<string, Schedule | null>();

  for (const employee of employees) {
    const own = employee.scheduleId ? byId.get(employee.scheduleId) : undefined;
    result.set(employee.id, own ?? fallbackSchedule);
  }

  return result;
}

/** Företagets standardschema, eller null när inget lagts upp. */
export async function defaultSchedule(db: CompanyDb): Promise<Schedule | null> {
  const found = await db.workSchedule.findFirst({
    where: { isDefault: true },
    select: {
      id: true,
      name: true,
      days: {
        orderBy: { weekday: "asc" },
        select: {
          weekday: true,
          startMinute: true,
          endMinute: true,
          breaks: {
            orderBy: { startMinute: "asc" },
            select: { startMinute: true, endMinute: true, breakTypeId: true },
          },
        },
      },
    },
  });

  return found ? { id: found.id, name: found.name, days: found.days } : null;
}

/** Varje dag i en period, som dygnets början i företagets tidszon. */
export function daysInPeriod(
  from: Date,
  to: Date,
  timeZone: string
): Date[] {
  const days: Date[] = [];
  let cursor = addDaysInZone(from, 0, timeZone);
  const last = addDaysInZone(to, 0, timeZone).getTime();

  // Taket finns för att en felskriven period inte ska bygga en oändlig lista.
  // Fem år räcker för varje rimlig tidrapport.
  for (let guard = 0; cursor.getTime() <= last && guard < 1900; guard++) {
    days.push(cursor);
    cursor = addDaysInZone(cursor, 1, timeZone);
  }

  return days;
}

/* --- Klockslag som text ---------------------------------------------------
 *
 * Schemat visas och matas in som "06:30" men lagras som 390. Omvandlingen
 * ligger här, så att gränssnittet och beräkningen aldrig kan tolka samma
 * sträng olika. */

/** "06:30" → 390. Ger null på något som inte är ett klockslag. */
export function parseMinuteOfDay(value: string): number | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

/** 390 → "06:30". */
export function formatMinuteOfDay(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
