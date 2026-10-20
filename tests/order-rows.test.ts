import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { orderRows } from "@/lib/orders";

/**
 * ORDRARNAS TID MOT BERÄKNINGEN, FÖR ETT URVAL.
 *
 * Översikten hämtar bara de ordrar som är i arbete (`ids`), och ska visa
 * exakt samma tid och beräknade tid som orderlistan gör för samma order. Två
 * sidor som visar olika tal för order 2601 är två sidor ingen litar på.
 */

let companyId: string;
let orderA: string;
let orderB: string;

beforeAll(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: "Orderradtest AB" },
  });
  companyId = company.id;

  const anna = await unsafeGlobalPrisma.employee.create({
    data: { companyId, name: "Anna" },
  });
  const svetsning = await unsafeGlobalPrisma.workMoment.create({
    data: { companyId, name: "Svetsning" },
  });

  orderA = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "7001" },
    })
  ).id;
  orderB = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "7002" },
    })
  ).id;

  await unsafeGlobalPrisma.orderBudget.create({
    data: { companyId, orderId: orderA, momentId: svetsning.id, minutes: 180 },
  });

  // 2 + 1,5 timmar på 7001, 1 timme på 7002.
  for (const [orderId, from, to] of [
    [orderA, "2026-10-19T06:00:00Z", "2026-10-19T08:00:00Z"],
    [orderA, "2026-10-20T06:00:00Z", "2026-10-20T07:30:00Z"],
    [orderB, "2026-10-20T08:00:00Z", "2026-10-20T09:00:00Z"],
  ] as const) {
    await unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId: anna.id,
        orderId,
        momentId: svetsning.id,
        clockInAt: new Date(from),
        clockOutAt: new Date(to),
      },
    });
  }
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });
  await unsafeGlobalPrisma.$disconnect();
});

describe("orderRows med ids", () => {
  it("ger bara de ordrar som bes om", async () => {
    const rows = await orderRows(forCompany(companyId), { ids: [orderA] });

    expect(rows.map((row) => row.orderNumber)).toEqual(["7001"]);
  });

  it("räknar samma tid och beräknade tid som hela listan", async () => {
    const db = forCompany(companyId);
    const [some] = await orderRows(db, { ids: [orderA] });
    const all = await orderRows(db);
    const same = all.find((row) => row.id === orderA);

    expect(some.minutes).toBe(3.5 * 60);
    expect(some.budgetMinutes).toBe(180);
    expect(some).toEqual(same);
  });

  it("en tom lista ger inga ordrar, inte alla", async () => {
    expect(await orderRows(forCompany(companyId), { ids: [] })).toEqual([]);
  });
});
