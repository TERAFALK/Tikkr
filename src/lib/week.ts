import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";

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
 * Veckan börjar på måndag. Det är den svenska konventionen och den verkstäder
 * planerar efter.
 */

export interface DayCell {
  /** Datumet, midnatt lokal tid. */
  date: Date;
  minutes: number;
  /** true när någon post den dagen stängts av systemet och inte granskats. */
  needsReview: boolean;
}

export interface WeekRow {
  employeeId: string;
  employeeName: string;
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

/** Måndagen i veckan ett datum tillhör. */
export function startOfWeek(date: Date): Date {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);

  // getDay() ger 0 för söndag. Söndagen hör till veckan som börjat, alltså sex
  // dagar bakåt — inte till den som börjar dagen efter.
  const weekday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - weekday);

  return monday;
}

/** Veckonumret enligt ISO 8601, som är det svenska sättet att räkna. */
export function isoWeekNumber(date: Date): number {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  // Torsdagen i samma vecka avgör vilket år och vilken vecka det är. Det är
  // hela knepet i ISO-räkningen: en vecka tillhör det år där dess torsdag
  // ligger, vilket är varför nyårsveckan kan heta 53 eller 1.
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(
    firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7)
  );

  const weeks = Math.round(
    (target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  return weeks + 1;
}

export async function buildWeek(
  db: CompanyDb,
  monday: Date
): Promise<WeekResult> {
  const from = startOfWeek(monday);

  const to = new Date(from);
  to.setDate(to.getDate() + 7);

  const [employees, entries] = await Promise.all([
    db.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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

  const byEmployee = new Map<string, DayCell[]>();

  const emptyWeek = () =>
    Array.from({ length: 7 }, (_, index) => {
      const date = new Date(from);
      date.setDate(date.getDate() + index);
      return { date, minutes: 0, needsReview: false };
    });

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
    const index = Math.floor(
      (startOfDay(entry.clockInAt).getTime() - from.getTime()) /
        (24 * 60 * 60 * 1000)
    );

    if (index < 0 || index > 6) continue;

    week[index].minutes += minutesBetween(entry.clockInAt, entry.clockOutAt);
    if (entry.needsReview) week[index].needsReview = true;
  }

  const names = new Map(employees.map((employee) => [employee.id, employee.name]));

  const rows: WeekRow[] = [...byEmployee.entries()]
    .map(([employeeId, days]) => ({
      employeeId,
      employeeName: names.get(employeeId) ?? "Tidigare anställd",
      days,
      totalMinutes: days.reduce((total, day) => total + day.minutes, 0),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "sv"));

  const dayTotals = Array.from({ length: 7 }, (_, index) =>
    rows.reduce((total, row) => total + row.days[index].minutes, 0)
  );

  const lastMoment = new Date(to);
  lastMoment.setMilliseconds(-1);

  return {
    from,
    to: lastMoment,
    rows,
    dayTotals,
    totalMinutes: dayTotals.reduce((total, minutes) => total + minutes, 0),
  };
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
