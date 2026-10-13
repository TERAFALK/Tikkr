import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { createDefaultAbsenceReasons, markAbsence } from "@/lib/absence";
import { buildPayrollPeriod, currentFlexMinutes } from "@/lib/payroll";
import { parseMinuteOfDay } from "@/lib/schedule";

/**
 * FLEXEN — FLEXLEDIGHET OCH STARTDATUM (2026-10-13).
 *
 * Två ändringar på kundens begäran inför lanseringen:
 *
 *   - Komptiden är borta. Övertid är flex, och ledighet på inarbetad tid är
 *     frånvaro på en orsak som drar på flexen ("Flexledig"). Den står som
 *     frånvaro i löneunderlaget men täcker inte den planerade tiden.
 *   - Flexen räknas från personens startdatum, som sätts under Anställda.
 *     Före det har en dag varken planerad tid eller flex. Utan startdatum
 *     gäller första stämplingen, som förut.
 *
 * Tidrapporten och stämplingsskärmen ska ge samma saldo, och flera av testen
 * prövar därför både buildPayrollPeriod och currentFlexMinutes.
 */

const TZ = "Europe/Stockholm";

let companyId: string;
let scheduleId: string;
let ordern: string;
let svetsning: string;
let sjuk: string;
let flexledig: string;

/** Dygnets början, en dag i september 2026, i Stockholm (sommartid, UTC+2). */
const day = (date: number) => new Date(Date.UTC(2026, 8, date, -2, 0));

/** "07:00" en dag i september 2026, i Stockholm. */
const at = (date: number, time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(2026, 8, date, hour - 2, minute));
};

const t = (value: string) => parseMinuteOfDay(value)!;

// Måndag 21 till fredag 25 september 2026.
const MONDAY = 21;
const TUESDAY = 22;
const WEDNESDAY = 23;
const FRIDAY = 25;

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  companyId = (
    await unsafeGlobalPrisma.company.create({
      data: { name: `Flextest ${unique}`, timezone: TZ },
    })
  ).id;

  // Måndag till fredag 07:00-15:00 utan raster: åtta timmar planerat.
  scheduleId = (
    await unsafeGlobalPrisma.workSchedule.create({
      data: {
        companyId,
        name: "Normal",
        isDefault: true,
        days: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({
            companyId,
            weekday,
            startMinute: t("07:00"),
            endMinute: t("15:00"),
          })),
        },
      },
    })
  ).id;

  ordern = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2601" },
    })
  ).id;

  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning" },
    })
  ).id;

  await createDefaultAbsenceReasons(forCompany(companyId), companyId);

  const reasons = await unsafeGlobalPrisma.absenceReason.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  const byName = (name: string) =>
    reasons.find((reason) => reason.name === name)!.id;

  sjuk = byName("Sjuk");
  flexledig = byName("Flexledig");
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Flextest " } },
  });
});

async function employee(data: {
  name: string;
  balanceOpeningDate?: Date | null;
  flexOpeningMinutes?: number;
  hourly?: boolean;
}): Promise<string> {
  const created = await unsafeGlobalPrisma.employee.create({
    data: {
      companyId,
      scheduleId: data.hourly ? null : scheduleId,
      ...data,
    },
  });
  return created.id;
}

async function stamp(employeeId: string, date: number, from: string, to: string) {
  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId,
      employeeId,
      kind: "ORDER",
      orderId: ordern,
      momentId: svetsning,
      clockInAt: at(date, from),
      clockOutAt: at(date, to),
    },
  });
}

async function period(employeeId: string, from: number, to: number) {
  const result = await buildPayrollPeriod(
    forCompany(companyId),
    TZ,
    employeeId,
    day(from),
    day(to)
  );
  return result!;
}

