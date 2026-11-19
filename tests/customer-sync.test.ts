import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { ingestRecords } from "@/lib/integrations/ingest";
import { vismaAdministration } from "@/lib/integrations/providers/visma-administration";
import {
  createCustomerFromMapping,
  ignoreMapping,
  linkToExistingCustomer,
  suggestionsForMapping,
  unlinkMapping,
} from "@/lib/integrations/mappings";

/**
 * KUNDER FRÅN ETT EXTERNT SYSTEM IN I TIKKR, med databas.
 *
 * Tre saker som inte får brista: samma post ger aldrig två kunder, en synk
 * skriver aldrig Tikkrs egna fält, och bara organisationsnumret kopplar av
 * sig självt.
 */

const PREFIX = "Kundsynktest ";
const ADMIN = "admin@example.se";
let companyId: string;
let integrationId: string;

const visma = (n: string, over: Record<string, unknown> = {}) => ({
  externalId: n,
  data: { customerNumber: n, name: `Kund ${n} AB`, orgNumber: null, email: null, phone: null, ...over },
});

async function ingest(records: ReturnType<typeof visma>[], id = integrationId, company = companyId) {
  return ingestRecords({
    companyId: company,
    integrationId: id,
    provider: vismaAdministration,
    entity: "customers",
    records,
  });
}

async function setup(settings: object = { companyKey: "Demo AB" }) {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: PREFIX + Math.random().toString(36).slice(2, 8) },
  });
  const integration = await unsafeGlobalPrisma.integration.create({
    data: {
      companyId: company.id,
      provider: "visma-administration",
      connectionType: "GATEWAY",
      settings,
      createdByEmail: ADMIN,
    },
  });
  return { companyId: company.id, integrationId: integration.id };
}

async function mapping(externalId: string) {
  return unsafeGlobalPrisma.integrationMapping.findFirstOrThrow({ where: { integrationId, externalId } });
}

