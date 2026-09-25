import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany, ReadOnlyError } from "@/lib/tenant";

/**
 * LÄSLÄGET I DATABASLAGRET.
 *
 * Supportbesök får läsa allt och ändra ingenting, och spärren ligger här och
 * inte i gränssnittet. Skälet: en gömd knapp är ingen spärr, och den som
 * skriver en ny adminsida ska inte kunna öppna ett hål genom att glömma en
 * kontroll.
 *
 * Det som måste hålla:
 *   1. Varje skrivande operation avvisas, på varje modell.
 *   2. Läsningar fungerar precis som förut — annars vore läget oanvändbart.
 *   3. Den vanliga klienten påverkas INTE. Ett läsläge som läcker ut i kundens
 *      egen session skulle göra panelen obrukbar för dem.
 */

let companyId: string;
let employeeId: string;

beforeEach(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Lasläge ${Math.random().toString(36).slice(2, 8)}` },
  });
  companyId = company.id;

  employeeId = (
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna Andersson" },
    })
  ).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Lasläge " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

const ro = () => forCompany(companyId, { readOnly: true });

describe("skrivningar avvisas", () => {
  it("create", async () => {
    await expect(
      ro().employee.create({ data: { companyId, name: "Bosse Bok" } })
    ).rejects.toThrow(ReadOnlyError);
  });

  it("update", async () => {
    await expect(
      ro().employee.update({
        where: { id: employeeId },
        data: { name: "Ändrad" },
      })
    ).rejects.toThrow(ReadOnlyError);
  });

  it("updateMany", async () => {
    await expect(
      ro().employee.updateMany({ data: { active: false } })
    ).rejects.toThrow(ReadOnlyError);
  });

  it("delete", async () => {
    await expect(
      ro().employee.delete({ where: { id: employeeId } })
    ).rejects.toThrow(ReadOnlyError);
  });

  it("deleteMany", async () => {
    await expect(ro().employee.deleteMany({})).rejects.toThrow(ReadOnlyError);
  });

  it("upsert", async () => {
    await expect(
      ro().employee.upsert({
        where: { id: employeeId },
        create: { companyId, name: "Ny" },
        update: { name: "Ändrad" },
      })
    ).rejects.toThrow(ReadOnlyError);
  });

  it("createMany", async () => {
    await expect(
      ro().employee.createMany({ data: [{ companyId, name: "Bosse Bok" }] })
    ).rejects.toThrow(ReadOnlyError);
  });

  it("också på modeller som inte är tenant-filtrerade", async () => {
    // Company står utanför TENANT_SCOPED_MODELS eftersom den ÄR tenanten. Den
    // ska ändå inte gå att ändra av en supportsession — spärren prövas före
    // filtreringen, just för att täcka det här.
    await expect(
      ro().company.update({ where: { id: companyId }, data: { name: "Nytt" } })
    ).rejects.toThrow(ReadOnlyError);
  });

  it("ingenting ändras i databasen när ett försök avvisas", async () => {
    await expect(
      ro().employee.update({
        where: { id: employeeId },
        data: { name: "Ändrad" },
      })
    ).rejects.toThrow();

    const row = await unsafeGlobalPrisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
    });

    expect(row.name).toBe("Anna Andersson");
  });
});

describe("läsningar fungerar som förut", () => {
  it("findMany", async () => {
    const rows = await ro().employee.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Anna Andersson");
  });

  it("findUnique", async () => {
    const row = await ro().employee.findUnique({ where: { id: employeeId } });

    expect(row?.name).toBe("Anna Andersson");
  });

  it("count", async () => {
    expect(await ro().employee.count()).toBe(1);
  });

  it("företagsfiltret gäller fortfarande", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Lasläge annat företag" },
    });
    await unsafeGlobalPrisma.employee.create({
      data: { companyId: other.id, name: "Erik Ek" },
    });

    // Läsläget ersätter inte isoleringen, det läggs ovanpå.
    const rows = await ro().employee.findMany();

    expect(rows.map((row) => row.name)).toEqual(["Anna Andersson"]);
  });
});

describe("den vanliga klienten påverkas inte", () => {
  it("skrivningar går igenom utan readOnly", async () => {
    const created = await forCompany(companyId).employee.create({
      data: { companyId, name: "Bosse Bok" },
    });

    expect(created.name).toBe("Bosse Bok");
  });

  it("readOnly: false är samma sak som att utelämna det", async () => {
    const created = await forCompany(companyId, { readOnly: false }).employee.create(
      { data: { companyId, name: "Carina Cederlund" } }
    );

    expect(created.name).toBe("Carina Cederlund");
  });

  it("klienten säger själv om den är låst", async () => {
    // Bra vid felsökning: "varför sparas inget" ska gå att besvara på en rad.
    expect(ro().$readOnly).toBe(true);
    expect(forCompany(companyId).$readOnly).toBe(false);
  });
});