describe("flexledighet", () => {
  it("står som frånvaro och drar hela den schemalagda dagen från flexen", async () => {
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(MONDAY) });

    await markAbsence(forCompany(companyId), companyId, {
      employeeId: anna,
      date: day(MONDAY),
      reasonId: flexledig,
      byEmail: "chef@flextest.se",
    });

    const monday = await period(anna, MONDAY, MONDAY);

    expect(monday.totals.absence).toBe(480);
    expect(monday.totals.flex).toBe(-480);
    expect(monday.flex.closing).toBe(-480);
    expect(monday.days[0].absences).toEqual([
      expect.objectContaining({ reason: "Flexledig", minutes: 480, drawsOnFlex: true }),
    ]);
  });

  it("en halv flexledig dag drar bara sina timmar", async () => {
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(MONDAY) });

    // Fyra timmars arbete och fyra timmar flexledigt: dagen är full, men de
    // fyra lediga timmarna är tagna ur saldot.
    await stamp(anna, MONDAY, "07:00", "11:00");
    await markAbsence(forCompany(companyId), companyId, {
      employeeId: anna,
      date: day(MONDAY),
      reasonId: flexledig,
      minutes: 240,
      byEmail: "chef@flextest.se",
    });

    expect((await period(anna, MONDAY, MONDAY)).totals.flex).toBe(-240);
  });

  it("en sjukdag täcker dagen och rör inte flexen", async () => {
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(MONDAY) });

    await markAbsence(forCompany(companyId), companyId, {
      employeeId: anna,
      date: day(MONDAY),
      reasonId: sjuk,
      byEmail: "chef@flextest.se",
    });

    const monday = await period(anna, MONDAY, MONDAY);

    expect(monday.totals.absence).toBe(480);
    expect(monday.totals.flex).toBe(0);
    expect(monday.days[0].absences[0].drawsOnFlex).toBe(false);
  });

  it("dras också i saldot före perioden, och skärmen visar samma tal", async () => {
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(MONDAY) });

    await markAbsence(forCompany(companyId), companyId, {
      employeeId: anna,
      date: day(MONDAY),
      reasonId: flexledig,
      byEmail: "chef@flextest.se",
    });
    await stamp(anna, TUESDAY, "07:00", "15:00");

    // Tisdagen ensam: måndagens uttag ligger i det ingående saldot.
    const tuesday = await period(anna, TUESDAY, TUESDAY);
    expect(tuesday.flex.opening).toBe(-480);
    expect(tuesday.flex.closing).toBe(-480);

    expect(
      await currentFlexMinutes(
        forCompany(companyId),
        TZ,
        anna,
        at(TUESDAY, "23:00")
      )
    ).toBe(-480);
  });

  it("gamla rader i komptidsboken påverkar inte flexen", async () => {
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(MONDAY) });

    // Tio timmar mot åtta, och en godkänd komprad från tiden före
    // 2026-10-13. Raden drog förut bort övertiden ur flexen.
    await stamp(anna, MONDAY, "07:00", "17:00");
    await unsafeGlobalPrisma.compAdjustment.create({
      data: {
        companyId,
        employeeId: anna,
        date: day(MONDAY),
        minutes: 120,
        createdByEmail: "chef@flextest.se",
      },
    });

    expect((await period(anna, MONDAY, MONDAY)).totals.flex).toBe(120);
  });

  it("en timanställd som är flexledig får ändå ingen flex", async () => {
    const tim = await employee({
      name: "Tim",
      hourly: true,
      balanceOpeningDate: day(MONDAY),
    });

    await markAbsence(forCompany(companyId), companyId, {
      employeeId: tim,
      date: day(MONDAY),
      reasonId: flexledig,
      minutes: 240,
      byEmail: "chef@flextest.se",
    });

    const monday = await period(tim, MONDAY, MONDAY);
    expect(monday.totals.flex).toBe(0);
    expect(monday.flex.closing).toBe(0);
  });
});

