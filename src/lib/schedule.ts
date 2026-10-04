import type { CompanyDb } from "./tenant";
import {
  netMinutes,
  readWeeklyHours,
  type WeekdayHours,
} from "./weekly-hours";
import { addDaysInZone } from "./time-zone";

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

/* --- Egna arbetstider per anställd ----------------------------------------
 *
 * De flesta i en verkstad går på samma tider, och därför är företagets
 * standardschema det normala. Men alla gör det inte: en deltid, en som börjar
 * fem för att hinna hem, en lärling som går halva fredagen. Utan egna tider
 * mäts deras flex mot någon annans dag, och då visar saldot fel varje vecka.
 *
 * Personens tider lagras som ETT VANLIGT SCHEMA som bara hen är kopplad till.
 * Formen fanns redan i datamodellen (`Employee.scheduleId`), och beräkningen
 * behövde därför inte ändras alls: `schedulesForEmployees` tar personens eget
 * schema om det finns och standardschemat annars. */

/**
 * Namnet ett personligt schema får.
 *
 * Syns ingenstans i gränssnittet. Namn måste vara unika per företag, och två
 * anställda kan heta samma sak — därför id:t och inte namnet.
 */
function personalScheduleName(employeeId: string): string {
  return `employee:${employeeId}`;
}

/**
 * De egna tiderna för var och en i listan.
 *
 * Saknas personen i kartan går hen på företagets standard. En tom lista
 * förekommer inte: ett schema utan dagar raderas i stället för att sparas.
 */
export async function ownScheduleDays(
  db: CompanyDb,
  employeeIds: string[]
): Promise<Map<string, ScheduleDayInput[]>> {
  const result = new Map<string, ScheduleDayInput[]>();
  if (employeeIds.length === 0) return result;

  const [employees, schedules] = await Promise.all([
    db.employee.findMany({
      where: { id: { in: employeeIds }, NOT: { scheduleId: null } },
      select: { id: true, scheduleId: true },
    }),
    // Bara de personliga. Standardschemat hör till företaget, och skulle det
    // dyka upp här såg det ut som att varje anställd har egna tider.
    db.workSchedule.findMany({
      where: { isDefault: false },
      select: {
        id: true,
        days: {
          orderBy: { weekday: "asc" },
          select: {
            weekday: true,
            startMinute: true,
            endMinute: true,
            breaks: {
              orderBy: { startMinute: "asc" },
              select: { startMinute: true, endMinute: true },
            },
          },
        },
      },
    }),
  ]);

  // Typargumenten skrivs ut. Utan dem tolkas paren i map() som en vanlig
  // array och inte som tupler, och Map-konstruktorn vägrar ta emot dem.
  const byId = new Map<string, ScheduleDayInput[]>(
    schedules.map((schedule) => [schedule.id, schedule.days])
  );

  for (const employee of employees) {
    const days = employee.scheduleId ? byId.get(employee.scheduleId) : undefined;
    if (days) result.set(employee.id, days);
  }

  return result;
}

/**
 * Skriver en anställds egna tider.
 *
 * Tomma dagar betyder att personen ska gå på företagets standard igen, och då
 * raderas det personliga schemat. Raden ÄR tillståndet, samma princip som för
 * tillvalen: ett "eget schema utan dagar" vore ett andra sätt att uttrycka
 * standard, och två sätt hinner alltid börja säga olika saker.
 *
 * Företagets standardschema rörs aldrig härifrån. Skulle en anställd vara
 * kopplad till det lämnas kopplingen som den är.
 */
export async function saveOwnScheduleDays(
  db: CompanyDb,
  companyId: string,
  employeeId: string,
  days: ScheduleDayInput[]
): Promise<void> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: { id: true, scheduleId: true },
  });

  // Hör personen till ett annat företag gav företagsfiltret ingen träff, och
  // då ska ingenting skrivas.
  if (!employee) return;

  const own = employee.scheduleId
    ? await db.workSchedule.findFirst({
        where: { id: employee.scheduleId, isDefault: false },
        select: { id: true },
      })
    : null;

  if (days.length === 0) {
    if (!own) return;

    // Kopplingen nollställs av databasen när schemat försvinner
    // (onDelete: SetNull), men vi gör det uttryckligen ändå: en kod som litar
    // på en regel i schemat går sönder tyst den dag regeln ändras.
    await db.employee.updateMany({
      where: { id: employeeId },
      data: { scheduleId: null },
    });
    await db.workSchedule.deleteMany({ where: { id: own.id, isDefault: false } });
    return;
  }

  const scheduleId =
    own?.id ??
    (
      await db.workSchedule.create({
        data: {
          companyId,
          name: personalScheduleName(employeeId),
          isDefault: false,
        },
      })
    ).id;

  // Dagarna skrivs om från grunden, av samma skäl som företagets schema gör
  // det: en omskrivning kan inte lämna kvar en dag som tagits bort i rutan.
  await db.scheduleDay.deleteMany({ where: { scheduleId } });

  for (const day of days) {
    await db.scheduleDay.create({
      data: {
        companyId,
        scheduleId,
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

  if (!own) {
    await db.employee.updateMany({
      where: { id: employeeId },
      data: { scheduleId },
    });
  }
}
