import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { clockIn, clockOut } from "@/lib/clock";
import { getOrderCalcs } from "@/lib/order-calc";

/**
 * Kalkylen per order.
 *
 * Två saker måste hålla. Den ena: inproduktiv avrundning får inte smyga in, så
 * att totalen skiljer sig från det kunden räknar för hand. Den andra, och
 * viktigare: en höjd timkostnad får ALDRIG ändra en kalkyl som redan tagits
 * ut och fakturerats.
 */

let companyId: string;
let anna: string;
let order: string;
let annanOrder: string;
let svetsning: string;
let montering: string;
let utanKostnad: string;

beforeAll(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: {
      name: "Kalkyltest AB",
      autoCloseAt: "18:00",
      timezone: "Europe/Stockholm",
      markupPercent: 140,
    },
  });
  companyId = company.id;

  anna = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna Andersson" },
    })
  ).id;

  order = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "7001", customerName: "Kund A" },
    })
  ).id;
  annanOrder = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "7002", customerName: "Kund B" },
    })
  ).id;

  svetsning = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning", costRateOre: 18000 },
    })
  ).id;
  montering = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Montering", costRateOre: 12000 },
    })
  ).id;
  utanKostnad = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Kvalitetskontroll" },
    })
  ).id;
});

beforeEach(async () => {
  await unsafeGlobalPrisma.timeEntry.deleteMany({ where: { companyId } });
  // Timkostnaderna återställs: ett test höjer dem med flit.
  await unsafeGlobalPrisma.workMoment.update({
    where: { id: svetsning },
    data: { costRateOre: 18000 },
  });
  await unsafeGlobalPrisma.order.update({
    where: { id: order },
    data: { markupPercent: null },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });
  await unsafeGlobalPrisma.$disconnect();
});

/** Stämplar in och ut igen, och ger posten en känd längd i minuter. */
async function work(
  orderId: string,
  momentId: string,
  minutes: number,
  startIso = "2026-08-05T06:00:00Z"
) {
  const start = new Date(startIso);
  await clockIn(companyId, { employeeId: anna, orderId, momentId, at: start });
  await clockOut(companyId, {
    employeeId: anna,
    at: new Date(start.getTime() + minutes * 60_000),
  });
}

const calcFor = async (orderId: string, companyMarkup = 140) =>
  (await getOrderCalcs(forCompany(companyId), [orderId], companyMarkup))[0];

describe("kostnad per order", () => {
  it("räknar tid gånger timkostnad", async () => {
    await work(order, svetsning, 60);

    const calc = await calcFor(order);

    expect(calc.totalMinutes).toBe(60);
    expect(calc.totalCostOre).toBe(18000);
    expect(calc.rows).toHaveLength(1);
    expect(calc.rows[0].momentName).toBe("Svetsning");
    expect(calc.rows[0].costRateOre).toBe(18000);
    expect(calc.rows[0].costOre).toBe(18000);
  });

  it("räknar delar av en timme", async () => {
    await work(order, svetsning, 90);

    const calc = await calcFor(order);
    expect(calc.totalCostOre).toBe(27000);
  });

  it("slår ihop flera stämplingar på samma moment till en rad", async () => {
    await work(order, svetsning, 60, "2026-08-05T06:00:00Z");
    await work(order, svetsning, 30, "2026-08-05T09:00:00Z");

    const calc = await calcFor(order);

    expect(calc.rows).toHaveLength(1);
    expect(calc.rows[0].minutes).toBe(90);
    expect(calc.rows[0].costOre).toBe(27000);
  });

  it("håller isär olika arbetsmoment", async () => {
    await work(order, svetsning, 60, "2026-08-05T06:00:00Z");
    await work(order, montering, 60, "2026-08-05T09:00:00Z");

    const calc = await calcFor(order);

    expect(calc.rows).toHaveLength(2);
    expect(calc.totalCostOre).toBe(30000);
    // Dyrast först — den som läser en kalkyl vill veta vad som kostade mest.
    expect(calc.rows[0].momentName).toBe("Svetsning");
  });

  it("räknar inte med andra ordrars tid", async () => {
    await work(order, svetsning, 60, "2026-08-05T06:00:00Z");
    await work(annanOrder, svetsning, 120, "2026-08-05T09:00:00Z");

    const calc = await calcFor(order);

    expect(calc.totalMinutes).toBe(60);
    expect(calc.totalCostOre).toBe(18000);
  });
});

