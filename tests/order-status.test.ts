import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { orderCount, orderRows } from "@/lib/orders";
import { personHref } from "@/lib/person-link";
import { forCompany, type CompanyDb } from "@/lib/tenant";

/**
 * STATUSFILTRET I ORDERLISTAN.
 *
 * Listan växte med varje avslutad order, och det gick inte att visa bara de
 * öppna. Filtret gäller både raderna och antalet, annars stämmer inte
 * bläddringen.
 */
let companyId: string;
let db: CompanyDb;

beforeAll(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Orderstatustest ${Math.random().toString(36).slice(2, 8)}` },
  });
  companyId = company.id;
  db = forCompany(companyId);

  await unsafeGlobalPrisma.order.createMany({
    data: [
      { companyId, orderNumber: "1", status: "OPEN" },
      { companyId, orderNumber: "2", status: "OPEN" },
      { companyId, orderNumber: "3", status: "CLOSED" },
    ],
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Orderstatustest " } },
  });
  await unsafeGlobalPrisma.$disconnect();
});

describe("statusfiltret", () => {
  it("visar bara öppna ordrar", async () => {
    const rows = await orderRows(db, { status: "OPEN" });

    expect(rows.map((row) => row.orderNumber).sort()).toEqual(["1", "2"]);
    expect(await orderCount(db, { status: "OPEN" })).toBe(2);
  });

  it("visar bara stängda ordrar", async () => {
    const rows = await orderRows(db, { status: "CLOSED" });

    expect(rows.map((row) => row.orderNumber)).toEqual(["3"]);
    expect(await orderCount(db, { status: "CLOSED" })).toBe(1);
  });

  it("visar alla utan filter", async () => {
    expect(await orderCount(db)).toBe(3);
  });
});

describe("vart ett namn leder", () => {
  it("till tidrapporten med löneunderlaget", () => {
    expect(personHref("p1", true)).toBe("/admin/tidrapport?anstalld=p1");
  });

  it("till stämplingarna utan det", () => {
    expect(personHref("p1", false)).toBe("/admin/stamplingar?employeeId=p1");
  });
});
