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
import { addDaysInZone, dayNumberIn, startOfDayIn } from "./time-zone";

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
  absences: {
    id: string;
    /** Orsakens namn, som kunden själv skrivit det. */
    reason: string;
    minutes: number;
    note: string | null;
  }[];
  compEarnedMinutes: number;
  compTakenMinutes: number;
  /**
   * Dagens rader i komptidsboken, med tecken: plus är intjänat, minus uttaget.
   *
   * `absenceId` är satt på ett uttag som skrivits av en frånvaro märkt
   * `countsAsComp`. Den raden tas bort med frånvaron och inte för sig, se
   * removeCompAdjustment.
   */
  comp: {
    id: string;
    minutes: number;
    note: string | null;
    absenceId: string | null;
  }[];
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
    /** Timanställd: ingen planerad tid, inget flexsaldo, ingen komptid. */
    hourly: boolean;
  };
  from: Date;
  to: Date;
  schedule: Schedule | null;
  days: PayrollDay[];
  totals: PayrollTotals;
  /** "Städ Verstad 33,58" — vad den improduktiva tiden gick till. */
  indirectByMoment: { name: string; minutes: number }[];
  /** Summerad frånvaro per orsak, mest först. */
  absenceByReason: { reason: string; minutes: number }[];
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
      hourly: true,
    },
  });

  if (!employee) return null;

  // ── PERIODEN KAPAS TILL HELA DYGN ──────────────────────────────────────
  //
  // `from` och `to` pekar ut DAGAR, men kommer hit som tidpunkter, och vilken
  // tidpunkt på dagen beror på var de kommer ifrån. Förvalet räknas ur
  // `startOfWeekIn` och landar vid midnatt; ett datum ur adressfältet går
  // genom `parseLocalDate`, som med flit landar klockan 12 — se kommentaren
  // där, den undviker natten då klockan ställs om.
  //
  // Skickades de råa in i frågan föll halva första dagen bort: samma vecka
  // för samma person visade 6:51 när man kom in på sidan och 3:23 när man
  // växlat vecka fram och tillbaka, eftersom förmiddagens stämplingar låg
  // före gränsen andra gången. Sista dagen läckte åt andra hållet.
  //
  // Normaliseringen ligger HÄR och inte hos anroparna. Sidan, PDF:en och
  // flexsaldot kallar alla hit, och en regel som varje anropare måste komma
  // ihåg är ingen regel.
  const periodStart = startOfDayIn(from, timeZone);

  // Sluttiden är dygnets SLUT, alltså början på dagen efter. En stämpling
  // 15:30 sista dagen ska med.
  const periodEnd = startOfDayIn(addDaysInZone(to, 1, timeZone), timeZone);

  const [entries, breakEntries, absences, comp, schedules] = await Promise.all([
    db.timeEntry.findMany({
      where: {
        employeeId,
        clockInAt: { gte: periodStart, lt: periodEnd },
      },
      // Id:t som andra sortering. Postgres lovar ingenting om ordningen
      // mellan rader som är lika, och två poster som stämplats in på samma
      // minut bytte därför plats mellan två sidvisningar.
      orderBy: [{ clockInAt: "asc" }, { id: "asc" }],
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
      where: { employeeId, startedAt: { gte: periodStart, lt: periodEnd } },
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
      where: { employeeId, date: { gte: periodStart, lt: periodEnd } },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        minutes: true,
        note: true,
        reason: { select: { name: true } },
      },
    }),
    db.compAdjustment.findMany({
      where: { employeeId, date: { gte: periodStart, lt: periodEnd } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, date: true, minutes: true, note: true, absenceId: true },
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

  for (const date of daysInPeriod(periodStart, to, timeZone)) {
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
        reason: absence.reason.name,
        minutes: absence.minutes ?? plannedMinutes,
        note: absence.note,
      })),
      compEarnedMinutes,
      compTakenMinutes,
      comp: dayComp.map((row) => ({
        id: row.id,
        minutes: row.minutes,
        note: row.note,
        absenceId: row.absenceId,
      })),
      // TIMANSTÄLLD HAR INGEN FLEX. Utan schema är planerad tid noll, och
      // formeln hade då gjort varje arbetad timme till ett plus — ett saldo
      // som växer för den som inte har något att ta igen. Se Employee.hourly.
      flexMinutes: employee.hourly
        ? 0
        : workedMinutes + absenceMinutes - plannedMinutes - compEarnedMinutes,
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

  const absenceByReason = groupSum(
    days.flatMap((day) => day.absences),
    (row) => row.reason,
    (row) => row.minutes
  ).map((row) => ({ reason: row.name, minutes: row.minutes }));

  const [flexOpening, compOpening] = await openingBalances(
    db,
    employee,
    periodStart,
    timeZone
  );

  const earned = sum(days, (d) => d.compEarnedMinutes);
  const taken = sum(days, (d) => d.compTakenMinutes);

  // En timanställd har varken flex eller komp, och saldona ska då stå på noll
  // rakt igenom. Ett ingående saldo från tiden som fast anställd räknas inte
  // med — det hör till ett annat anställningsförhållande, och visades det här
  // skulle det se ut som ett saldo hen kan ta ut.
  const zeroBalances = employee.hourly;

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      employeeNumber: employee.employeeNumber,
      hourly: employee.hourly,
    },
    from,
    to,
    schedule,
    days,
    totals,
    indirectByMoment,
    absenceByReason,
    flex: {
      opening: zeroBalances ? 0 : flexOpening,
      period: totals.flex,
      closing: zeroBalances ? 0 : flexOpening + totals.flex,
    },
    comp: {
      opening: zeroBalances ? 0 : compOpening,
      earned: zeroBalances ? 0 : earned,
      taken: zeroBalances ? 0 : taken,
      period: zeroBalances ? 0 : earned - taken,
      closing: zeroBalances ? 0 : compOpening + earned - taken,
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
/**
 * DAGEN SALDOT RÄKNAS FRÅN.
 *
 * `balanceOpeningDate` när kunden flyttat in med befintliga timmar. Är den tom
 * räknas personen från sin FÖRSTA STÄMPLING, vilket är vad fältet säger i
 * schemat att tomt betyder.
 *
 * Funktionen finns för att de två vägarna in i saldot ska svara likadant.
 * Tidrapporten utelämnade all historik före perioden, och saldot blev då
 * periodens egen flex. Stämplingsskärmen räknade i stället ett år bakåt, och
 * en nyanställd fick minus för varje schemalagd dag innan hen fanns — över två
 * tusen timmar. Båda talen kallades saldo, och rutan som justerar det visade
 * det ena medan den ändrade det andra.
 *
 * Null betyder att personen aldrig stämplat. Då finns ingen historik att
 * härleda ur, och det ingående saldot står ensamt.
 */
async function balanceStart(
  db: CompanyDb,
  employee: { id: string; balanceOpeningDate: Date | null },
  timeZone: string
): Promise<Date | null> {
  if (employee.balanceOpeningDate) return employee.balanceOpeningDate;

  const first = await db.timeEntry.findFirst({
    where: { employeeId: employee.id },
    orderBy: [{ clockInAt: "asc" }, { id: "asc" }],
    select: { clockInAt: true },
  });

  // Dygnets början, så att en första stämpling 15:30 räknar hela den dagen
  // och inte halva.
  return first ? startOfDayIn(first.clockInAt, timeZone) : null;
}

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
  const since = await balanceStart(db, employee, timeZone);

  // Ingen historik att räkna: antingen har personen aldrig stämplat, eller så
  // börjar perioden på eller före startdagen.
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
 * dagen, och av rutan som justerar saldot för hand. Räknar från startdagen
 * fram till och med idag, alltså samma väg som tidrapporten — skärmen,
 * kontoret och justeringsrutan ska aldrig visa olika tal.
 *
 * Fönstret var ett år bakåt när startdag saknades. Det räknade dagar innan
 * personen var anställd som schemalagda dagar utan stämpling, alltså minus,
 * och en ny person mötte tvåtusen minustimmar på skärmen i verkstaden. Nu
 * avgör `balanceStart` var räkningen börjar.
 */
export async function currentFlexMinutes(
  db: CompanyDb,
  timeZone: string,
  employeeId: string,
  now: Date = new Date()
): Promise<number | null> {
  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: {
      id: true,
      balanceOpeningDate: true,
      flexOpeningMinutes: true,
      hourly: true,
    },
  });

  if (!employee) return null;

  // Timanställd har inget flexsaldo att visa, varken på skärmen i verkstaden
  // eller i rutan som justerar det. Null betyder "går inte att räkna fram",
  // vilket är precis vad det är. Se Employee.hourly.
  if (employee.hourly) return null;

  const since = await balanceStart(db, employee, timeZone);

  // Aldrig stämplat. Då finns ingen dag att räkna, och saldot är det
  // ingående — noll för alla utom den som flyttat in med timmar.
  if (!since) return employee.flexOpeningMinutes;

  const period = await buildPayrollPeriod(db, timeZone, employeeId, since, now);

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