describe("påslag och pris", () => {
  it("använder företagets påslag", async () => {
    await work(order, svetsning, 60);

    const calc = await calcFor(order);

    expect(calc.markupPercent).toBe(140);
    expect(calc.markupFromOrder).toBe(false);
    expect(calc.priceOre).toBe(25200);
  });

  it("låter orderns eget påslag gå före företagets", async () => {
    await unsafeGlobalPrisma.order.update({
      where: { id: order },
      data: { markupPercent: 200 },
    });
    await work(order, svetsning, 60);

    const calc = await calcFor(order);

    expect(calc.markupPercent).toBe(200);
    expect(calc.markupFromOrder).toBe(true);
    expect(calc.priceOre).toBe(36000);
  });

  it("ger priset lika med kostnaden när inget påslag finns", async () => {
    await work(order, svetsning, 60);

    const calc = await calcFor(order, 100);

    expect(calc.priceOre).toBe(calc.totalCostOre);
  });
});

describe("en prishöjning rör aldrig redan registrerad tid", () => {
  it("behåller den timkostnad som gällde vid stämplingen", async () => {
    await work(order, svetsning, 60);

    // Företaget höjer svetsning från 180 till 200 kr i timmen.
    await unsafeGlobalPrisma.workMoment.update({
      where: { id: svetsning },
      data: { costRateOre: 20000 },
    });

    const calc = await calcFor(order);

    expect(calc.rows[0].costRateOre).toBe(18000);
    expect(calc.totalCostOre).toBe(18000);
  });

  it("ger ny tid det nya priset", async () => {
    await work(order, svetsning, 60, "2026-08-05T06:00:00Z");

    await unsafeGlobalPrisma.workMoment.update({
      where: { id: svetsning },
      data: { costRateOre: 20000 },
    });

    await work(order, svetsning, 60, "2026-08-06T06:00:00Z");

    const calc = await calcFor(order);

    // Samma moment, två priser — alltså två rader. Att slå ihop dem hade
    // krävt ett pris som ingen av stämplingarna faktiskt hade.
    expect(calc.rows).toHaveLength(2);
    expect(calc.totalCostOre).toBe(38000);

    // Uttrycklig jämförelse: Array.sort utan den sorterar som text, och
    // "18000" < "20000" råkar stämma bara så länge talen är lika långa.
    const rates = calc.rows
      .map((row) => row.costRateOre ?? 0)
      .sort((a, b) => a - b);
    expect(rates).toEqual([18000, 20000]);
  });
});

describe("tid utan timkostnad", () => {
  it("räknas inte in i summan och redovisas för sig", async () => {
    await work(order, svetsning, 60, "2026-08-05T06:00:00Z");
    await work(order, utanKostnad, 120, "2026-08-05T09:00:00Z");

    const calc = await calcFor(order);

    expect(calc.totalMinutes).toBe(180);
    expect(calc.totalCostOre).toBe(18000);
    expect(calc.minutesWithoutRate).toBe(120);

    const saknar = calc.rows.find((row) => row.costRateOre === null);
    expect(saknar?.momentName).toBe("Kvalitetskontroll");
    expect(saknar?.costOre).toBeNull();
  });

  it("ger noll i kostnad när ingen tid har någon timkostnad", async () => {
    await work(order, utanKostnad, 60);

    const calc = await calcFor(order);

    expect(calc.totalCostOre).toBe(0);
    expect(calc.priceOre).toBe(0);
    expect(calc.minutesWithoutRate).toBe(60);
  });
});

describe("pågående och ogranskad tid räknas men flaggas", () => {
  it("räknar en pågående stämpling och rapporterar den", async () => {
    await clockIn(companyId, {
      employeeId: anna,
      orderId: order,
      momentId: svetsning,
    });

    const calc = await calcFor(order);

    expect(calc.ongoingCount).toBe(1);
    expect(calc.totalMinutes).toBeGreaterThanOrEqual(0);
  });

  it("rapporterar poster som systemet gissat sluttiden på", async () => {
    await work(order, svetsning, 60);
    await unsafeGlobalPrisma.timeEntry.updateMany({
      where: { companyId, orderId: order },
      data: { needsReview: true },
    });

    const calc = await calcFor(order);
    expect(calc.ungradedCount).toBe(1);
  });
});
