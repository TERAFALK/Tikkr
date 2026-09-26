import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  budgetTotal,
  parseHours,
  readBudgetRows,
  saveOrderBudgets,
  BUDGET_HOURS_FIELD,
  BUDGET_MOMENT_FIELD,
} from "@/lib/order-budget";

/**
 * Beräknad tid per arbetsmoment.
 *
 * Tre saker måste hålla. Summan av raderna ÄR orderns beräknade tid, och den
 * siffran styr stapeln i orderlistan och raden i kundens underlag. En rad som
 * tagits bort på skärmen ska vara borta också i databasen. Och ett moment från
 * ett annat företag får aldrig kunna hamna på en av våra ordrar — id:na kommer
 * från ett formulär, alltså utifrån.
 */

let companyId: string;
let otherCompanyId: string;
let orderId: string;
let svets: string;
let montering: string;
let theirMoment: string;
let theirOrder: string;

/** Bygger ett inskickat formulär med en rad per moment. */
function form(rows: [momentId: string, hours: string][]): FormData {
  const data = new FormData();

  for (const [momentId, hours] of rows) {
    data.append(BUDGET_MOMENT_FIELD, momentId);
    data.append(BUDGET_HOURS_FIELD, hours);
  }

  return data;
}

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  const [company, other] = await Promise.all([
    unsafeGlobalPrisma.company.create({
      data: { name: `Beräkningstest ${unique}` },
    }),
    unsafeGlobalPrisma.company.create({
      data: { name: `Beräkningstest grannen ${unique}` },
    }),
  ]);

  companyId = company.id;
  otherCompanyId = other.id;

  orderId = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "8001" },
    })
  ).id;

  svets = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Svetsning" },
    })
  ).id;
  montering = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId, name: "Montering" },
    })
  ).id;

  theirMoment = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId: otherCompanyId, name: "Deras svetsning" },
    })
  ).id;
  theirOrder = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId: otherCompanyId, orderNumber: "9001" },
    })
  ).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Beräkningstest " } },
  });
});

describe("timfältet", () => {
  it("godtar både komma och punkt", () => {
    expect(parseHours("7,5")).toBe(7 * 60 + 30);
    expect(parseHours("7.5")).toBe(7 * 60 + 30);
    expect(parseHours("40")).toBe(40 * 60);
  });

  it("tomt betyder ingen beräkning, inte noll timmar", () => {
    expect(parseHours("")).toBeNull();
    expect(parseHours("   ")).toBeNull();
    expect(parseHours(null)).toBeNull();
  });

  it("noll, negativt och skräp ger ingen beräkning", () => {
    expect(parseHours("0")).toBeNull();
    expect(parseHours("-5")).toBeNull();
    expect(parseHours("i morgon")).toBeNull();
  });
});

describe("läsa raderna ur formuläret", () => {
  it("parar ihop moment och tid i den ordning de står", () => {
    const rows = readBudgetRows(
      form([
        [svets, "25"],
        [montering, "15"],
      ])
    );

    expect(rows).toEqual([
      { momentId: svets, minutes: 25 * 60 },
      { momentId: montering, minutes: 15 * 60 },
    ]);
  });

  it("hoppar över halvfyllda rader utan att avvisa resten", () => {
    const rows = readBudgetRows(
      form([
        [svets, "25"],
        [montering, ""],
        ["", "8"],
      ])
    );

    expect(rows).toEqual([{ momentId: svets, minutes: 25 * 60 }]);
  });

  it("lägger ihop samma moment till en rad", () => {
    const rows = readBudgetRows(
      form([
        [svets, "10"],
        [svets, "5"],
      ])
    );

    expect(rows).toEqual([{ momentId: svets, minutes: 15 * 60 }]);
  });

  it("inga rader alls ger ingen beräkning", () => {
    expect(readBudgetRows(new FormData())).toEqual([]);
    expect(budgetTotal([])).toBeNull();
  });
});

describe("spara beräkningen", () => {
  it("summan av raderna är orderns beräknade tid", async () => {
    const db = forCompany(companyId);

    await saveOrderBudgets(
      db,
      companyId,
      orderId,
      readBudgetRows(
        form([
          [svets, "25"],
          [montering, "15"],
        ])
      )
    );

    const saved = await db.orderBudget.findMany({ where: { orderId } });

    expect(saved).toHaveLength(2);
    expect(budgetTotal(saved)).toBe(40 * 60);
  });

  it("ersätter den gamla beräkningen istället för att lägga till", async () => {
    const db = forCompany(companyId);

    await saveOrderBudgets(db, companyId, orderId, [
      { momentId: svets, minutes: 25 * 60 },
      { momentId: montering, minutes: 15 * 60 },
    ]);

    // Momenteringen togs bort på skärmen och svetsningen räknades om.
    await saveOrderBudgets(db, companyId, orderId, [
      { momentId: svets, minutes: 30 * 60 },
    ]);

    const saved = await db.orderBudget.findMany({ where: { orderId } });

    expect(saved).toHaveLength(1);
    expect(saved[0].momentId).toBe(svets);
    expect(saved[0].minutes).toBe(30 * 60);
  });

  it("tomma rader tar bort hela beräkningen", async () => {
    const db = forCompany(companyId);

    await saveOrderBudgets(db, companyId, orderId, [
      { momentId: svets, minutes: 25 * 60 },
    ]);
    await saveOrderBudgets(db, companyId, orderId, []);

    expect(await db.orderBudget.findMany({ where: { orderId } })).toEqual([]);
  });
});

describe("multi-tenant: id:n från formuläret", () => {
  it("ett annat företags arbetsmoment hoppas över", async () => {
    const db = forCompany(companyId);

    await saveOrderBudgets(db, companyId, orderId, [
      { momentId: svets, minutes: 10 * 60 },
      { momentId: theirMoment, minutes: 10 * 60 },
    ]);

    const saved = await db.orderBudget.findMany({ where: { orderId } });

    expect(saved).toHaveLength(1);
    expect(saved[0].momentId).toBe(svets);
  });

  it("en annan kunds order går inte att beräkna tid på", async () => {
    await saveOrderBudgets(forCompany(companyId), companyId, theirOrder, [
      { momentId: svets, minutes: 10 * 60 },
    ]);

    const leaked = await unsafeGlobalPrisma.orderBudget.findMany({
      where: { orderId: theirOrder },
    });

    expect(leaked).toEqual([]);
  });

  it("en annan kunds beräkning syns inte genom vår klient", async () => {
    await unsafeGlobalPrisma.orderBudget.create({
      data: {
        companyId: otherCompanyId,
        orderId: theirOrder,
        momentId: theirMoment,
        minutes: 10 * 60,
      },
    });

    const visible = await forCompany(companyId).orderBudget.findMany({});

    expect(visible).toEqual([]);
  });
});
