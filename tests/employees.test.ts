import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { initialsOf } from "@/components/ui/EmployeeAvatar";

/**
 * Anställda.
 *
 * Namnet är avsiktligt inte unikt — två personer på ett företag kan heta lika,
 * och att tvinga fram ett påhittat särskiljande namn vore att lösa ett
 * datorproblem med människors namn. Anställningsnumret finns för att skilja dem
 * åt, och det ÄR unikt per företag.
 */

let companyId: string;
let unique: string;

beforeEach(async () => {
  unique = Math.random().toString(36).slice(2, 10);

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Anstalldtest ${unique}` },
  });

  companyId = company.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Anstalldtest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("anställningsnummer", () => {
  it("två personer kan heta lika", async () => {
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anders Andersson", employeeNumber: "1" },
    });

    await expect(
      unsafeGlobalPrisma.employee.create({
        data: { companyId, name: "Anders Andersson", employeeNumber: "2" },
      })
    ).resolves.toBeDefined();
  });

  it("samma nummer två gånger avvisas", async () => {
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna", employeeNumber: "1042" },
    });

    await expect(
      unsafeGlobalPrisma.employee.create({
        data: { companyId, name: "Björn", employeeNumber: "1042" },
      })
    ).rejects.toThrow();
  });

  it("flera personer utan nummer är tillåtet", async () => {
    // Tomma värden räknas inte som dubbletter. Numret är frivilligt, och ett
    // krav på det hade tvingat varje kund att hitta på ett register.
    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna" },
    });

    await expect(
      unsafeGlobalPrisma.employee.create({
        data: { companyId, name: "Björn" },
      })
    ).resolves.toBeDefined();
  });

  it("samma nummer hos två olika företag krockar inte", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: `Anstalldtest andra ${unique}` },
    });

    await unsafeGlobalPrisma.employee.create({
      data: { companyId, name: "Anna", employeeNumber: "1" },
    });

    await expect(
      unsafeGlobalPrisma.employee.create({
        data: { companyId: other.id, name: "Carina", employeeNumber: "1" },
      })
    ).resolves.toBeDefined();
  });
});

/**
 * Initialerna som visas när ett porträtt saknas.
 *
 * De ska skilja personer åt. En generisk siluett för alla utan foto hade gjort
 * halva rutnätet identiskt, vilket är sämre än inget alls — namnet står ju
 * bredvid.
 */
describe("initialer ur ett namn", () => {
  it("tar förnamnets och efternamnets första bokstav", () => {
    expect(initialsOf("Anna Andersson")).toBe("AA");
    expect(initialsOf("Björn Bergqvist")).toBe("BB");
  });

  it("ett ensamt namn ger en bokstav", () => {
    expect(initialsOf("Kalle")).toBe("K");
  });

  it("mellannamn hoppas över", () => {
    expect(initialsOf("Anna Maria Andersson")).toBe("AA");
  });

  it("extra mellanslag stör inte", () => {
    expect(initialsOf("  Erik   Ek  ")).toBe("EE");
  });

  it("svenska tecken versaliseras rätt", () => {
    expect(initialsOf("Åke Öberg")).toBe("ÅÖ");
  });

  it("tomt namn ger ett frågetecken i stället för en tom ruta", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});
