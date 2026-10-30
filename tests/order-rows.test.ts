import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { orderMoments, orderRows } from "@/lib/orders";

/**
 * ORDRARNAS TID MOT BERÄKNINGEN, FÖR ETT URVAL.
 *
 * Översikten hämtar bara de ordrar som är i arbete (`ids`), och ska visa
 * exakt samma tid och beräknade tid som orderlistan gör för samma order. Två
 * sidor som visar olika tal för order 2601 är två sidor ingen litar på.
 *
 * Sökningen i orderlistan och tiden per moment på orderns egen sida ligger
 * här av samma skäl: de bygger på samma rader.
 */

let companyId: string;
let otherCompanyId: string;
let orderA: string;
let orderB: string;
let orderC: string;

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
  const lackering = await unsafeGlobalPrisma.workMoment.create({
    data: { companyId, name: "Lackering" },
  });
  const volvo = await unsafeGlobalPrisma.customer.create({
    data: { companyId, name: "Volvo Lastvagnar", customerNumber: "K-42" },
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
  orderC = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "AB-8100", customerId: volvo.id },
    })
  ).id;

  // Samma ordernummer och kundnamn hos ett annat företag.
  const other = await unsafeGlobalPrisma.company.create({
    data: { name: "Orderradtest Annan AB" },
  });
  otherCompanyId = other.id;
  const otherVolvo = await unsafeGlobalPrisma.customer.create({
    data: { companyId: otherCompanyId, name: "Volvo Lastvagnar" },
  });
  await unsafeGlobalPrisma.order.create({
    data: {
      companyId: otherCompanyId,
      orderNumber: "AB-8100",
      customerId: otherVolvo.id,
    },
  });

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

  // En halvtimme på ett moment som inte fått någon beräkning.
  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId,
      employeeId: anna.id,
      orderId: orderA,
      momentId: lackering.id,
      clockInAt: new Date("2026-10-20T08:00:00Z"),
      clockOutAt: new Date("2026-10-20T08:30:00Z"),
    },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });
  await unsafeGlobalPrisma.company.delete({ where: { id: otherCompanyId } });
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

    expect(some.minutes).toBe(4 * 60);
    expect(some.budgetMinutes).toBe(180);
    expect(some).toEqual(same);
  });

  it("en tom lista ger inga ordrar, inte alla", async () => {
    expect(await orderRows(forCompany(companyId), { ids: [] })).toEqual([]);
  });

  it("en annan kunds order ger ingen rad", async () => {
    const rows = await orderRows(forCompany(otherCompanyId), { ids: [orderA] });

    expect(rows).toEqual([]);
  });
});

describe("sökningen i orderlistan", () => {
  async function search(query: string): Promise<string[]> {
    const rows = await orderRows(forCompany(companyId), { query });
    return rows.map((row) => row.orderNumber);
  }

  it("hittar del av ordernumret", async () => {
    expect(await search("700")).toEqual(["7001", "7002"]);
  });

  it("bryr sig inte om skiftläge", async () => {
    expect(await search("ab-81")).toEqual(["AB-8100"]);
  });

  it("hittar ordern på kundens namn och kundnummer", async () => {
    expect(await search("volvo")).toEqual(["AB-8100"]);
    expect(await search("k-42")).toEqual(["AB-8100"]);
  });

  it("tom sökning ger alla, även bara mellanslag", async () => {
    expect(await search("")).toHaveLength(3);
    expect(await search("   ")).toHaveLength(3);
  });

  it("når aldrig ett annat företags ordrar", async () => {
    const rows = await orderRows(forCompany(companyId), { query: "volvo" });

    expect(rows.map((row) => row.id)).toEqual([orderC]);
  });
});

describe("tiden per arbetsmoment på en order", () => {
  it("visar även moment utan beräkning, efter de beräknade", async () => {
    const db = forCompany(companyId);
    const [order] = await orderRows(db, { ids: [orderA] });

    expect(await orderMoments(db, order)).toMatchObject([
      { momentName: "Svetsning", minutes: 3.5 * 60, budgetMinutes: 180 },
      { momentName: "Lackering", minutes: 30, budgetMinutes: null },
    ]);
  });

  it("summan av raderna är orderns tid", async () => {
    const db = forCompany(companyId);
    const [order] = await orderRows(db, { ids: [orderA] });
    const rows = await orderMoments(db, order);

    expect(rows.reduce((total, row) => total + row.minutes, 0)).toBe(
      order.minutes
    );
  });

  it("en order utan tid har inga rader", async () => {
    const db = forCompany(companyId);
    const [order] = await orderRows(db, { ids: [orderC] });

    expect(await orderMoments(db, order)).toEqual([]);
  });
});
