import type { CompanyDb } from "./tenant";
import { normalizeTimeOfDay } from "./time-input";
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

/**
 * "06:30" → 390. Ger null på något som inte är ett klockslag.
 *
 * Tar även emot "0630" och "630". Fältet i adminpanelen sätter kolonet medan
 * man skriver, men ett formulär kan skickas innan det skriptet hunnit köra,
 * och då ska siffrorna ändå betyda det de ser ut att betyda.
 */
export function parseMinuteOfDay(value: string): number | null {
  const normalized = normalizeTimeOfDay(value);
  if (normalized === null) return null;

  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

/** 390 → "06:30". */
export function formatMinuteOfDay(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/* --- Schemat som formulär -------------------------------------------------
 *
 * Två ställen skickar in ett veckoschema: inställningarnas schemasida, som
 * sätter företagets standard, och rutan under Anställda, som ger en person
 * egna tider. Fälten heter likadant och tolkas därför av samma kod. Två
 * läsare av samma formulär hade glidit isär vid första ändringen, och den
 * sortens glidning syns först som ett felaktigt flexsaldo. */

/** En dag på väg in i databasen. */
export interface ScheduleDayInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
  breaks: { startMinute: number; endMinute: number }[];
}

/** Rasterna på en dag, som de kommer från formuläret. */
function readBreaks(
  formData: FormData,
  weekday: number
): { startMinute: number; endMinute: number }[] {
  const starts = formData.getAll(`break-start-${weekday}`);
  const ends = formData.getAll(`break-end-${weekday}`);

  const breaks: { startMinute: number; endMinute: number }[] = [];

  for (const [index, rawStart] of starts.entries()) {
    const start = parseMinuteOfDay(String(rawStart ?? ""));
    const end = parseMinuteOfDay(String(ends[index] ?? ""));

    // Halvfyllda rader hoppas över. Den som tryckt på plus och ångrat sig har
    // lämnat en tom rad, inte begått ett fel.
    if (start === null || end === null) continue;
    if (end <= start) continue;

    breaks.push({ startMinute: start, endMinute: end });
  }

  return breaks;
}

/**
 * Hela veckan ur ett formulär.
 *
 * Ger antingen ett fel att visa eller färdiga dagar, aldrig både och. Noll
 * dagar är ett giltigt svar och betyder "inget eget schema": för företaget att
 * ingen dag är arbetsdag, för en anställd att standardschemat gäller.
 */
export function readScheduleDays(
  formData: FormData
): { error: string } | { days: ScheduleDayInput[] } {
  const days: ScheduleDayInput[] = [];

  for (let weekday = 1; weekday <= 7; weekday++) {
    // Dagen är arbetsfri när rutan inte är i. Raden skrivs då inte alls, och
    // planerad tid blir noll.
    if (formData.get(`active-${weekday}`) !== "on") continue;

    const start = parseMinuteOfDay(String(formData.get(`start-${weekday}`) ?? ""));
    const end = parseMinuteOfDay(String(formData.get(`end-${weekday}`) ?? ""));

    if (start === null || end === null) {
      return { error: "Skriv tiderna som klockslag, till exempel 06:30." };
    }

    if (end <= start) {
      return { error: "Sluttiden måste ligga efter starttiden." };
    }

    const breaks = readBreaks(formData, weekday);

    const breakMinutes = breaks.reduce(
      (total, rest) => total + (rest.endMinute - rest.startMinute),
      0
    );

    if (breakMinutes >= end - start) {
      return {
        error: `Rasterna är längre än arbetsdagen på ${dayName(weekday)}.`,
      };
    }

    days.push({ weekday, startMinute: start, endMinute: end, breaks });
  }

  return { days };
}

export function dayName(weekday: number): string {
  return [
    "måndag",
    "tisdag",
    "onsdag",
    "torsdag",
    "fredag",
    "lördag",
    "söndag",
  ][weekday - 1];
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

  const byId = new Map(schedules.map((schedule) => [schedule.id, schedule.days]));

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
