import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { buildPayrollPeriod, currentFlexMinutes } from "@/lib/payroll";
import { markAbsence, addCompEarned } from "@/lib/absence";
import { parseMinuteOfDay } from "@/lib/schedule";

/**
 * TIDRAPPORTEN.
 *
 * Huvudtestet är KUNDENS EGEN VECKA 16, avskriven ur tidrapporten de lämnade
 * från sitt förra system. Går den igenom räknar Tikkr som kunden är van vid,
 * och det är enda sättet att veta det utan att fråga dem varje gång.
 *
 * Facit ur rapporten:
 *   Planerad tid    34,00
 *   Närvarotid      33,75
 *   Flextid         −0,25
 *   Produktiv tid    0,17
 *   Improduktiv tid 33,58   (allt på "Städ Verstad")
 */

const TZ = "Europe/Stockholm";

let companyId: string;
let johan: string;
let scheduleId: string;
let stadning: string;
let order: string;
let svetsning: string;

/** "2019-04-15 06:23" i företagets tidszon. */
function at(day: number, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  // April = sommartid i Sverige, alltså UTC+2.
  return new Date(Date.UTC(2019, 3, day, hour - 2, minute));
}

/** Dygnets början, som frånvaro och komprader dateras på. */
function dayStart(day: number): Date {
  return new Date(Date.UTC(2019, 3, day, -2, 0));
}

const t = (value: string) => parseMinuteOfDay(value)!;

beforeAll(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: "Lönetest AB", timezone: TZ },
  });
  companyId = company.id;

  // Kundens schema, ordagrant ur deras mejl.
  const schedule = await unsafeGlobalPrisma.workSchedule.create({
    data: {
      companyId,
      name: "Normal",
      isDefault: true,
      days: {
        create: [
          ...[1, 2, 3, 4].map((weekday) => ({
            companyId,
            weekday,
            startMinute: t("06:30"),
            endMinute: t("16:00"),
            breaks: {
              create: [
                { companyId, startMinute: t("09:00"), endMinute: t("09:20") },
                { companyId, startMinute: t("12:00"), endMinute: t("12:40") },
              ],
            },
          })),
          {
            companyId,
            weekday: 5,
            startMinute: t("06:30"),
            endMinute: t("13:00"),
            breaks: {
              create: [
                { companyId, startMinute: t("09:00"), endMinute: t("09:20") },
                { companyId, startMinute: t("11:00"), endMinute: t("11:10") },
              ],
            },
          },
        ],
      },
    },
  });
  scheduleId = schedule.id;

  johan = (
    await unsafeGlobalPrisma.employee.create({
      data: {
        companyId,
        name: "Johan Andersson",
        employeeNumber: "114",
        scheduleId,
      },
    })
  ).id;

  stadning = (
    await unsafeGlobalPrisma.indirectMoment.create({
      data: { companyId, name: "Städ Verstad" },
    })
  ).id;

  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning" },
    })
  ).id;

  order = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "15252" },
    })
  ).id;

  const indirect = (day: number, from: string, to: string) =>
    unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: johan,
        kind: "INDIRECT",
        indirectMomentId: stadning,
        clockInAt: at(day, from),
        clockOutAt: at(day, to),
      },
    });

  const productive = (day: number, from: string, to: string) =>
    unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: johan,
        kind: "ORDER",
        orderId: order,
        momentId: svetsning,
        clockInAt: at(day, from),
        clockOutAt: at(day, to),
      },
    });

  // Veckan som den står i kundens rapport. Rasterna är STÄMPLADE här, till
  // skillnad från i det gamla systemet där de drogs av ur den spännande
  // posten — därför är tiderna delade vid rasten.
  //
  // Måndag: 8,66
  await indirect(15, "06:23", "09:00");
  await indirect(15, "09:20", "12:00");
  await indirect(15, "12:44", "16:07");
  // Tisdag: 8,43
  await indirect(16, "06:33", "09:00");
  await indirect(16, "09:20", "12:01");
  await indirect(16, "12:48", "16:06");
  // Onsdag: 8,55
  await indirect(17, "06:34", "09:00");
  await indirect(17, "09:20", "12:00");
  await indirect(17, "12:42", "16:09");
  // Torsdag: 8,11 — här ligger de två produktiva raderna på order 15252
  await indirect(18, "06:31", "08:04");
  await productive(18, "08:04", "08:11");
  await productive(18, "08:11", "08:14");
  await indirect(18, "08:14", "09:00");
  await indirect(18, "09:20", "12:05");
  await indirect(18, "12:42", "15:34");
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });
  await unsafeGlobalPrisma.$disconnect();
});

