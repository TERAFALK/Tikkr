import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { customerMoney, customerStats } from "@/lib/customers";

/**
 * Kundsidans siffror.
 *
 * Svarar på frågan som inte gick att ställa före kundregistret: vad har vi
 * gjort åt den här kunden, och vad har vi tjänat på dem.
 *
 * Det som måste hålla: att bara kundens EGNA ordrar räknas, att påslagskedjan
 * följs, och att en fastprisorder fördelas efter kostnaden varje månad i
 * stället för att landa som en pik i en enda.
 */

const SE = "Europe/Stockholm";

let companyId: string;
let volvo: string;
let teltek: string;
let anna: string;
let svetsning: string;

/** Företagets standardpåslag i testerna. 1,40. */
const COMPANY_MARKUP = 140;

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  const company = await unsafeGlobalPrisma.company.create({
    data: {
      name: `Kundstat ${unique}`,
      markupPercent: COMPANY_MARKUP,
      timezone: SE,
    },
  });
  companyId = company.id;

  const [volvoRow, teltekRow, employee, moment] = await Promise.all([
    unsafeGlobalPrisma.customer.create({
      data: { companyId, name: "Volvo" },
    }),
    unsafeGlobalPrisma.customer.create({
      data: { companyId, name: "Teltek" },
    }),
    unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna Andersson" },
    }),
    unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning" },
    }),
  ]);

  volvo = volvoRow.id;
  teltek = teltekRow.id;
  anna = employee.id;
  svetsning = moment.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Kundstat " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

const db = () => forCompany(companyId);

/** En order på angiven kund. */
async function order(
  customerId: string | null,
  orderNumber: string,
  extra: Record<string, unknown> = {}
) {
  return unsafeGlobalPrisma.order.create({
    data: { companyId, orderNumber, customerId, ...extra },
  });
}

/**
 * En stämpling med angiven längd och timkostnad.
 *
 * Satserna skrivs direkt, som ögonblicksbilden på posten — inte slås upp. Det
 * är så de fungerar i drift, och ett test som går via momentets aktuella sats
 * hade missat hela poängen med att de kopieras.
 */
async function punch(
  orderId: string,
  startIso: string,
  minutes: number,
  rateOre: number | null
) {
  const start = new Date(startIso);

  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId,
      employeeId: anna,
      orderId,
      momentId: svetsning,
      kind: "ORDER",
      clockInAt: start,
      clockOutAt: new Date(start.getTime() + minutes * 60_000),
      momentCostRateOre: rateOre,
    },
  });
}

describe("tid och ordrar", () => {
  it("räknar bara kundens egna ordrar", async () => {
    const mine = await order(volvo, "2601");
    const theirs = await order(teltek, "2602");

    await punch(mine.id, "2026-09-01T06:00:00Z", 60, 10000);
    await punch(theirs.id, "2026-09-01T06:00:00Z", 120, 10000);

    const stats = await customerStats(db(), volvo);

    expect(stats.orders).toHaveLength(1);
    expect(stats.totalMinutes).toBe(60);
  });

  it("ordrar utan kund hör inte till någon", async () => {
    const loose = await order(null, "2603");
    await punch(loose.id, "2026-09-01T06:00:00Z", 60, 10000);

    expect((await customerStats(db(), volvo)).orders).toEqual([]);
  });

  it("öppna ordrar först", async () => {
    await order(volvo, "2601", { status: "CLOSED" });
    await order(volvo, "2602");

    const stats = await customerStats(db(), volvo);

    expect(stats.orders.map((row) => row.orderNumber)).toEqual([
      "2602",
      "2601",
    ]);
    expect(stats.openOrders).toBe(1);
  });

  it("fördelar tiden per arbetsmoment, mest först", async () => {
    const fräsning = await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Fräsning" },
    });
    const own = await order(volvo, "2601");

    await punch(own.id, "2026-09-01T06:00:00Z", 60, 10000);
    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: anna,
        orderId: own.id,
        momentId: fräsning.id,
        kind: "ORDER",
        clockInAt: new Date("2026-09-02T06:00:00Z"),
        clockOutAt: new Date("2026-09-02T09:00:00Z"),
        momentCostRateOre: 10000,
      },
    });

    const stats = await customerStats(db(), volvo);

    expect(stats.byMoment.map((row) => row.name)).toEqual([
      "Fräsning",
      "Svetsning",
    ]);
  });
});

