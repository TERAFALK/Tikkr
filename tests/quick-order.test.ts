import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  createQuickOrder,
  pickableCustomers,
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
let teltek: string;
let annanKund: string;

beforeAll(async () => {
  companyId = (
    await unsafeGlobalPrisma.company.create({ data: { name: "Snabbtest AB" } })
  ).id;
  otherCompanyId = (
    await unsafeGlobalPrisma.company.create({ data: { name: "Grannen AB" } })
  ).id;

  teltek = (
    await unsafeGlobalPrisma.customer.create({
      data: { companyId, name: "Teltek" },
    })
  ).id;
  annanKund = (
    await unsafeGlobalPrisma.customer.create({
      data: { companyId, name: "Någon annan" },
    })
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
      customerId: teltek,
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
      data: { companyId, orderNumber: "36401", customerId: teltek },
    });

    const second = await createQuickOrder(companyId, {
      orderNumber: "36401",
      customerId: annanKund,
    });

    expect(second.id).toBe(first.id);
    // Kunden på den befintliga ordern rörs INTE. Kontoret kan ha rättat den,
    // och en skärm ska inte skriva över det.
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

  it("fyller i kunden när ordern saknar en", async () => {
    // Ny uppgift, inte en ändrad. Ordern flaggas som snabbjobb igen så att
    // kontoret tittar på den.
    const existing = await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "36401" },
    });

    const order = await createQuickOrder(companyId, {
      orderNumber: "36401",
      customerId: teltek,
    });

    expect(order.id).toBe(existing.id);
    expect(order.customerName).toBe("Teltek");

    const saved = await unsafeGlobalPrisma.order.findUniqueOrThrow({
      where: { id: existing.id },
    });
    expect(saved.isQuickJob).toBe(true);
  });

  it("en okänd kund ger ingen kund, inte ett fel", async () => {
    // Stämplingen ska gå igenom ändå. Arbetstid som inte registreras går inte
    // att rekonstruera; en saknad kund fyller kontoret i.
    const order = await createQuickOrder(companyId, {
      orderNumber: "36401",
      customerId: "finns-inte",
    });

    expect(order.customerName).toBeNull();
  });

  it("en annan kunds kundregister går inte att peka på", async () => {
    const grannens = await unsafeGlobalPrisma.customer.create({
      data: { companyId: otherCompanyId, name: "Grannens kund" },
    });

    const order = await createQuickOrder(companyId, {
      orderNumber: "36401",
      customerId: grannens.id,
    });

    expect(order.customerName).toBeNull();
  });
});

describe("skapa utan nummer", () => {
  it("hittar på ett märkt nummer", async () => {
    const order = await createQuickOrder(companyId, { customerId: teltek });

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

describe("kunderna till rutnätet", () => {
  it("kommer ur registret, inte ur ordrarnas historik", async () => {
    // Före registret plockades namnen ur de senaste ordrarna och dedupades på
    // trimmad text. En kund utan ordrar fanns då inte att välja.
    const names = (await pickableCustomers(forCompany(companyId))).map(
      (customer) => customer.name
    );

    expect(names).toEqual(["Någon annan", "Teltek"]);
  });

  it("utelämnar avaktiverade kunder", async () => {
    await unsafeGlobalPrisma.customer.update({
      where: { id: annanKund },
      data: { active: false },
    });

    const names = (await pickableCustomers(forCompany(companyId))).map(
      (customer) => customer.name
    );

    expect(names).toEqual(["Teltek"]);

    await unsafeGlobalPrisma.customer.update({
      where: { id: annanKund },
      data: { active: true },
    });
  });

  it("ser inte ett annat företags kunder", async () => {
    await unsafeGlobalPrisma.customer.create({
      data: { companyId: otherCompanyId, name: "Grannens kund" },
    });

    expect(await pickableCustomers(forCompany(otherCompanyId))).toHaveLength(1);
    const names = (await pickableCustomers(forCompany(companyId))).map(
      (customer) => customer.name
    );
    expect(names).not.toContain("Grannens kund");
  });
});
