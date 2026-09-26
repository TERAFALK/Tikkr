import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { clockIn, clockOut } from "@/lib/clock";
import { getOrderCalcs } from "@/lib/order-calc";

/**
 * Kalkylen per order.
 *
 * Två saker måste hålla. Den ena: improduktiv avrundning får inte smyga in, så
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
      data: {
        companyId,
        orderNumber: "7001",
        customer: { create: { companyId: companyId, name: "Kund A" } },
      },
    })
  ).id;
  annanOrder = (
    await unsafeGlobalPrisma.order.create({
      data: {
        companyId,
        orderNumber: "7002",
        customer: { create: { companyId: companyId, name: "Kund B" } },
      },
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
  // Timkostnaderna återställs: flera tester ändrar dem med flit.
  await unsafeGlobalPrisma.workMoment.update({
    where: { id: svetsning },
    data: { costRateOre: 18000 },
  });
  // Anna har som utgångspunkt INGEN egen timkostnad. De flesta testerna
  // handlar om maskinens sats, och en personsats hade tystat in sig i varje
  // summa de kontrollerar.
  await unsafeGlobalPrisma.employee.update({
    where: { id: anna },
    data: { costRateOre: null },
  });
  await unsafeGlobalPrisma.order.update({
    where: { id: order },
    data: { markupPercent: null, fixedPriceOre: null },
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
  await clockIn(companyId, {
    kind: "ORDER",
    employeeId: anna,
    orderId,
    momentId,
    at: start,
  });
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
    expect(calc.groups).toHaveLength(1);
    expect(calc.groups[0].momentName).toBe("Svetsning");
    expect(calc.groups[0].costOre).toBe(18000);
    expect(calc.groups[0].entries).toHaveLength(1);
    expect(calc.groups[0].entries[0].costRateOre).toBe(18000);
    expect(calc.groups[0].entries[0].employeeName).toBe("Anna Andersson");
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

    // En grupp, men två rader i den. Varje stämpling ska gå att se.
    expect(calc.groups).toHaveLength(1);
    expect(calc.groups[0].entries).toHaveLength(2);
    expect(calc.groups[0].minutes).toBe(90);
    expect(calc.groups[0].costOre).toBe(27000);
  });

  it("håller isär olika arbetsmoment", async () => {
    await work(order, svetsning, 60, "2026-08-05T06:00:00Z");
    await work(order, montering, 60, "2026-08-05T09:00:00Z");

    const calc = await calcFor(order);

    expect(calc.groups).toHaveLength(2);
    expect(calc.totalCostOre).toBe(30000);
    // Dyrast först — den som läser en kalkyl vill veta vad som kostade mest.
    expect(calc.groups[0].momentName).toBe("Svetsning");
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

    expect(calc.groups[0].entries[0].costRateOre).toBe(18000);
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

    // Ett moment, två stämplingar till olika pris. Varje rad bär sitt eget
    // pris — att slå ihop dem hade krävt ett pris som ingen av dem hade.
    expect(calc.groups).toHaveLength(1);
    expect(calc.groups[0].entries).toHaveLength(2);
    expect(calc.totalCostOre).toBe(38000);
    expect(calc.groups[0].costOre).toBe(38000);

    // Uttrycklig jämförelse: Array.sort utan den sorterar som text, och
    // "18000" < "20000" råkar stämma bara så länge talen är lika långa.
    const rates = calc.groups[0].entries
      .map((entry) => entry.costRateOre ?? 0)
      .sort((a, b) => a - b);
    expect(rates).toEqual([18000, 20000]);
  });
});

describe("detaljraderna", () => {
  it("bär det som ska stå på en rad i efterkalkylen", async () => {
    await work(order, svetsning, 102, "2026-09-08T13:00:00Z");

    const entry = (await calcFor(order)).groups[0].entries[0];

    expect(entry.employeeName).toBe("Anna Andersson");
    expect(entry.minutes).toBe(102);
    expect(entry.costRateOre).toBe(18000);
    expect(entry.costOre).toBe(30600);
    expect(entry.ongoing).toBe(false);
    expect(entry.clockOutAt).not.toBeNull();
  });

  it("listar stämplingarna i tidsordning inom gruppen", async () => {
    await work(order, svetsning, 60, "2026-09-08T06:00:00Z");
    await work(order, svetsning, 60, "2026-09-08T10:00:00Z");
    await work(order, svetsning, 60, "2026-09-08T14:00:00Z");

    const entries = (await calcFor(order)).groups[0].entries;

    expect(entries).toHaveLength(3);
    expect(entries[0].clockInAt.getTime()).toBeLessThan(
      entries[1].clockInAt.getTime()
    );
    expect(entries[1].clockInAt.getTime()).toBeLessThan(
      entries[2].clockInAt.getTime()
    );
  });

  it("sätter grupperna dyrast först", async () => {
    // Montering kostar mindre per timme men får mer tid — det är kronorna
    // som ska styra ordningen, inte timmarna.
    await work(order, svetsning, 60, "2026-09-08T06:00:00Z");
    await work(order, montering, 120, "2026-09-08T08:00:00Z");

    const groups = (await calcFor(order)).groups;

    expect(groups[0].momentName).toBe("Montering");
    expect(groups[0].costOre).toBe(24000);
    expect(groups[1].momentName).toBe("Svetsning");
    expect(groups[1].costOre).toBe(18000);
  });

  it("räknar antalet stämplingar på ordern", async () => {
    await work(order, svetsning, 60, "2026-09-08T06:00:00Z");
    await work(order, montering, 60, "2026-09-08T08:00:00Z");

    expect((await calcFor(order)).entryCount).toBe(2);
  });

  it("delsumman per grupp är summan av dess rader", async () => {
    await work(order, svetsning, 43, "2026-09-08T06:00:00Z");
    await work(order, svetsning, 17, "2026-09-08T08:00:00Z");

    const group = (await calcFor(order)).groups[0];
    const sum = group.entries.reduce((total, e) => total + (e.costOre ?? 0), 0);

    // Avrundning sker per rad, precis som i kundens nuvarande rapport.
    // Delsumman måste därför vara summan av de avrundade raderna.
    expect(group.costOre).toBe(sum);
  });
});

describe("fast pris och vinst", () => {
  it("ett fast pris går före påslaget", async () => {
    await unsafeGlobalPrisma.order.update({
      where: { id: order },
      data: { fixedPriceOre: 735000 },
    });
    await work(order, svetsning, 60);

    const calc = await calcFor(order);

    expect(calc.priceIsFixed).toBe(true);
    expect(calc.priceOre).toBe(735000);
    // Inte 25 200, som påslaget hade gett.
    expect(calc.priceOre).not.toBe(25200);
  });

  it("räknar vinsten mot självkostnaden, som kundens eget ark", async () => {
    await unsafeGlobalPrisma.order.update({
      where: { id: order },
      data: { fixedPriceOre: 735000 },
    });
    await work(order, svetsning, 60);

    const calc = await calcFor(order);

    expect(calc.totalCostOre).toBe(18000);
    expect(calc.profitOre).toBe(717000);
    expect(calc.profitPercent).toBe(3983);
  });

  it("visar förlust som ett negativt tal", async () => {
    await unsafeGlobalPrisma.order.update({
      where: { id: order },
      data: { fixedPriceOre: 10000 },
    });
    await work(order, svetsning, 60);

    const calc = await calcFor(order);

    expect(calc.profitOre).toBe(-8000);
    expect(calc.profitPercent).toBe(-44);
  });

  it("utan fast pris kommer priset från påslaget", async () => {
    await work(order, svetsning, 60);

    const calc = await calcFor(order);

    expect(calc.priceIsFixed).toBe(false);
    expect(calc.priceOre).toBe(25200);
    expect(calc.profitOre).toBe(7200);
  });

  it("ger ingen vinstprocent när kostnaden är noll", async () => {
    await unsafeGlobalPrisma.order.update({
      where: { id: order },
      data: { fixedPriceOre: 500000 },
    });
    await work(order, utanKostnad, 60);

    const calc = await calcFor(order);

    // Ingen nämnare att dela med. "Oändlig marginal" är inget att skriva
    // på ett papper.
    expect(calc.totalCostOre).toBe(0);
    expect(calc.profitPercent).toBeNull();
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

    const saknar = calc.groups.find(
      (group) => group.momentName === "Kvalitetskontroll"
    );
    expect(saknar?.costOre).toBe(0);
    expect(saknar?.minutesWithoutRate).toBe(120);
    expect(saknar?.entries[0].costOre).toBeNull();
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
      kind: "ORDER",
      employeeId: anna,
      orderId: order,
      momentId: svetsning,
    });

    const calc = await calcFor(order);

    expect(calc.ongoingCount).toBe(1);
    expect(calc.totalMinutes).toBeGreaterThanOrEqual(0);
  });

  it("rapporterar poster där systemet räknat fram sluttiden", async () => {
    await work(order, svetsning, 60);
    await unsafeGlobalPrisma.timeEntry.updateMany({
      where: { companyId, orderId: order },
      data: { needsReview: true },
    });

    const calc = await calcFor(order);
    expect(calc.ungradedCount).toBe(1);
  });
});

describe("timkostnad per person och maskin", () => {
  /**
   * Människan och maskinen kostar samtidigt.
   *
   * Det viktiga att skydda: satserna LÄGGS IHOP, de ersätter inte varandra,
   * och en saknad sats är inte noll kronor. Får någon av de två reglerna fel
   * blir beloppet på en efterkalkyl fel utan att något ser trasigt ut.
   */

  const payAnna = (ore: number | null) =>
    unsafeGlobalPrisma.employee.update({
      where: { id: anna },
      data: { costRateOre: ore },
    });

  it("lägger ihop personens och maskinens sats", async () => {
    // Anna 350 kr/tim vid en svets som kostar 180. En timme kostar 530.
    await payAnna(35000);
    await work(order, svetsning, 60);

    const entry = (await calcFor(order)).groups[0].entries[0];

    expect(entry.employeeCostRateOre).toBe(35000);
    expect(entry.momentCostRateOre).toBe(18000);
    expect(entry.costRateOre).toBe(53000);
    expect(entry.costOre).toBe(53000);
  });

  it("räknar personen ensam när momentet saknar sats", async () => {
    await payAnna(35000);
    await work(order, utanKostnad, 60);

    const entry = (await calcFor(order)).groups[0].entries[0];

    expect(entry.momentCostRateOre).toBeNull();
    expect(entry.costRateOre).toBe(35000);
    expect(entry.costOre).toBe(35000);
  });

  it("räknar maskinen ensam när personen saknar sats", async () => {
    // Utgångsläget, och det som gällde innan personsatser fanns. Måste
    // fortsätta ge exakt samma belopp som förut.
    await work(order, svetsning, 60);

    const entry = (await calcFor(order)).groups[0].entries[0];

    expect(entry.employeeCostRateOre).toBeNull();
    expect(entry.costRateOre).toBe(18000);
    expect(entry.costOre).toBe(18000);
  });

  it("saknas båda satserna är raden utan underlag, inte noll kronor", async () => {
    await work(order, utanKostnad, 60);

    const calc = await calcFor(order);
    const entry = calc.groups[0].entries[0];

    expect(entry.costRateOre).toBeNull();
    expect(entry.costOre).toBeNull();
    // Tiden finns kvar och redovisas som saknad, i stället för att tyst dra
    // ner summan genom att bidra med noll.
    expect(calc.groups[0].minutesWithoutRate).toBe(60);
    expect(calc.totalCostOre).toBe(0);
  });

  it("en höjd personsats ändrar inte en post som redan stämplats", async () => {
    await payAnna(35000);
    await work(order, svetsning, 60);

    // Anna får påslag. Kalkylen som redan tagits ut ska se likadan ut.
    await payAnna(40000);

    const entry = (await calcFor(order)).groups[0].entries[0];

    expect(entry.employeeCostRateOre).toBe(35000);
    expect(entry.costOre).toBe(53000);
  });

  it("två stämplingar kan bära olika personsats", async () => {
    await payAnna(35000);
    await work(order, svetsning, 60, "2026-08-05T06:00:00Z");
    await payAnna(40000);
    await work(order, svetsning, 60, "2026-08-06T06:00:00Z");

    const calc = await calcFor(order);

    // 530 + 580 kronor. Varje rad bär sitt eget pris, precis som när
    // momentets sats ändras.
    expect(calc.totalCostOre).toBe(53000 + 58000);
  });

  it("påslaget räknas på den hopslagna självkostnaden", async () => {
    // Företaget har 140 procent påslag. Priset ska följa den nya, högre
    // självkostnaden — annars hade personens tid varit gratis för kunden.
    await payAnna(35000);
    await work(order, svetsning, 60);

    const calc = await calcFor(order);

    expect(calc.totalCostOre).toBe(53000);
    expect(calc.priceOre).toBe(Math.round(53000 * 1.4));
  });

  it("improduktiv tid får ingen av satserna", async () => {
    // Kontrolleras i clock.test.ts på posten. Här: en improduktiv stämpling
    // syns aldrig i en efterkalkyl överhuvudtaget.
    await payAnna(35000);
    await work(order, svetsning, 60);

    const calc = await calcFor(order);

    expect(calc.groups).toHaveLength(1);
    expect(calc.groups[0].momentName).toBe("Svetsning");
  });
});
