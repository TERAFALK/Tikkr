import type { CompanyDb } from "./tenant";
import type { WeekdayHours } from "./weekly-hours";

/**
 * ARBETSTIDERNA — ARBETSYTANS, INTE ETT TILLVALS (beslutat 2026-10-17).
 *
 * Företagets schema och de anställdas egna tider, i `work_schedules`,
 * `schedule_days` och `schedule_breaks`. Enda stället som läser och skriver
 * dem. Löneunderlaget mäter flexen mot tiderna och planeringen gråmarkerar och
 * varnar efter dem, och båda läser härifrån.
 *
 * Tiderna låg tidigare i löneunderlaget, och planeringen fick en egen
 * uppsättning (fas 3 av issue #21) eftersom modulerna säljs var för sig. Det
 * blev två ställen att mata in samma människors tider på, och två ställen
 * hinner alltid sluta säga samma sak. Nu är de arbetsytans: sidan Arbetstider
 * ligger under Inställningar, Arbetsytan, och de egna tiderna under
 * Anställda, och båda syns med vilket av tillvalen som helst.
 *
 * FILEN ÄR NEUTRAL, som weekly-hours.ts: den importerar ingenting från
 * löneunderlaget eller planeringen, och båda läser den. Bevisas av
 * tests/planning-boundary.test.ts. Reglerna som skiljer, till exempel att en
 * timanställd inte har något schema i löneunderlaget men företagets tider i
 * planeringen, ligger hos den som läser.
 */

/** En schemalagd dag, med rasterna och vilken rasttyp de gäller. */
export interface WorkScheduleDay {
  weekday: number;
  startMinute: number;
  endMinute: number;
  breaks: { startMinute: number; endMinute: number; breakTypeId: string | null }[];
}

export interface WorkSchedule {
  id: string;
  name: string;
  days: WorkScheduleDay[];
}

/** Allt som behövs för att avgöra vems tider som gäller. */
export interface WorkSchedules {
  schedules: Map<string, WorkSchedule>;
  /** Företagets standardschema, eller null när inget finns. */
  defaultId: string | null;
  /** Per anställd: det egna schemat och om personen är timanställd. */
  employees: Map<string, { scheduleId: string | null; hourly: boolean }>;
}

/**
 * Arbetsytans scheman och de anställdas koppling till dem.
 *
 * Utan `employeeIds` hämtas alla anställda, vilket tavlan behöver. Scheman är
 * få och små: ett standardschema och ett per person som har egna tider.
 */
export async function loadWorkSchedules(
  db: CompanyDb,
  employeeIds?: string[]
): Promise<WorkSchedules> {
  const [employees, schedules] = await Promise.all([
    db.employee.findMany({
      where: employeeIds ? { id: { in: employeeIds } } : undefined,
      select: { id: true, scheduleId: true, hourly: true },
    }),
    db.workSchedule.findMany({
      select: {
        id: true,
        name: true,
        isDefault: true,
        days: {
          orderBy: { weekday: "asc" },
          select: {
            weekday: true,
            startMinute: true,
            endMinute: true,
            breaks: {
              orderBy: { startMinute: "asc" },
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

  return {
    schedules: new Map(
      schedules.map((schedule) => [
        schedule.id,
        { id: schedule.id, name: schedule.name, days: schedule.days },
      ])
    ),
    defaultId: schedules.find((schedule) => schedule.isDefault)?.id ?? null,
    employees: new Map(
      employees.map((employee) => [
        employee.id,
        { scheduleId: employee.scheduleId, hourly: employee.hourly },
      ])
    ),
  };
}

/* --- Företagets schema ---------------------------------------------------- */

/**
 * Skriver företagets standardschema.
 *
 * Hela veckan i ett svep, och dagarna skrivs om från grunden: ett schema är
 * litet, och en omskrivning kan inte lämna kvar en dag som tagits bort i
 * gränssnittet. Finns inget standardschema skapas det.
 */
export async function saveDefaultSchedule(
  db: CompanyDb,
  companyId: string,
  days: WeekdayHours[]
): Promise<void> {
  const existing = await db.workSchedule.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });

  await db.$transaction(async (tx) => {
    const scheduleId =
      existing?.id ??
      (
        await tx.workSchedule.create({
          data: { companyId, name: "Normalarbetstid", isDefault: true },
        })
      ).id;

    await tx.scheduleDay.deleteMany({ where: { scheduleId } });

    for (const day of days) {
      await tx.scheduleDay.create({
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
  });
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
): Promise<Map<string, WeekdayHours[]>> {
  const result = new Map<string, WeekdayHours[]>();
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
  const byId = new Map<string, WeekdayHours[]>(
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
  days: WeekdayHours[]
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
