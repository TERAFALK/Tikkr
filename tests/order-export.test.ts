import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { getOrderExports, slugify } from "@/lib/order-export";

/**
 * Underlaget per order.
 *
 * Dokumentet skickas vidare till kundens kund som bilaga till en faktura.
 * Stämmer inte summan blir det ett fakturafel hos någon annan än vår kund,
 * vilket är det värsta stället att ha ett fel på.
 */

let companyId: string;
let orderA: string;
let orderB: string;
let tomOrder: string;

beforeAll(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: "Underlagstest AB" },
  });
  companyId = company.id;

  const anna = await unsafeGlobalPrisma.employee.create({
    data: { companyId, name: "Anna" },
  });
  const bosse = await unsafeGlobalPrisma.employee.create({
    data: { companyId, name: "Bosse" },
  });
  const svets = await unsafeGlobalPrisma.workMoment.create({
    data: { companyId, name: "Svetsning" },
  });
  const montering = await unsafeGlobalPrisma.workMoment.create({
    data: { companyId, name: "Montering" },
  });

  orderA = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "7001", customerName: "Volvo" },
    })
  ).id;
  orderB = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "7002" },
    })
  ).id;
  tomOrder = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "7003", customerName: "Utan tid" },
    })
  ).id;

  const entry = (
    employeeId: string,
    orderId: string,
    momentId: string,
    from: string,
    to: string | null,
    extra: Record<string, unknown> = {}
  ) =>
    unsafeGlobalPrisma.timeEntry.create({
      data: {
        companyId,
        employeeId,
        orderId,
        momentId,
        clockInAt: new Date(from),
        clockOutAt: to ? new Date(to) : null,
        ...extra,
      },
    });

  // Order 7001: 2 + 3 timmar = 5
  await entry(anna.id, orderA, svets.id, "2026-08-03T06:00:00Z", "2026-08-03T08:00:00Z");
  await entry(bosse.id, orderA, montering.id, "2026-08-04T06:00:00Z", "2026-08-04T09:00:00Z");
  // Order 7002: 4 timmar, varav en post flaggad
  await entry(anna.id, orderB, svets.id, "2026-08-05T06:00:00Z", "2026-08-05T10:00:00Z", {
    source: "AUTO_CLOSE",
    needsReview: true,
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });
  await unsafeGlobalPrisma.$disconnect();
});

describe("underlag för en order", () => {
  it("summerar tiden på ordern", async () => {
    const [order] = await getOrderExports(forCompany(companyId), [orderA]);

    expect(order.orderNumber).toBe("7001");
    expect(order.customerName).toBe("Volvo");
    expect(order.rows).toHaveLength(2);
    expect(order.totalMinutes).toBe(5 * 60);
  });

  it("raderna ligger i tidsordning", async () => {
    const [order] = await getOrderExports(forCompany(companyId), [orderA]);

    expect(order.rows[0].employeeName).toBe("Anna");
    expect(order.rows[1].employeeName).toBe("Bosse");
    expect(order.firstEntryAt?.toISOString()).toBe("2026-08-03T06:00:00.000Z");
    expect(order.lastEntryAt?.toISOString()).toBe("2026-08-04T06:00:00.000Z");
  });

  it("markerar poster med gissad sluttid", async () => {
    const [order] = await getOrderExports(forCompany(companyId), [orderB]);

    expect(order.ungradedCount).toBe(1);
    expect(order.rows[0].needsReview).toBe(true);
  });

  it("en order utan tid ger ett tomt men giltigt underlag", async () => {
    const [order] = await getOrderExports(forCompany(companyId), [tomOrder]);

    expect(order.rows).toEqual([]);
    expect(order.totalMinutes).toBe(0);
    expect(order.firstEntryAt).toBeNull();
  });
});

describe("underlag för flera ordrar", () => {
  it("ger en post per order, var för sig", async () => {
    const orders = await getOrderExports(forCompany(companyId), [orderA, orderB]);

    expect(orders).toHaveLength(2);
    // Sorterade på ordernummer, inte på den ordning id:n skickades in.
    expect(orders.map((order) => order.orderNumber)).toEqual(["7001", "7002"]);
    expect(orders[0].totalMinutes).toBe(5 * 60);
    expect(orders[1].totalMinutes).toBe(4 * 60);
  });

  it("tom lista ger tomt resultat istället för fel", async () => {
    expect(await getOrderExports(forCompany(companyId), [])).toEqual([]);
  });

  it("ett annat företags order går inte att hämta", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Underlagstest grannen" },
    });
    const theirOrder = await unsafeGlobalPrisma.order.create({
      data: { companyId: other.id, orderNumber: "9999" },
    });

    const result = await getOrderExports(forCompany(companyId), [theirOrder.id]);
    expect(result).toEqual([]);

    await unsafeGlobalPrisma.company.delete({ where: { id: other.id } });
  });
});

describe("filnamn", () => {
  it("svenska tecken och mellanslag blir filnamnsvänliga", () => {
    expect(slugify("Demo Mekaniska AB")).toBe("demo-mekaniska-ab");
    expect(slugify("Åkes Svets & Smide")).toBe("akes-svets-smide");
    expect(slugify("2601")).toBe("2601");
  });
});

describe("beräknad tid följer med i underlaget", () => {
  it("finns med när en angetts", async () => {
    await unsafeGlobalPrisma.order.update({
      where: { id: orderA },
      data: { budgetMinutes: 40 * 60 },
    });

    const [order] = await getOrderExports(forCompany(companyId), [orderA]);

    expect(order.budgetMinutes).toBe(40 * 60);
  });

  it("är null när ingen angetts", async () => {
    const [order] = await getOrderExports(forCompany(companyId), [orderB]);
    expect(order.budgetMinutes).toBeNull();
  });
});
