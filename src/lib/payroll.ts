import type { AbsenceType } from "@prisma/client";
import type { CompanyDb } from "./tenant";
import { mainMinutes, type Span } from "./spans";
import { minutesBetween } from "./format";
import {
  daysInPeriod,
  isoWeekdayIn,
  plannedMinutesForDay,
  schedulesForEmployees,
  type Schedule,
} from "./schedule";
import { addDaysInZone, dayNumberIn } from "./time-zone";

/**
 * LÖNEUNDERLAGET — TIDRAPPORTEN PER ANSTÄLLD.
 *
 * Den enda platsen där flex och komptid räknas, av samma skäl som
 * `order-price.ts` äger prisräkningen: en siffra som räknas på två ställen
 * hinner alltid sluta stämma.
 *
 * DEN HÄR FILEN FÅR ALDRIG IMPORTERAS AV FAKTURASIDAN. `order-export.ts`,
 * `pdf.ts`, `order-calc.ts` och `report.ts` ska inte veta att den finns.
 * Bevisas av `tests/payroll-boundary.test.ts`. Skälet är detsamma som håller
 * självkostnaden borta från kundens underlag: två dokument med olika mottagare
 * ska inte kunna blandas ihop, och en gräns som bara finns i huvudet på den
 * som skrev koden håller inte ett år.
 *
 * TIKKR RÄKNAR TID, ALDRIG KRONOR TILL LÖN. Inga lönearter, inga OB-tillägg,
 * ingen övertidsersättning — det styrs av kollektivavtal och hör hemma i
 * lönesystemet. Se CLAUDE.md § 1.
 *
 * ── FLEXFORMELN ──────────────────────────────────────────────────────────
 *
 *   flex(dag) = arbetad tid + frånvarotid − planerad tid − intjänad komp
 *
 * | Fall                             | Arb  | Frånv | Plan | Komp | Flex |
 * |----------------------------------|------|-------|------|------|------|
 * | Normal dag                       |  8,5 |     0 |  8,5 |    0 |    0 |
 * | Sjuk hel dag                     |    0 |   8,5 |  8,5 |    0 |    0 |
 * | Jobbat över, 2 h godkänd komp    | 10,5 |     0 |  8,5 |    2 |    0 |
 * | Tar ut komp hel dag              |    0 |   8,5 |  8,5 |    0 |    0 |
 *
 * Frånvaron TÄCKER den planerade tiden — annars skulle en sjukvecka ge minus
 * fyrtio timmar i flex. Intjänad komp DRAS BORT, annars skulle samma övertid
 * räknas två gånger: en gång som flex och en gång som komp.
 *
 * ── ARBETAD TID ÄR HUVUDSTÄMPLINGEN ──────────────────────────────────────
 *
 * Räknas med `mainMinutes` från `spans.ts`, aldrig som råsumman. En operatör
 * som kör två maskiner 08–12 har åtta maskintimmar att fakturera men har varit
 * på plats i fyra. Fakturaunderlaget vill ha åtta; lönen ska ha fyra.
 *
 * ── RASTER ───────────────────────────────────────────────────────────────
 *
 * Rasterna stämplas, och ett rasttryck stänger alla jobb. Under rasten finns
 * därför ingen öppen stämpling, och rasten faller bort ur arbetad tid av sig
 * själv. Rastposterna läses ändå in, för att kunna visas i rapporten och för
 * att kunna se att rasten höll sin längd.
 */

export interface PayrollEntryRow {
  id: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  minutes: number;
  /** Ordernummer, eller namnet på det improduktiva momentet. */
  label: string;
  momentName: string | null;
  kind: "ORDER" | "INDIRECT";
  ongoing: boolean;
  needsReview: boolean;
}

export interface PayrollBreakRow {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  minutes: number;
  name: string;
  needsReview: boolean;
}

export interface PayrollDay {
  /** Dygnets början i företagets tidszon. */
  date: Date;
  /** ISO-veckodag, 1 = måndag. */
  weekday: number;
  plannedMinutes: number;
  /** Huvudstämplingen. Se `mainMinutes`. */
  workedMinutes: number;
  productiveMinutes: number;
  indirectMinutes: number;
  breakMinutes: number;
  absenceMinutes: number;
  absences: { id: string; type: AbsenceType; minutes: number; note: string | null }[];
  compEarnedMinutes: number;
  compTakenMinutes: number;
  flexMinutes: number;
  entries: PayrollEntryRow[];
  breaks: PayrollBreakRow[];
}

export interface PayrollTotals {
  planned: number;
  worked: number;
  productive: number;
  indirect: number;
  breaks: number;
  absence: number;
  flex: number;
}

export interface Balance {
  opening: number;
  period: number;
  closing: number;
}

