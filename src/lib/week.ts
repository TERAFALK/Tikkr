import type { CompanyDb } from "./tenant";
import { mainMinutes, type Span } from "./spans";
import {
  addDaysInZone,
  dayNumberIn,
  startOfWeekIn,
  wallTimeIn,
} from "./time-zone";

/**
 * VECKOVY PER ANSTÄLLD.
 *
 * En rad per person, en kolumn per dag. Rapporterna svarar på hur mycket tid en
 * order kostat; den här vyn svarar på om veckan ser rimlig ut — och en
 * orimlighet syns som ett mönster långt innan den syns som en siffra i en
 * lista.
 *
 * Typiska fynd: en dag med noll där någon var på plats, en dag med fjorton
 * timmar där en utstämpling glömts, eller en person vars hela vecka ligger på
 * en enda order.
 *
 * BARA HUVUDSTÄMPLINGEN RÄKNAS — se `spans.ts`, som äger den regeln och
 * förklaringen till varför rapporterna räknar annorlunda. Översikten använder
 * samma modul, så att båda vyerna svarar likadant på samma dag.
 *
 * Improduktiv tid räknas med. Städning är tid på jobbet även om den aldrig
 * faktureras.
 *
 * Veckan börjar på måndag. Det är den svenska konventionen och den verkstäder
 * planerar efter.
 *
 * ALLA DYGNSGRÄNSER RÄKNAS I FÖRETAGETS TIDSZON, aldrig i serverns. Containern
 * kör UTC, och ett dygn som börjar 00:00 UTC börjar 02:00 på verkstadsgolvet
 * på sommaren. Ett kvällspass hade då hamnat på fel dag här men på rätt dag i
 * rapporten, vilket är den sortens skillnad man letar efter i en timme.
 */

export interface DayCell {
  /** Datumet, vid dygnets början i företagets tidszon. */
  date: Date;
  /**
   * Huvudstämplingarnas tid den dagen. Sidojobb räknas inte — se
   * toppkommentaren.
   */
  minutes: number;
  /** true när någon post den dagen stängts av systemet och inte granskats. */
  needsReview: boolean;
}

export interface WeekRow {
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  days: DayCell[];
  totalMinutes: number;
}

export interface WeekResult {
  /** Måndagen veckan börjar på. */
  from: Date;
  /** Söndagen veckan slutar på, vid dygnets slut. */
  to: Date;
  rows: WeekRow[];
  /** Summa per dag, i samma ordning som raderna. */
  dayTotals: number[];
  totalMinutes: number;
}

/**
 * Veckonumret enligt ISO 8601, som är det svenska sättet att räkna.
 *
 * Räkningen sker på kalenderdatumet i företagets tidszon, uttryckt som ett
 * UTC-datum. Tidpunkten är då ur vägen och kvar är ren almanacksmatematik.
 */
export function isoWeekNumber(date: Date, timeZone: string): number {
  const wall = wallTimeIn(date, timeZone);
  const target = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));

  // Torsdagen i samma vecka avgör vilket år och vilken vecka det är. Det är
  // hela knepet i ISO-räkningen: en vecka tillhör det år där dess torsdag
  // ligger, vilket är varför nyårsveckan kan heta 53 eller 1.
  target.setUTCDate(target.getUTCDate() + 3 - ((target.getUTCDay() + 6) % 7));

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(
    firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7)
  );

  const weeks = Math.round(
    (target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  return weeks + 1;
}

export async function buildWeek(
  db: CompanyDb,
  monday: Date,
  timeZone: string
): Promise<WeekResult> {
  const from = startOfWeekIn(monday, timeZone);

  // Nästa måndags början, inte "sju dygn senare". Veckan med sommartidens
  // slut är 169 timmar lång, och den timmen hör till veckan.
  const to = addDaysInZone(from, 7, timeZone);

  // Vilket kalenderdygn veckan börjar på. Posterna sorteras mot det här talet
  // i stället för mot en millisekundskillnad, som glider vid omställningarna.
  const firstDayNumber = dayNumberIn(from, timeZone);

  const [employees, entries] = await Promise.all([
    db.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeNumber: true },
    }),
    db.timeEntry.findMany({
      where: { clockInAt: { gte: from, lt: to } },
      select: {
        employeeId: true,
        clockInAt: true,
        clockOutAt: true,
        needsReview: true,
      },
    }),
  ]);

  // Passen samlas först, och räknas ihop sist. Att summera direkt hade
  // dubbelräknat den som kör två maskiner — överlappet syns bara när man har
  // hela dagen framför sig.
  const byEmployee = new Map<
    string,
    { date: Date; spans: Span[]; needsReview: boolean }[]
  >();

  const emptyWeek = () =>
    Array.from({ length: 7 }, (_, index) => ({
      date: addDaysInZone(from, index, timeZone),
      spans: [] as Span[],
      needsReview: false,
    }));

  // Pågående pass räknas fram till nu. En enda tidpunkt för hela veckan, så
  // att två jobb som fortfarande pågår inte får olika sluttid.
  const now = Date.now();

  for (const employee of employees) {
    byEmployee.set(employee.id, emptyWeek());
  }

  for (const entry of entries) {
    // En anställd som avaktiverats mitt i veckan har fortfarande tid kvar.
    // Den ska räknas, annars stämmer inte veckans summa.
    if (!byEmployee.has(entry.employeeId)) {
      byEmployee.set(entry.employeeId, emptyWeek());
    }

    const week = byEmployee.get(entry.employeeId)!;

    // Posten räknas på den dag den PÅBÖRJADES. Ett nattskift som passerar
    // midnatt hamnar därmed på kvällen det började, vilket är den dag den som
    // läser tänker på.
    const index = dayNumberIn(entry.clockInAt, timeZone) - firstDayNumber;

    if (index < 0 || index > 6) continue;

    week[index].spans.push({
      from: entry.clockInAt.getTime(),
      to: entry.clockOutAt?.getTime() ?? now,
    });

    if (entry.needsReview) week[index].needsReview = true;
  }

  const known = new Map(employees.map((employee) => [employee.id, employee]));

  const rows: WeekRow[] = [...byEmployee.entries()]
    .map(([employeeId, buckets]) => {
      const days = buckets.map(toDayCell);

      return {
        employeeId,
        employeeName: known.get(employeeId)?.name ?? "Tidigare anställd",
        employeeNumber: known.get(employeeId)?.employeeNumber ?? null,
        days,
        totalMinutes: days.reduce((total, day) => total + day.minutes, 0),
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "sv"));

  const dayTotals = Array.from({ length: 7 }, (_, index) =>
    rows.reduce((total, row) => total + row.days[index].minutes, 0)
  );

  // Sista millisekunden av söndagen. Visas som veckans slutdatum, och ska
  // alltså vara söndag och inte måndag.
  const lastMoment = new Date(to.getTime() - 1);

  return {
    from,
    to: lastMoment,
    rows,
    dayTotals,
    totalMinutes: dayTotals.reduce((total, minutes) => total + minutes, 0),
  };
}

/** Räknar ihop en dags pass till en cell. */
function toDayCell(bucket: {
  date: Date;
  spans: Span[];
  needsReview: boolean;
}): DayCell {
  return {
    date: bucket.date,
    minutes: mainMinutes(bucket.spans),
    needsReview: bucket.needsReview,
  };
}