/** Minuter som decimaltimmar med två decimaler, som i kundens rapport. */
const hours = (minutes: number) => Number((minutes / 60).toFixed(2));

describe("kundens vecka 16 — facit ur deras gamla tidrapport", () => {
  it("planerad tid är 34,00 för fyra dagar", async () => {
    const period = await buildPayrollPeriod(
      forCompany(companyId),
      TZ,
      johan,
      dayStart(15),
      dayStart(18)
    );

    expect(hours(period!.totals.planned)).toBe(34.0);
  });

  it("närvarotiden är 33,75", async () => {
    const period = await buildPayrollPeriod(
      forCompany(companyId),
      TZ,
      johan,
      dayStart(15),
      dayStart(18)
    );

    expect(hours(period!.totals.worked)).toBe(33.75);
  });

  it("flextiden är −0,25", async () => {
    const period = await buildPayrollPeriod(
      forCompany(companyId),
      TZ,
      johan,
      dayStart(15),
      dayStart(18)
    );

    expect(hours(period!.totals.flex)).toBe(-0.25);
    expect(hours(period!.flex.closing)).toBe(-0.25);
  });

  it("produktiv tid är 0,17 och improduktiv 33,58", async () => {
    const period = await buildPayrollPeriod(
      forCompany(companyId),
      TZ,
      johan,
      dayStart(15),
      dayStart(18)
    );

    expect(hours(period!.totals.productive)).toBe(0.17);
    expect(hours(period!.totals.indirect)).toBe(33.58);
  });

  it("den improduktiva tiden redovisas per moment", async () => {
    const period = await buildPayrollPeriod(
      forCompany(companyId),
      TZ,
      johan,
      dayStart(15),
      dayStart(18)
    );

    expect(period!.indirectByMoment).toHaveLength(1);
    expect(period!.indirectByMoment[0].name).toBe("Städ Verstad");
    expect(hours(period!.indirectByMoment[0].minutes)).toBe(33.58);
  });

  /**
   * Två dagssummor skiljer sig med en hundradel från den utskrivna rapporten,
   * och det är rapporten som räknar fel.
   *
   * Måndagen står som 8,66 där, men är 520 minuter = 8,6667. Det gamla
   * systemet summerade sina EGNA AVRUNDADE radvärden: 5,28 + 3,38 = 8,66.
   * Torsdagen har samma fel åt andra hållet, 8,11 mot 8,10.
   *
   * Felen tar ut varandra över veckan, och veckosumman 33,75 är exakt rätt i
   * båda systemen — vilket är den siffra flexen räknas på. Tikkr avrundar en
   * gång, på summan, i stället för på varje rad.
   */
  it("dagssummorna stämmer dag för dag", async () => {
    const period = await buildPayrollPeriod(
      forCompany(companyId),
      TZ,
      johan,
      dayStart(15),
      dayStart(18)
    );

    const worked = period!.days.map((day) => hours(day.workedMinutes));

    expect(worked).toEqual([8.67, 8.43, 8.55, 8.1]);

    // Och summan av dagarna är exakt veckosumman i kundens rapport.
    const minutes = period!.days.reduce((t, d) => t + d.workedMinutes, 0);
    expect(minutes).toBe(2025);
    expect(hours(minutes)).toBe(33.75);
  });
});

