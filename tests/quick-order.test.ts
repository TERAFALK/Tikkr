import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  createQuickOrder,
  recentCustomerNames,
  QuickOrderError,
} from "@/lib/quick-order";

/**
 * Snabbjobb — ordrar som verkstaden lägger upp själv.
 *
 * Finns för att arbetet ibland börjar innan kontoret hunnit lägga upp ordern.
 * Utan utvägen stämplar folk på fel order eller inte alls, och den timmen går
 * inte att rekonstruera i efterhand.
 */

let companyId: string;
let otherCompanyId: string;

beforeAll(async () => {
  companyId = (
    await unsafeGlobalPrisma.company.create({ data: { name: "Snabbtest AB" } })
  ).id;
  otherCompanyId = (
    await unsafeGlobalPrisma.company.create({ data: { name: "Grannen AB" } })
  ).id;
});

beforeEach(async () => {
  await unsafeGlobalPrisma.order.deleteMany({
    where: { companyId: { in: [companyId, otherCompanyId] } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { id: { in: [companyId, otherCompanyId] } },
  });
  await unsafeGlobalPrisma.$disconnect();
});

describe("skapa med ett inslaget nummer", () => {
  it("lägger upp ordern och märker den", async () => {
    const order = await createQuickOrder(companyId, {
      orderNumber: "36401",
      customerName: "Teltek",
    });

    expect(order.orderNumber).toBe("36401");
    expect(order.customerName).toBe("Teltek");

    const saved = await unsafeGlobalPrisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(saved.isQuickJob).toBe(true);
    expect(saved.status).toBe("OPEN");
  });

  it("returnerar den befintliga ordern i stället för en dubblett", async () => {
    // Två personer kan slå in samma nummer inom samma minut. Den andra ska
    // stämpla på samma order som den första, inte få ett fel.
    const first = await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "36401", customerName: "Teltek" },
    });

    const second = await createQuickOrder(companyId, {
      orderNumber: "36401",
      customerName: "Någon annan",
    });

    expect(second.id).toBe(first.id);
    expect(second.customerName).toBe("Teltek");

    expect(
      await unsafeGlobalPrisma.order.count({ where: { companyId } })
    ).toBe(1);
  });

  it("rör inte flaggan på en order admin redan lagt upp", async () => {
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "36401" },
    });

    const order = await createQuickOrder(companyId, { orderNumber: "36401" });
    const saved = await unsafeGlobalPrisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });

    expect(saved.isQuickJob).toBe(false);
  });

  it("vägrar en avslutad order", async () => {
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "36401", status: "CLOSED" },
    });

    await expect(
      createQuickOrder(companyId, { orderNumber: "36401" })
    ).rejects.toThrow(QuickOrderError);
  });

  it("tomt kundnamn blir null, inte tom sträng", async () => {
    const order = await createQuickOrder(companyId, {
      orderNumber: "36401",
      customerName: "   ",
    });

    expect(order.customerName).toBeNull();
  });
});

describe("skapa utan nummer", () => {
  it("hittar på ett märkt nummer", async () => {
    const order = await createQuickOrder(companyId, { customerName: "Teltek" });

    expect(order.orderNumber).toBe("SNABB-1");
  });

  it("räknar uppåt för varje nytt", async () => {
    const first = await createQuickOrder(companyId, {});
    const second = await createQuickOrder(companyId, {});
    const third = await createQuickOrder(companyId, {});

    expect([first.orderNumber, second.orderNumber, third.orderNumber]).toEqual([
      "SNABB-1",
      "SNABB-2",
      "SNABB-3",
    ]);
  });

  it("hoppar över ett nummer som redan är taget", async () => {
    // Kan hända om admin döpt om en order till SNABB-2 för hand.
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "SNABB-1" },
    });

    const order = await createQuickOrder(companyId, {});
    expect(order.orderNumber).toBe("SNABB-2");
  });

  it("går att skapa utan både nummer och kund", async () => {
    // Den som inte vet ska inte stå fast vid skärmen. Ordern flaggas ändå.
    const order = await createQuickOrder(companyId, {});

    expect(order.customerName).toBeNull();
    expect(order.orderNumber).toMatch(/^SNABB-/);
  });
});

describe("isolering mellan företag", () => {
  it("ett annat företags ordernummer krockar inte", async () => {
    await createQuickOrder(otherCompanyId, { orderNumber: "36401" });
    const order = await createQuickOrder(companyId, { orderNumber: "36401" });

    // Samma nummer, två olika ordrar. Ordernummer är unikt PER företag.
    const grannens = await unsafeGlobalPrisma.order.findFirstOrThrow({
      where: { companyId: otherCompanyId, orderNumber: "36401" },
    });

    expect(order.id).not.toBe(grannens.id);
  });

  it("numreringen räknas per företag", async () => {
    await createQuickOrder(otherCompanyId, {});
    await createQuickOrder(otherCompanyId, {});

    const order = await createQuickOrder(companyId, {});
    expect(order.orderNumber).toBe("SNABB-1");
  });
});

describe("kundnamnen till rutnätet", () => {
  it("ger varje namn en gång, utan dubbletter", async () => {
    for (const [orderNumber, customerName] of [
      ["1", "Volvo"],
      ["2", "Teltek"],
      ["3", "Volvo"],
    ]) {
      await unsafeGlobalPrisma.order.create({
        data: { companyId, orderNumber, customerName },
      });
    }

    const names = await recentCustomerNames(forCompany(companyId));

    expect(names).toHaveLength(2);
    expect(new Set(names)).toEqual(new Set(["Volvo", "Teltek"]));
  });

  it("hoppar över ordrar utan kund", async () => {
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "1" },
    });
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2", customerName: "Teltek" },
    });

    expect(await recentCustomerNames(forCompany(companyId))).toEqual(["Teltek"]);
  });

  it("ser inte ett annat företags kunder", async () => {
    await unsafeGlobalPrisma.order.create({
      data: {
        companyId: otherCompanyId,
        orderNumber: "1",
        customerName: "Grannens kund",
      },
    });

    expect(await recentCustomerNames(forCompany(companyId))).toEqual([]);
  });
});