beforeEach(async () => {
  ({ companyId, integrationId } = await setup());
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("automatisk koppling", () => {
  it("samma organisationsnummer kopplas, och källans fält skriver över men aldrig Tikkrs", async () => {
    const existing = await unsafeGlobalPrisma.customer.create({
      data: {
        companyId,
        name: "Gamla namnet",
        orgNumber: "556013-9700",
        email: "gammal@example.se",
        markupPercent: 140,
        discountPercent: 5,
        notes: "Ring före leverans",
      },
    });

    const [result] = await ingest([visma("1001", { orgNumber: "5560139700", email: "ny@example.se", city: "Göteborg" })]);
    expect(result.status).toBe("linked");

    const customer = await unsafeGlobalPrisma.customer.findUniqueOrThrow({ where: { id: existing.id } });
    expect(customer).toMatchObject({
      name: "Kund 1001 AB",
      customerNumber: "1001",
      orgNumber: "5560139700",
      email: "ny@example.se",
      city: "Göteborg",
      markupPercent: 140,
      discountPercent: 5,
      notes: "Ring före leverans",
      active: true,
    });
    expect((await mapping("1001")).customerId).toBe(existing.id);
  });

  it("två Tikkr-kunder med samma organisationsnummer ger inkorgen, inte en gissning", async () => {
    await unsafeGlobalPrisma.customer.createMany({
      data: [
        { companyId, name: "Filial Nord", orgNumber: "5560139700" },
        { companyId, name: "Filial Syd", orgNumber: "556013-9700" },
      ],
    });
    const [result] = await ingest([visma("1001", { orgNumber: "5560139700" })]);
    expect(result).toMatchObject({ status: "pending", message: "org-ambiguous" });
  });

  it("samma namn kopplar inte, det blir ett förslag", async () => {
    const existing = await unsafeGlobalPrisma.customer.create({ data: { companyId, name: "KUND 1001" } });
    const [result] = await ingest([visma("1001")]);
    expect(result).toMatchObject({ status: "pending", message: "suggestions" });

    const m = await mapping("1001");
    expect(m.customerId).toBeNull();
    expect(await suggestionsForMapping(forCompany(companyId), m.id)).toEqual([{ customerId: existing.id, reasons: ["name"] }]);
  });

  it("ingen träff hamnar i inkorgen som standard", async () => {
    const [result] = await ingest([visma("1001")]);
    expect(result).toMatchObject({ status: "pending", message: "no-match" });
    expect(await unsafeGlobalPrisma.customer.count({ where: { companyId } })).toBe(0);
  });
});

describe("nya kunder och idempotens", () => {
  beforeEach(async () => {
    await unsafeGlobalPrisma.integration.update({
      where: { id: integrationId },
      data: { settings: { companyKey: "Demo AB", createCustomers: true } },
    });
  });

  it("samma post tre gånger ger en kund", async () => {
    expect((await ingest([visma("1001")]))[0].status).toBe("created");
    expect((await ingest([visma("1001")]))[0].status).toBe("unchanged");
    expect((await ingest([visma("1001", { name: "Nytt namn AB" })]))[0].status).toBe("updated");

    const customers = await unsafeGlobalPrisma.customer.findMany({ where: { companyId } });
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe("Nytt namn AB");
  });

  it("samma post i två samtidiga batchar ger en kund", async () => {
    const results = await Promise.all([ingest([visma("1001")]), ingest([visma("1001")])]);
    expect(results.flat().map((r) => r.status).sort()).not.toContain("error");
    expect(await unsafeGlobalPrisma.customer.count({ where: { companyId } })).toBe(1);
    expect(await unsafeGlobalPrisma.integrationMapping.count({ where: { integrationId } })).toBe(1);
  });

  it("en ny kund vars nummer redan finns i Tikkr skapas inte", async () => {
    await unsafeGlobalPrisma.customer.create({ data: { companyId, name: "Någon helt annan", customerNumber: "1001" } });
    const [result] = await ingest([visma("1001")]);
    // Kundnumret ger ett förslag, och förslag går före att skapa.
    expect(result).toMatchObject({ status: "pending", message: "suggestions" });
    expect(await unsafeGlobalPrisma.customer.count({ where: { companyId } })).toBe(1);
  });

  it("ett kundnummer som tagits av en annan kund skrivs inte över på den kopplade", async () => {
    await ingest([visma("1001")]);
    await unsafeGlobalPrisma.customer.create({ data: { companyId, name: "Annan", customerNumber: "2002" } });

    const [result] = await ingest([visma("1001", { customerNumber: "2002", name: "Bytt nummer AB" })]);
    expect(result.status).toBe("updated");
    expect(result.message).toContain("2002");

    const linked = await unsafeGlobalPrisma.customer.findFirstOrThrow({ where: { companyId, name: "Bytt nummer AB" } });
    expect(linked.customerNumber).toBe("1001");
  });

  it("en ignorerad post rörs inte när den ändras i källan", async () => {
    await ingest([visma("1001")]);
    const m = await mapping("1001");
    await ignoreMapping(forCompany(companyId), { mappingId: m.id, actorEmail: ADMIN });

    const [result] = await ingest([visma("1001", { name: "Ändrat AB" })]);
    expect(result.status).toBe("ignored");
    const customer = await unsafeGlobalPrisma.customer.findFirstOrThrow({ where: { companyId } });
    expect(customer.name).toBe("Kund 1001 AB");
  });
});

describe("inkorgen", () => {
  it("Koppla till befintlig skriver källans fält och loggar vem", async () => {
    await ingest([visma("1001", { email: "visma@example.se" })]);
    const target = await unsafeGlobalPrisma.customer.create({ data: { companyId, name: "Tikkrs namn", notes: "Egen anteckning" } });
    const m = await mapping("1001");

    expect(await linkToExistingCustomer(forCompany(companyId), { mappingId: m.id, customerId: target.id, actorEmail: ADMIN })).toEqual({ ok: true });

    const customer = await unsafeGlobalPrisma.customer.findUniqueOrThrow({ where: { id: target.id } });
    expect(customer).toMatchObject({ name: "Kund 1001 AB", email: "visma@example.se", notes: "Egen anteckning" });
    expect((await mapping("1001")).status).toBe("LINKED");

    const event = await unsafeGlobalPrisma.integrationEvent.findFirstOrThrow({
      where: { integrationId, message: { contains: "kopplad till" } },
    });
    expect(event.details).toEqual({ actor: ADMIN });
  });

  it("en kund kopplas inte till två poster i samma integration", async () => {
    await ingest([visma("1001"), visma("1002")]);
    const target = await unsafeGlobalPrisma.customer.create({ data: { companyId, name: "Mål" } });
    const db = forCompany(companyId);
    await linkToExistingCustomer(db, { mappingId: (await mapping("1001")).id, customerId: target.id, actorEmail: ADMIN });

    const second = await linkToExistingCustomer(db, { mappingId: (await mapping("1002")).id, customerId: target.id, actorEmail: ADMIN });
    expect(second.ok).toBe(false);
  });

  it("Skapa ny skapar kunden ur källans uppgifter", async () => {
    await ingest([visma("1001", { city: "Borås" })]);
    const result = await createCustomerFromMapping(forCompany(companyId), { mappingId: (await mapping("1001")).id, actorEmail: ADMIN });
    expect(result).toEqual({ ok: true });
    const customer = await unsafeGlobalPrisma.customer.findFirstOrThrow({ where: { companyId } });
    expect(customer).toMatchObject({ name: "Kund 1001 AB", customerNumber: "1001", city: "Borås" });
  });

  it("en loss-kopplad post kopplas inte automatiskt igen, och kunden står kvar", async () => {
    await unsafeGlobalPrisma.customer.create({ data: { companyId, name: "Fel kund", orgNumber: "5560139700" } });
    // Kopplingen skriver källans namn på kunden. Efter loss-kopplingen ska
    // ingenting mer skrivas dit.
    await ingest([visma("1001", { orgNumber: "5560139700" })]);
    expect((await mapping("1001")).status).toBe("LINKED");

    await unlinkMapping(forCompany(companyId), { mappingId: (await mapping("1001")).id, actorEmail: ADMIN });
    const [result] = await ingest([visma("1001", { orgNumber: "5560139700", name: "Ändrat AB" })]);

    expect(result).toMatchObject({ status: "pending", message: "unlinked" });
    expect(await unsafeGlobalPrisma.customer.count({ where: { companyId } })).toBe(1);
    const customer = await unsafeGlobalPrisma.customer.findFirstOrThrow({ where: { companyId } });
    expect(customer.name).toBe("Kund 1001 AB");
  });

  it("en post från ett annat företag finns inte", async () => {
    await ingest([visma("1001")]);
    const other = await setup();
    const result = await ignoreMapping(forCompany(other.companyId), { mappingId: (await mapping("1001")).id, actorEmail: ADMIN });
    expect(result).toEqual({ ok: false, error: "Posten finns inte." });
    expect((await mapping("1001")).status).toBe("PENDING");
  });
});