describe("pengarna", () => {
  const money = (now = new Date("2026-09-15T12:00:00Z")) =>
    customerMoney(db(), volvo, COMPANY_MARKUP, SE, now);

  it("företagets påslag när varken order eller kund har eget", async () => {
    const own = await order(volvo, "2601");
    // En timme à 100 kr = 10 000 ören kostnad, × 1,40 = 14 000.
    await punch(own.id, "2026-09-01T06:00:00Z", 60, 10000);

    const result = await money();

    expect(result.costOre).toBe(10000);
    expect(result.priceOre).toBe(14000);
    expect(result.marginOre).toBe(4000);
  });

  it("kundens påslag går före företagets", async () => {
    await unsafeGlobalPrisma.customer.update({
      where: { id: volvo },
      data: { markupPercent: 130 },
    });

    const own = await order(volvo, "2601");
    await punch(own.id, "2026-09-01T06:00:00Z", 60, 10000);

    expect((await money()).priceOre).toBe(13000);
  });

  it("rabatten dras av efter påslaget", async () => {
    await unsafeGlobalPrisma.customer.update({
      where: { id: volvo },
      data: { discountPercent: 10 },
    });

    const own = await order(volvo, "2601");
    await punch(own.id, "2026-09-01T06:00:00Z", 60, 10000);

    // 10 000 × 1,40 = 14 000, minus tio procent = 12 600.
    expect((await money()).priceOre).toBe(12600);
  });

  it("tid utan timkostnad räknas som saknad, inte som gratis", async () => {
    const own = await order(volvo, "2601");
    await punch(own.id, "2026-09-01T06:00:00Z", 60, 10000);
    await punch(own.id, "2026-09-02T06:00:00Z", 30, null);

    const result = await money();

    expect(result.minutesWithoutRate).toBe(30);
    // Den saknade halvtimmen drar INTE ner priset. Den redovisas separat.
    expect(result.costOre).toBe(10000);
  });

  it("ett annat företags kund går inte att fråga om", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Kundstat grannen" },
    });
    const grannens = await unsafeGlobalPrisma.customer.create({
      data: { companyId: other.id, name: "Grannens kund" },
    });

    const result = await customerMoney(
      db(),
      grannens.id,
      COMPANY_MARKUP,
      SE,
      new Date("2026-09-15T12:00:00Z")
    );

    expect(result.costOre).toBe(0);
    expect(result.priceOre).toBe(0);
  });
});

describe("månadsgrafen", () => {
  const money = (now = new Date("2026-09-15T12:00:00Z")) =>
    customerMoney(db(), volvo, COMPANY_MARKUP, SE, now);

  it("tolv månader, äldst först", async () => {
    const months = (await money()).months;

    expect(months).toHaveLength(12);
    expect(months[11].label).toBe("sep");
    expect(months[0].label).toBe("okt");
  });

  it("lägger marginalen på månaden stämplingen gjordes", async () => {
    const own = await order(volvo, "2601");
    await punch(own.id, "2026-08-10T06:00:00Z", 60, 10000);

    const months = (await money()).months;
    const augusti = months.find((month) => month.label === "aug");

    expect(augusti?.marginOre).toBe(4000);
    expect(months.find((month) => month.label === "sep")?.marginOre).toBe(0);
  });

  it("fastprisorder fördelas efter kostnaden varje månad", async () => {
    // Fast pris 20 000 ören. Kostnad 5 000 i augusti och 5 000 i september,
    // alltså hälften var. Marginalen är 20 000 − 10 000 = 10 000, och ska
    // delas jämnt — inte landa som en pik i den sista månaden.
    const own = await order(volvo, "2601", { fixedPriceOre: 20000 });
    await punch(own.id, "2026-08-10T06:00:00Z", 30, 10000);
    await punch(own.id, "2026-09-10T06:00:00Z", 30, 10000);

    const months = (await money()).months;

    expect(months.find((month) => month.label === "aug")?.marginOre).toBe(5000);
    expect(months.find((month) => month.label === "sep")?.marginOre).toBe(5000);
  });

  it("en fastprisorder utan tid hör inte till någon månad", async () => {
    await order(volvo, "2601", { fixedPriceOre: 20000 });

    const result = await money();

    // Priset räknas i totalen, men det finns ingen kostnad att fördela efter.
    expect(result.priceOre).toBe(20000);
    expect(result.months.every((month) => month.marginOre === 0)).toBe(true);
  });

  it("i år och förra året räknas på företagets tidszon", async () => {
    const own = await order(volvo, "2601");

    // 00:30 svensk tid den 1 januari 2026 är 23:30 UTC den 31 december 2025.
    // Räknat i serverns tid hade den hamnat på fel år.
    await punch(own.id, "2025-12-31T23:30:00Z", 60, 10000);

    const result = await money();

    expect(result.thisYearOre).toBe(4000);
    expect(result.lastYearOre).toBe(0);
  });
});