export interface PayrollPeriod {
  employee: {
    id: string;
    name: string;
    employeeNumber: string | null;
  };
  from: Date;
  to: Date;
  schedule: Schedule | null;
  days: PayrollDay[];
  totals: PayrollTotals;
  /** "Städ Verstad 33,58" — vad den improduktiva tiden gick till. */
  indirectByMoment: { name: string; minutes: number }[];
  absenceByType: { type: AbsenceType; minutes: number }[];
  flex: Balance;
  comp: Balance & { earned: number; taken: number };
}

/**
 * Bygger tidrapporten för en anställd och en period.
 *
 * Perioden anges som två dygnsbörjor i företagets tidszon. Dygnsgränserna
 * räknas ALLTID på väggen och aldrig i UTC: containern kör UTC, och ett
 * kvällspass skulle annars hamna på fel dag i tidrapporten men på rätt dag i
 * fakturarapporten — precis den sortens skillnad man letar efter i en timme.
 */
export async function buildPayrollPeriod(
  db: CompanyDb,
  timeZone: string,
  employeeId: string,
  from: Date,
  to: Date
): Promise<PayrollPeriod | null> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: {
      id: true,
      name: true,
      employeeNumber: true,
      flexOpeningMinutes: true,
      compOpeningMinutes: true,
      balanceOpeningDate: true,
    },
  });

  if (!employee) return null;

  // Sluttiden är dygnets SLUT, alltså början på dagen efter. En stämpling
  // 15:30 sista dagen ska med.
  const periodEnd = addDaysInZone(to, 1, timeZone);

  const [entries, breakEntries, absences, comp, schedules] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        employeeId,
        clockInAt: { gte: from, lt: periodEnd },
      },
      orderBy: { clockInAt: "asc" },
      select: {
        id: true,
        clockInAt: true,
        clockOutAt: true,
        kind: true,
        needsReview: true,
        order: { select: { orderNumber: true } },
        moment: { select: { name: true } },
        indirectMoment: { select: { name: true } },
      },
    }),
    db.breakEntry.findMany({
      where: { employeeId, startedAt: { gte: from, lt: periodEnd } },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        needsReview: true,
        breakType: { select: { name: true } },
      },
    }),
    db.absence.findMany({
      where: { employeeId, date: { gte: from, lt: periodEnd } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, type: true, minutes: true, note: true },
    }),
    db.compAdjustment.findMany({
      where: { employeeId, date: { gte: from, lt: periodEnd } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, minutes: true },
    }),
    schedulesForEmployees(db, [employeeId]),
  ]);

  const schedule = schedules.get(employeeId) ?? null;

  // Allt sorteras in på kalenderdag. dayNumberIn räknar på väggen, så en post
  // hamnar på den dag den gjordes på verkstadsgolvet.
  const dayKey = (instant: Date) => dayNumberIn(instant, timeZone);

  const entriesByDay = new Map<number, typeof entries>();
  for (const entry of entries) {
    const key = dayKey(entry.clockInAt);
    const list = entriesByDay.get(key) ?? [];
    list.push(entry);
    entriesByDay.set(key, list);
  }

  const breaksByDay = new Map<number, typeof breakEntries>();
  for (const rest of breakEntries) {
    const key = dayKey(rest.startedAt);
    const list = breaksByDay.get(key) ?? [];
    list.push(rest);
    breaksByDay.set(key, list);
  }

  const absencesByDay = new Map<number, typeof absences>();
  for (const absence of absences) {
    const key = dayKey(absence.date);
    const list = absencesByDay.get(key) ?? [];
    list.push(absence);
    absencesByDay.set(key, list);
  }

  const compByDay = new Map<number, typeof comp>();
  for (const row of comp) {
    const key = dayKey(row.date);
    const list = compByDay.get(key) ?? [];
    list.push(row);
    compByDay.set(key, list);
  }

  const days: PayrollDay[] = [];

  for (const date of daysInPeriod(from, to, timeZone)) {
    const key = dayKey(date);
    const weekday = isoWeekdayIn(date, timeZone);

    const dayEntries = entriesByDay.get(key) ?? [];
    const dayBreaks = breaksByDay.get(key) ?? [];
    const dayAbsences = absencesByDay.get(key) ?? [];
    const dayComp = compByDay.get(key) ?? [];

    const plannedMinutes = plannedMinutesForDay(schedule, weekday);

    // Huvudstämplingen. Ett sidojobb är inte en extra timme någon varit på
    // plats — det är samma timme, bokförd på en order till.
    const spans: Span[] = dayEntries
      .filter((entry) => entry.clockOutAt !== null)
      .map((entry) => ({
        from: entry.clockInAt.getTime(),
        to: entry.clockOutAt!.getTime(),
      }));

    const workedMinutes = mainMinutes(spans);

    // Produktiv och improduktiv räknas RAKT AV och inte som huvudstämpling.
    // De svarar på vad tiden gick till, inte på hur länge personen var här, och
    // ska stämma med rapporten och fakturaunderlaget.
    let productiveMinutes = 0;
    let indirectMinutes = 0;

    const rows: PayrollEntryRow[] = dayEntries.map((entry) => {
      const minutes =
        entry.clockOutAt === null
          ? 0
          : minutesBetween(entry.clockInAt, entry.clockOutAt);

      if (entry.kind === "ORDER") productiveMinutes += minutes;
      else indirectMinutes += minutes;

      return {
        id: entry.id,
        clockInAt: entry.clockInAt,
        clockOutAt: entry.clockOutAt,
        minutes,
        label:
          entry.kind === "ORDER"
            ? entry.order?.orderNumber ?? "Order saknas"
            : entry.indirectMoment?.name ?? "Improduktiv tid",
        momentName: entry.moment?.name ?? null,
        kind: entry.kind,
        ongoing: entry.clockOutAt === null,
        needsReview: entry.needsReview,
      };
    });

    const breakRows: PayrollBreakRow[] = dayBreaks.map((rest) => ({
      id: rest.id,
      startedAt: rest.startedAt,
      endedAt: rest.endedAt,
      minutes:
        rest.endedAt === null ? 0 : minutesBetween(rest.startedAt, rest.endedAt),
      name: rest.breakType.name,
      needsReview: rest.needsReview,
    }));

    const breakMinutes = breakRows.reduce((sum, row) => sum + row.minutes, 0);

    // Frånvaro utan angivet antal täcker hela den schemalagda dagen. Är dagen
    // inte schemalagd blir det noll, vilket är rätt: en sjukanmälan på en
    // lördag tar inte bort någon planerad tid.
    const absenceMinutes = dayAbsences.reduce(
      (sum, absence) => sum + (absence.minutes ?? plannedMinutes),
      0
    );

    const compEarnedMinutes = dayComp
      .filter((row) => row.minutes > 0)
      .reduce((sum, row) => sum + row.minutes, 0);

    const compTakenMinutes = dayComp
      .filter((row) => row.minutes < 0)
      .reduce((sum, row) => sum - row.minutes, 0);

    days.push({
      date,
      weekday,
      plannedMinutes,
      workedMinutes,
      productiveMinutes,
      indirectMinutes,
      breakMinutes,
      absenceMinutes,
      absences: dayAbsences.map((absence) => ({
        id: absence.id,
        type: absence.type,
        minutes: absence.minutes ?? plannedMinutes,
        note: absence.note,
      })),
      compEarnedMinutes,
      compTakenMinutes,
      flexMinutes:
        workedMinutes + absenceMinutes - plannedMinutes - compEarnedMinutes,
      entries: rows,
      breaks: breakRows,
    });
  }

  const totals: PayrollTotals = {
    planned: sum(days, (d) => d.plannedMinutes),
    worked: sum(days, (d) => d.workedMinutes),
    productive: sum(days, (d) => d.productiveMinutes),
    indirect: sum(days, (d) => d.indirectMinutes),
    breaks: sum(days, (d) => d.breakMinutes),
    absence: sum(days, (d) => d.absenceMinutes),
    flex: sum(days, (d) => d.flexMinutes),
  };

  const indirectByMoment = groupSum(
    days.flatMap((day) => day.entries.filter((e) => e.kind === "INDIRECT")),
    (row) => row.label,
    (row) => row.minutes
  );

  const absenceByType = groupSum(
    days.flatMap((day) => day.absences),
    (row) => row.type,
    (row) => row.minutes
  ).map((row) => ({ type: row.name as AbsenceType, minutes: row.minutes }));

  const [flexOpening, compOpening] = await openingBalances(
    db,
    employee,
    from,
    timeZone
  );

  const earned = sum(days, (d) => d.compEarnedMinutes);
  const taken = sum(days, (d) => d.compTakenMinutes);

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      employeeNumber: employee.employeeNumber,
    },
    from,
    to,
    schedule,
    days,
    totals,
    indirectByMoment,
    absenceByType,
    flex: {
      opening: flexOpening,
      period: totals.flex,
      closing: flexOpening + totals.flex,
    },
    comp: {
      opening: compOpening,
      earned,
      taken,
      period: earned - taken,
      closing: compOpening + earned - taken,
    },
  };
}

