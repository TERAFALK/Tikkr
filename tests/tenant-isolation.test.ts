import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany, TenantIsolationError } from "@/lib/tenant";

/**
 * Beviset att kund A aldrig kan se kund B:s data.
 *
 * Vi skapar två låtsasföretag med identiskt utseende data och försöker sedan,
 * på alla sätt vi kan komma på, få det ena företagets klient att röra det
 * andras rader. Varje försök ska misslyckas.
 *
 * Kräver en riktig databas (DATABASE_URL). Kör: npm test
 */

let companyA: string;
let companyB: string;

let employeeA: string;
let employeeB: string;
let orderA: string;
let orderB: string;
let momentA: string;
let momentB: string;

beforeAll(async () => {
  const a = await unsafeGlobalPrisma.company.create({
    data: { name: "Testbolag A" },
  });
  const b = await unsafeGlobalPrisma.company.create({
    data: { name: "Testbolag B" },
  });
  companyA = a.id;
  companyB = b.id;

  // Medvetet samma namn och ordernummer i båda företagen — om filtreringen
  // slarvar är det just här förväxlingen skulle ske.
  employeeA = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId: companyA, name: "Anna Andersson" },
    })
  ).id;
  employeeB = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId: companyB, name: "Anna Andersson" },
    })
  ).id;

  orderA = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId: companyA, orderNumber: "1001", customerName: "Kund A" },
    })
  ).id;
  orderB = (
    await unsafeGlobalPrisma.order.create({
      data: { companyId: companyB, orderNumber: "1001", customerName: "Kund B" },
    })
  ).id;

  momentA = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId: companyA, name: "Svetsning" },
    })
  ).id;
  momentB = (
    await unsafeGlobalPrisma.workMoment.create({
      data: { companyId: companyB, name: "Svetsning" },
    })
  ).id;

  // Bara företag B får en kioskskärm. Används för att bevisa att A:s
  // raderingar inte når den.
  await unsafeGlobalPrisma.kioskDevice.create({
    data: { companyId: companyB, name: "Verkstaden", tokenHash: "hash-for-b" },
  });

  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId: companyA,
      employeeId: employeeA,
      orderId: orderA,
      momentId: momentA,
      clockInAt: new Date(),
    },
  });
  await unsafeGlobalPrisma.timeEntry.create({
    data: {
      companyId: companyB,
      employeeId: employeeB,
      orderId: orderB,
      momentId: momentB,
      clockInAt: new Date(),
    },
  });
});

afterAll(async () => {
  // onDelete: Cascade städar allt underliggande automatiskt.
  await unsafeGlobalPrisma.company.deleteMany({
    where: { id: { in: [companyA, companyB] } },
  });
  await unsafeGlobalPrisma.$disconnect();
});

describe("läsning kan inte nå ett annat företag", () => {
  it("findMany ger bara det egna företagets rader", async () => {
    const db = forCompany(companyA);
    const employees = await db.employee.findMany();

    expect(employees).toHaveLength(1);
    expect(employees[0].id).toBe(employeeA);
    expect(employees.every((e) => e.companyId === companyA)).toBe(true);
  });

  it("findUnique på ett annat företags id ger null, inte raden", async () => {
    const db = forCompany(companyA);
    // employeeB:s id är helt korrekt och existerar. Utan filtrering skulle
    // den här frågan lämna tillbaka kund B:s anställda.
    const stolen = await db.employee.findUnique({ where: { id: employeeB } });

    expect(stolen).toBeNull();
  });

  it("att uttryckligen fråga efter ett annat företag ger ett fel", async () => {
    const db = forCompany(companyA);

    // Systemet skulle kunna byta ut företags-id:t tyst och returnera kund A:s
    // data istället. Det vore säkert men dolde buggen. Vi vill höra av oss.
    await expect(
      db.employee.findFirst({ where: { companyId: companyB } })
    ).rejects.toThrow(TenantIsolationError);
  });

  it("att ange sitt EGET företag är tillåtet — det ändrar ingenting", async () => {
    const db = forCompany(companyA);
    const found = await db.employee.findFirst({ where: { companyId: companyA } });

    expect(found?.id).toBe(employeeA);
  });

  it("count räknar bara det egna företaget", async () => {
    expect(await forCompany(companyA).order.count()).toBe(1);
    expect(await forCompany(companyB).order.count()).toBe(1);
    expect(await unsafeGlobalPrisma.order.count({
      where: { companyId: { in: [companyA, companyB] } },
    })).toBe(2);
  });

  it("stämplingar läcker inte mellan företag", async () => {
    const entries = await forCompany(companyA).timeEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0].companyId).toBe(companyA);
  });
});

describe("skrivning hamnar alltid i rätt företag", () => {
  it("create stämplar på rätt companyId automatiskt", async () => {
    const created = await forCompany(companyA).workMoment.create({
      data: { name: "Kantpressning" },
    });

    expect(created.companyId).toBe(companyA);
    await forCompany(companyA).workMoment.delete({ where: { id: created.id } });
  });

  it("create kan inte tvinga in data hos ett annat företag", async () => {
    await expect(
      // Försök att smuggla in raden hos kund B.
      forCompany(companyA).workMoment.create({
        data: { name: "Målning", companyId: companyB },
      })
    ).rejects.toThrow(TenantIsolationError);

    const leaked = await unsafeGlobalPrisma.workMoment.count({
      where: { companyId: companyB, name: "Målning" },
    });
    expect(leaked).toBe(0);
  });

  it("update når inte ett annat företags rad", async () => {
    const db = forCompany(companyA);

    await expect(
      db.employee.update({
        where: { id: employeeB },
        data: { name: "Kapad" },
      })
    ).rejects.toThrow();

    const untouched = await unsafeGlobalPrisma.employee.findUnique({
      where: { id: employeeB },
    });
    expect(untouched?.name).toBe("Anna Andersson");
  });

  it("updateMany rör inga rader hos ett annat företag", async () => {
    const result = await forCompany(companyA).employee.updateMany({
      data: { active: false },
    });

    expect(result.count).toBe(1);

    const b = await unsafeGlobalPrisma.employee.findUnique({
      where: { id: employeeB },
    });
    expect(b?.active).toBe(true);

    await forCompany(companyA).employee.updateMany({ data: { active: true } });
  });

  it("deleteMany kan inte radera ett annat företags data", async () => {
    // Bara företag B har en kioskskärm. Företag A försöker radera "alla"
    // kioskskärmar — vilket för A:s del är noll stycken.
    const result = await forCompany(companyA).kioskDevice.deleteMany();
    expect(result.count).toBe(0);

    const bStillThere = await unsafeGlobalPrisma.kioskDevice.count({
      where: { companyId: companyB },
    });
    expect(bStillThere).toBe(1);
  });
});

describe("kringgående vägar är stängda", () => {
  it("klienten vet vilket företag den är låst till", () => {
    expect(forCompany(companyA).$companyId).toBe(companyA);
  });

  it("forCompany utan companyId vägrar skapa en klient", () => {
    expect(() => forCompany("")).toThrow(TenantIsolationError);
    // @ts-expect-error — testar vad som händer vid felaktig användning
    expect(() => forCompany(undefined)).toThrow(TenantIsolationError);
  });
});