describe("startdatum", () => {
  it("dagar före startdatumet har varken planerad tid eller flex", async () => {
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(WEDNESDAY) });

    for (const date of [WEDNESDAY, 24, FRIDAY]) {
      await stamp(anna, date, "07:00", "15:00");
    }

    const week = await period(anna, MONDAY, FRIDAY);

    expect(week.days.map((d) => d.beforeStart)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(week.days[0].plannedMinutes).toBe(0);
    expect(week.days[0].flexMinutes).toBe(0);
    expect(week.totals.planned).toBe(3 * 480);
    expect(week.totals.flex).toBe(0);
    expect(week.flex.closing).toBe(0);
  });

  it("ett startdatum före första stämplingen ger minus för dagarna utan stämpling", async () => {
    // Började måndag, glömde stämpla till onsdagen. Utan startdatum hade
    // saldot räknats från onsdagen och stått på noll.
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(MONDAY) });
    await stamp(anna, WEDNESDAY, "07:00", "15:00");

    expect(
      await currentFlexMinutes(
        forCompany(companyId),
        TZ,
        anna,
        at(WEDNESDAY, "23:00")
      )
    ).toBe(-960);

    expect((await period(anna, MONDAY, WEDNESDAY)).flex.closing).toBe(-960);
  });

  it("stämplingar före startdatumet syns men räknas inte i flexen", async () => {
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(WEDNESDAY) });

    // Tio timmar måndag, före startdatumet. Hade de räknats vore saldot +2:00.
    await stamp(anna, MONDAY, "07:00", "17:00");
    await stamp(anna, WEDNESDAY, "07:00", "15:00");

    const week = await period(anna, MONDAY, WEDNESDAY);

    expect(week.days[0].workedMinutes).toBe(600);
    expect(week.days[0].flexMinutes).toBe(0);
    expect(week.flex.closing).toBe(0);

    expect(
      await currentFlexMinutes(
        forCompany(companyId),
        TZ,
        anna,
        at(WEDNESDAY, "23:00")
      )
    ).toBe(0);
  });

  it("frånvaro före startdatumet står kvar med sina timmar", async () => {
    // Löneunderlaget behöver timmarna även om flexen inte räknas där.
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(WEDNESDAY) });

    await markAbsence(forCompany(companyId), companyId, {
      employeeId: anna,
      date: day(MONDAY),
      reasonId: sjuk,
      byEmail: "chef@flextest.se",
    });

    const monday = await period(anna, MONDAY, MONDAY);

    expect(monday.days[0].absenceMinutes).toBe(480);
    expect(monday.totals.absence).toBe(480);
    expect(monday.totals.flex).toBe(0);
  });

  it("ett startdatum som inte kommit än ger bara det ingående saldot", async () => {
    const anna = await employee({
      name: "Anna",
      balanceOpeningDate: day(30),
      flexOpeningMinutes: 300,
    });

    expect(
      await currentFlexMinutes(
        forCompany(companyId),
        TZ,
        anna,
        at(WEDNESDAY, "12:00")
      )
    ).toBe(300);
  });

  it("utan startdatum och stämplingar räknas ingen dag, på skärmen eller i tidrapporten", async () => {
    const ny = await employee({ name: "Nyanställd" });

    const week = await period(ny, MONDAY, FRIDAY);
    expect(week.totals.planned).toBe(0);
    expect(week.totals.flex).toBe(0);
    expect(week.flex.closing).toBe(0);

    expect(
      await currentFlexMinutes(forCompany(companyId), TZ, ny, at(FRIDAY, "23:00"))
    ).toBe(0);
  });

  it("ett startdatum mitt på dagen räknar ändå hela dagen", async () => {
    // Datumet ur formuläret landar klockan 12, se parseLocalDate.
    const anna = await employee({
      name: "Anna",
      balanceOpeningDate: at(WEDNESDAY, "12:00"),
    });
    await stamp(anna, WEDNESDAY, "07:00", "15:00");

    const wednesday = await period(anna, WEDNESDAY, WEDNESDAY);

    expect(wednesday.days[0].beforeStart).toBe(false);
    expect(wednesday.totals.flex).toBe(0);
    expect(
      await currentFlexMinutes(
        forCompany(companyId),
        TZ,
        anna,
        at(WEDNESDAY, "23:00")
      )
    ).toBe(0);
  });
});

describe("en annan kunds orsak", () => {
  it("går inte att registrera frånvaro på", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: `Flextest grannen ${Math.random()}`, timezone: TZ },
    });
    const theirs = await unsafeGlobalPrisma.absenceReason.create({
      data: { companyId: other.id, name: "Flexledig", countsAsComp: true },
    });
    const anna = await employee({ name: "Anna", balanceOpeningDate: day(MONDAY) });

    await expect(
      markAbsence(forCompany(companyId), companyId, {
        employeeId: anna,
        date: day(MONDAY),
        reasonId: theirs.id,
        byEmail: "chef@flextest.se",
      })
    ).rejects.toThrow();

    expect(
      await unsafeGlobalPrisma.absence.count({ where: { employeeId: anna } })
    ).toBe(0);
  });
});