/**
 * Saldona vid periodens början.
 *
 * Ingående saldo på personen gäller från `balanceOpeningDate`. Allt som hänt
 * mellan den dagen och periodens början räknas på nytt här — flexsaldot lagras
 * alltså aldrig, utan härleds. Skälet är detsamma som gör att orderns
 * beräknade tid inte cachas: ett lagrat saldo och en uppsättning poster är två
 * ställen som säger samma sak, och de hinner alltid sluta göra det.
 *
 * Kostnaden är en extra fråga per uppslag. Den är liten: en anställd har
 * några hundra dagar per år, inte miljoner.
 */
async function openingBalances(
  db: CompanyDb,
  employee: {
    id: string;
    flexOpeningMinutes: number;
    compOpeningMinutes: number;
    balanceOpeningDate: Date | null;
  },
  periodStart: Date,
  timeZone: string
): Promise<[number, number]> {
  const since = employee.balanceOpeningDate;

  // Ingen historik att räkna: antingen saknas startdag, eller så börjar
  // perioden på eller före den.
  if (!since || since >= periodStart) {
    return [employee.flexOpeningMinutes, employee.compOpeningMinutes];
  }

  const beforeStart = { gte: since, lt: periodStart };

  const [entries, absences, comp, schedules] = await Promise.all([
    db.timeEntry.findMany({
      where: { employeeId: employee.id, clockInAt: beforeStart },
      select: { clockInAt: true, clockOutAt: true },
    }),
    db.absence.findMany({
      where: { employeeId: employee.id, date: beforeStart },
      select: { date: true, minutes: true },
    }),
    db.compAdjustment.findMany({
      where: { employeeId: employee.id, date: beforeStart },
      select: { minutes: true, date: true },
    }),
    schedulesForEmployees(db, [employee.id]),
  ]);

  const schedule = schedules.get(employee.id) ?? null;

  const spansByDay = new Map<number, Span[]>();
  for (const entry of entries) {
    if (!entry.clockOutAt) continue;
    const key = dayNumberIn(entry.clockInAt, timeZone);
    const list = spansByDay.get(key) ?? [];
    list.push({
      from: entry.clockInAt.getTime(),
      to: entry.clockOutAt.getTime(),
    });
    spansByDay.set(key, list);
  }

  const absenceByDay = new Map<number, number>();
  for (const absence of absences) {
    const key = dayNumberIn(absence.date, timeZone);
    const planned = plannedMinutesForDay(
      schedule,
      isoWeekdayIn(absence.date, timeZone)
    );
    absenceByDay.set(
      key,
      (absenceByDay.get(key) ?? 0) + (absence.minutes ?? planned)
    );
  }

  const compEarnedByDay = new Map<number, number>();
  let compPeriod = 0;
  for (const row of comp) {
    compPeriod += row.minutes;
    if (row.minutes > 0) {
      const key = dayNumberIn(row.date, timeZone);
      compEarnedByDay.set(key, (compEarnedByDay.get(key) ?? 0) + row.minutes);
    }
  }

  let flex = employee.flexOpeningMinutes;

  // Varje dag mellan startdagen och periodens början, inklusive dagar helt
  // utan stämplingar — en oanmäld frånvarodag ska ge minus, inte noll.
  for (const date of daysInPeriod(
    since,
    addDaysInZone(periodStart, -1, timeZone),
    timeZone
  )) {
    const key = dayNumberIn(date, timeZone);
    const planned = plannedMinutesForDay(
      schedule,
      isoWeekdayIn(date, timeZone)
    );

    flex +=
      mainMinutes(spansByDay.get(key) ?? []) +
      (absenceByDay.get(key) ?? 0) -
      planned -
      (compEarnedByDay.get(key) ?? 0);
  }

  return [flex, employee.compOpeningMinutes + compPeriod];
}

/**
 * Flexsaldot just nu, för en anställd.
 *
 * Används av stämplingsskärmen, som visar saldot när någon stämplar ut för
 * dagen. Räknar fram till och med gårdagen plus dagens poster — alltså samma
 * väg som tidrapporten, så att skärmen och kontoret aldrig visar olika tal.
 */
export async function currentFlexMinutes(
  db: CompanyDb,
  timeZone: string,
  employeeId: string,
  now: Date = new Date()
): Promise<number | null> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: { balanceOpeningDate: true },
  });

  if (!employee) return null;

  const period = await buildPayrollPeriod(
    db,
    timeZone,
    employeeId,
    employee.balanceOpeningDate ?? addDaysInZone(now, -365, timeZone),
    now
  );

  return period ? period.flex.closing : null;
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function groupSum<T>(
  rows: T[],
  key: (row: T) => string,
  value: (row: T) => number
): { name: string; minutes: number }[] {
  const byKey = new Map<string, number>();

  for (const row of rows) {
    const k = key(row);
    byKey.set(k, (byKey.get(k) ?? 0) + value(row));
  }

  return [...byKey]
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}
