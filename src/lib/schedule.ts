import type { CompanyDb } from "./tenant";
import {
  netMinutes,
  readWeeklyHours,
  type WeekdayHours,
} from "./weekly-hours";
import { addDaysInZone } from "./time-zone";
import { loadWorkSchedules } from "./work-hours";

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

/* --- Formulärdelen ligger i weekly-hours.ts -------------------------------
 *
 * Sju dagar med tider och raster matas in på tre ställen numera: företagets
 * schema, en anställds egna tider och en STATIONS öppettider. Den tredje hör
 * till planeringen, som säljs skilt från löneunderlaget — och varje fil som
 * importerar DEN HÄR filen räknas som en lönesida av
 * tests/module-coverage.test.ts.
 *
 * Läsningen flyttade därför till en neutral fil. Namnen exporteras om här, så
 * att varje befintlig import fortsätter fungera och lönekoden kan läsa sitt
 * schema där den alltid gjort det. */

export {
  parseMinuteOfDay,
  formatMinuteOfDay,
  dayName,
  isoWeekdayIn,
} from "./weekly-hours";

/** En dag på väg in i databasen. Samma form som `WeekdayHours`. */
export type ScheduleDayInput = WeekdayHours;

/**
 * Hela veckan ur ett formulär. Se `readWeeklyHours` i weekly-hours.ts.
 *
 * Noll dagar betyder "inget eget schema": för företaget att ingen dag är
 * arbetsdag, för en anställd att standardschemat gäller.
 */
export const readScheduleDays = readWeeklyHours;

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

  return netMinutes(day);
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
  // Tabellerna läses på ett ställe, i work-hours.ts, som planeringen också
  // läser. Bara regeln om den timanställda är lönens egen.
  const { schedules, defaultId, employees } = await loadWorkSchedules(
    db,
    employeeIds
  );

  const fallbackSchedule = defaultId ? schedules.get(defaultId) ?? null : null;

  const result = new Map<string, Schedule | null>();

  for (const [id, employee] of employees) {
    // TIMANSTÄLLD MÄTS INTE MOT NÅGOT SCHEMA, inte ens företagets. Hen har
    // inte lovat några timmar, och föll förut tillbaka på standardschemat —
    // alltså 40 timmar planerat i veckan och ett flexsaldo som sjönk med
    // varje timme hen inte arbetat. Se Employee.hourly.
    if (employee.hourly) {
      result.set(id, null);
      continue;
    }

    const own = employee.scheduleId
      ? schedules.get(employee.scheduleId)
      : undefined;
    result.set(id, own ?? fallbackSchedule);
  }

  return result;
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

/* --- Egna arbetstider och företagets schema ligger i work-hours.ts --------
 *
 * Arbetstiderna är ARBETSYTANS sedan 2026-10-17 och inte löneunderlagets:
 * planeringen gråmarkerar och varnar efter samma tider som flexen mäts mot.
 * Läsningen och skrivningen flyttade därför till en neutral fil, som båda
 * tillvalen läser. Namnen exporteras om här, så att lönekoden läser sitt schema
 * där den alltid gjort det. */

export { ownScheduleDays, saveOwnScheduleDays } from "./work-hours";