describe("flexformeln", () => {
  it("en vanlig dag ger noll", async () => {
    const period = await buildPayrollPeriod(
      forCompany(companyId),
      TZ,
      johan,
      dayStart(22),
      dayStart(22)
    );

    // Måndag utan stämplingar: hela den planerade dagen fattas.
    expect(hours(period!.totals.planned)).toBe(8.5);
    expect(hours(period!.totals.flex)).toBe(-8.5);
  });

  it("en sjukdag ger noll i flex, inte minus en arbetsdag", async () => {
    const db = forCompany(companyId);

    await markAbsence(db, companyId, TZ, {
      employeeId: johan,
      date: dayStart(23),
      type: "SJUK",
      byEmail: "admin@test.se",
    });

    const period = await buildPayrollPeriod(db, TZ, johan, dayStart(23), dayStart(23));

    expect(hours(period!.totals.absence)).toBe(8.5);
    expect(hours(period!.totals.flex)).toBe(0);
    expect(period!.absenceByType).toEqual([{ type: "SJUK", minutes: 510 }]);
  });

  it("godkänd övertid flyttas ur flex och in i komptiden", async () => {
    const db = forCompany(companyId);

    // Tio och en halv timmes arbete på en dag med 8,5 planerat.
    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: johan,
        kind: "INDIRECT",
        indirectMomentId: stadning,
        clockInAt: at(24, "06:30"),
        clockOutAt: at(24, "17:00"),
      },
    });

    await addCompEarned(db, companyId, {
      employeeId: johan,
      date: dayStart(24),
      minutes: 120,
      byEmail: "admin@test.se",
    });

    const period = await buildPayrollPeriod(db, TZ, johan, dayStart(24), dayStart(24));

    expect(hours(period!.totals.worked)).toBe(10.5);
    expect(hours(period!.totals.flex)).toBe(0);
    expect(hours(period!.comp.earned)).toBe(2);
    expect(hours(period!.comp.closing)).toBe(2);
  });

  it("uttagen komp täcker dagen och drar på saldot", async () => {
    const db = forCompany(companyId);

    await markAbsence(db, companyId, TZ, {
      employeeId: johan,
      date: dayStart(25),
      type: "KOMP_UTTAG",
      byEmail: "admin@test.se",
    });

    const period = await buildPayrollPeriod(db, TZ, johan, dayStart(25), dayStart(25));

    expect(hours(period!.totals.flex)).toBe(0);
    expect(hours(period!.comp.taken)).toBe(8.5);
    expect(hours(period!.comp.period)).toBe(-8.5);
  });
});

describe("arbetad tid är huvudstämplingen", () => {
  it("två maskiner samtidigt ger en timme närvaro, inte två", async () => {
    const company = await unsafeGlobalPrisma.company.create({
      data: { name: "Lönetest parallell", timezone: TZ },
    });

    const anna = await unsafeGlobalPrisma.employee.create({
      data: { companyId: company.id, name: "Anna" },
    });
    const fras = await unsafeGlobalPrisma.workMoment.create({
      data: { companyId: company.id, name: "Fräsning" },
    });
    const svets = await unsafeGlobalPrisma.workMoment.create({
      data: { companyId: company.id, name: "Svetsning" },
    });
    const ordern = await unsafeGlobalPrisma.order.create({
      data: { companyId: company.id, orderNumber: "1" },
    });

    for (const momentId of [fras, svets]) {
      await unsafeGlobalPrisma.timeEntry.create({
        data: {
          companyId: company.id,
          employeeId: anna.id,
          kind: "ORDER",
          orderId: ordern.id,
          momentId: momentId.id,
          clockInAt: at(15, "08:00"),
          clockOutAt: at(15, "12:00"),
        },
      });
    }

    const period = await buildPayrollPeriod(
      forCompany(company.id),
      TZ,
      anna.id,
      dayStart(15),
      dayStart(15)
    );

    // Åtta maskintimmar att fakturera, fyra timmar på plats.
    expect(hours(period!.totals.productive)).toBe(8);
    expect(hours(period!.totals.worked)).toBe(4);

    await unsafeGlobalPrisma.company.delete({ where: { id: company.id } });
  });
});

describe("multi-tenant", () => {
  it("en annan kunds anställd går inte att hämta tidrapport för", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Lönetest grannen", timezone: TZ },
    });
    const theirs = await unsafeGlobalPrisma.employee.create({
      data: { companyId: other.id, name: "Deras Anställd" },
    });

    const period = await buildPayrollPeriod(
      forCompany(companyId),
      TZ,
      theirs.id,
      dayStart(15),
      dayStart(18)
    );

    expect(period).toBeNull();

    await unsafeGlobalPrisma.company.delete({ where: { id: other.id } });
  });

  it("flexsaldot för en okänd anställd är null, inte noll", async () => {
    expect(
      await currentFlexMinutes(forCompany(companyId), TZ, "finns-inte")
    ).toBeNull();
  });
});
