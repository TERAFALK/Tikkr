import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import {
  clean,
  customerOptions,
  resolveCustomerId,
  searchCustomers,
} from "@/lib/customers";

/**
 * Kundregistret.
 *
 * Ersatte fritextfältet på ordern. Det som måste hålla är just det som gjorde
 * fritexten oanvändbar: att "volvo" hittar "Volvo Lastvagnar", att två
 * stavningar av samma namn inte blir två kunder, och att en kund aldrig når
 * ett annat företag.
 */

let companyId: string;
let otherCompanyId: string;
let volvo: string;

beforeEach(async () => {
  const unique = Math.random().toString(36).slice(2, 8);

  const [company, other] = await Promise.all([
    unsafeGlobalPrisma.company.create({
      data: { name: `Kundtest ${unique}` },
    }),
    unsafeGlobalPrisma.company.create({
      data: { name: `Kundtest grannen ${unique}` },
    }),
  ]);

  companyId = company.id;
  otherCompanyId = other.id;

  volvo = (
    await unsafeGlobalPrisma.customer.create({
      data: {
        companyId,
        name: "Volvo Lastvagnar",
        customerNumber: "1001",
        orgNumber: "556013-9700",
        city: "Göteborg",
      },
    })
  ).id;

  await unsafeGlobalPrisma.customer.create({
    data: { companyId, name: "Teltek AB", customerNumber: "1002" },
  });
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Kundtest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

const db = () => forCompany(companyId);

describe("städning av inskrivna värden", () => {
  it("trimmar och slår ihop mellanslag", () => {
    // "Volvo  AB " och "Volvo AB" ska aldrig kunna bli två kunder på grund av
    // ett tangentbord.
    expect(clean("  Volvo   AB  ")).toBe("Volvo AB");
  });

  it("tomt blir null, inte tom sträng", () => {
    expect(clean("   ")).toBeNull();
    expect(clean(null)).toBeNull();
  });
});

describe("sökning", () => {
  it("tom sökning ger hela registret", async () => {
    const found = await searchCustomers(db(), undefined);

    expect(found.map((customer) => customer.name)).toEqual([
      "Teltek AB",
      "Volvo Lastvagnar",
    ]);
  });

  it("hittar på del av namnet, oavsett skiftläge", async () => {
    // Själva skälet till registret: den som skriver "volvo" ska hitta
    // "Volvo Lastvagnar".
    const found = await searchCustomers(db(), "volvo");

    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("Volvo Lastvagnar");
  });

  it("hittar på kundnummer", async () => {
    const found = await searchCustomers(db(), "1002");

    expect(found.map((customer) => customer.name)).toEqual(["Teltek AB"]);
  });

  it("hittar på organisationsnummer", async () => {
    const found = await searchCustomers(db(), "556013");

    expect(found.map((customer) => customer.name)).toEqual([
      "Volvo Lastvagnar",
    ]);
  });

  it("ingen träff ger tom lista, inte ett fel", async () => {
    expect(await searchCustomers(db(), "finns inte")).toEqual([]);
  });

  it("räknar kundens ordrar", async () => {
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2601", customerId: volvo },
    });

    const found = await searchCustomers(db(), "volvo");

    expect(found[0].orders).toBe(1);
  });

  it("ser inte ett annat företags kunder", async () => {
    await unsafeGlobalPrisma.customer.create({
      data: { companyId: otherCompanyId, name: "Volvo Personvagnar" },
    });

    const found = await searchCustomers(db(), "volvo");

    expect(found.map((customer) => customer.name)).toEqual([
      "Volvo Lastvagnar",
    ]);
  });
});

describe("kunderna som går att välja", () => {
  it("utelämnar avaktiverade", async () => {
    await unsafeGlobalPrisma.customer.update({
      where: { id: volvo },
      data: { active: false },
    });

    const options = await customerOptions(db());

    expect(options.map((option) => option.label)).toEqual(["Teltek AB"]);
  });

  it("bär kundnumret, så att det går att söka på", async () => {
    const options = await customerOptions(db());

    expect(options.find((option) => option.label === "Teltek AB")?.hint).toBe(
      "1002"
    );
  });
});

describe("id ur ett formulär", () => {
  it("slår upp kunden", async () => {
    expect(await resolveCustomerId(db(), volvo)).toBe(volvo);
  });

  it("tomt ger null", async () => {
    expect(await resolveCustomerId(db(), "")).toBeNull();
    expect(await resolveCustomerId(db(), null)).toBeNull();
  });

  it("okänt id ger null, inte ett fel", async () => {
    expect(await resolveCustomerId(db(), "finns-inte")).toBeNull();
  });

  it("en annan kunds id går inte att peka på", async () => {
    // Id:t kommer från ett formulär. Filtreringslagret hindrar att raden nås,
    // och här kontrolleras att svaret blir null i stället för ett kast.
    const grannens = await unsafeGlobalPrisma.customer.create({
      data: { companyId: otherCompanyId, name: "Grannens kund" },
    });

    expect(await resolveCustomerId(db(), grannens.id)).toBeNull();
  });

  it("avaktiverad kund går att välja i panelen", async () => {
    // Till skillnad från i kiosken. Admin rättar ibland en gammal order, och
    // då är kunden den som gällde då.
    await unsafeGlobalPrisma.customer.update({
      where: { id: volvo },
      data: { active: false },
    });

    expect(await resolveCustomerId(db(), volvo)).toBe(volvo);
  });
});

describe("en kund med ordrar går inte att radera", () => {
  it("databasen vägrar", async () => {
    await unsafeGlobalPrisma.order.create({
      data: { companyId, orderNumber: "2601", customerId: volvo },
    });

    // onDelete: Restrict. Underlaget får inte försvinna under händerna på
    // någon — kunden stängs av i stället.
    await expect(
      unsafeGlobalPrisma.customer.delete({ where: { id: volvo } })
    ).rejects.toThrow();
  });

  it("en kund utan ordrar går att radera", async () => {
    await expect(
      unsafeGlobalPrisma.customer.delete({ where: { id: volvo } })
    ).resolves.toBeTruthy();
  });
});
