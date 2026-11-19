import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { ingestRecords } from "@/lib/integrations/ingest";
import { vismaAdministration } from "@/lib/integrations/providers/visma-administration";
import { ignoreMapping, linkToExistingCustomer, linkToExistingOrder } from "@/lib/integrations/mappings";

/**
 * ORDRAR FRÅN ETT EXTERNT SYSTEM, med databas.
 *
 * En order kopplas till kund via kundens koppling. Saknar kunden koppling
 * väntar ordern och släpps när kunden kopplas. En kopplad order stängs aldrig
 * av en synk.
 */

const PREFIX = "Ordersynktest ";
const ADMIN = "admin@example.se";
let companyId: string;
let integrationId: string;

const customer = (n: string, over: Record<string, unknown> = {}) => ({
  externalId: n,
  data: { customerNumber: n, name: `Kund ${n} AB`, ...over },
});

const order = (n: string, customerNumber: string | null, status = "open") => ({
  externalId: n,
  data: { orderNumber: n, customerNumber, status },
});

async function ingest(entity: "customers" | "orders", records: { externalId: string; data: Record<string, unknown> }[]) {
  return ingestRecords({ companyId, integrationId, provider: vismaAdministration, entity, records });
}

async function mapping(entityType: "CUSTOMER" | "ORDER", externalId: string) {
  return unsafeGlobalPrisma.integrationMapping.findFirst({ where: { integrationId, entityType, externalId } });
}

beforeEach(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: PREFIX + Math.random().toString(36).slice(2, 8) },
  });
  companyId = company.id;
  const integration = await unsafeGlobalPrisma.integration.create({
    data: {
      companyId,
      provider: "visma-administration",
      connectionType: "GATEWAY",
      settings: { companyKey: "Demo AB", createCustomers: true },
      createdByEmail: ADMIN,
    },
  });
  integrationId = integration.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("ordrar", () => {
  it("en öppen order med kopplad kund skapas på kunden, en gång", async () => {
    await ingest("customers", [customer("100")]);
    expect((await ingest("orders", [order("5001", "100")]))[0].status).toBe("created");
    expect((await ingest("orders", [order("5001", "100")]))[0].status).toBe("unchanged");

    const orders = await unsafeGlobalPrisma.order.findMany({ where: { companyId }, include: { customer: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ orderNumber: "5001", status: "OPEN" });
    expect(orders[0].customer?.name).toBe("Kund 100 AB");
  });

  it("en order utanför filtret förs inte in och hamnar inte i inkorgen", async () => {
    await ingest("customers", [customer("100")]);
    const [result] = await ingest("orders", [order("5001", "100", "invoiced")]);
    expect(result.status).toBe("ignored");
    expect(await unsafeGlobalPrisma.order.count({ where: { companyId } })).toBe(0);
    expect(await mapping("ORDER", "5001")).toBeNull();
    // Rådatan finns kvar, om ordern skulle öppnas igen.
    expect(await unsafeGlobalPrisma.integrationRecord.count({ where: { integrationId, entityType: "ORDER" } })).toBe(1);
  });

  it("en kopplad order som faktureras i källan stängs inte i Tikkr", async () => {
    await ingest("customers", [customer("100")]);
    await ingest("orders", [order("5001", "100")]);
    const [result] = await ingest("orders", [order("5001", "100", "invoiced")]);
    expect(result.status).toBe("updated");
    const tikkr = await unsafeGlobalPrisma.order.findFirstOrThrow({ where: { companyId } });
    expect(tikkr.status).toBe("OPEN");
    expect((await mapping("ORDER", "5001"))?.status).toBe("LINKED");
  });

  it("en order vars kund ligger i inkorgen väntar, och släpps när kunden kopplas", async () => {
    await unsafeGlobalPrisma.integration.update({ where: { id: integrationId }, data: { settings: { companyKey: "Demo AB" } } });
    await ingest("customers", [customer("100")]);
    expect((await mapping("CUSTOMER", "100"))?.status).toBe("PENDING");

    const [result] = await ingest("orders", [order("5001", "100")]);
    expect(result).toMatchObject({ status: "pending", message: "customer-unlinked" });
    expect(await unsafeGlobalPrisma.order.count({ where: { companyId } })).toBe(0);

    const target = await unsafeGlobalPrisma.customer.create({ data: { companyId, name: "Befintlig" } });
    await linkToExistingCustomer(forCompany(companyId), {
      mappingId: (await mapping("CUSTOMER", "100"))!.id,
      customerId: target.id,
      actorEmail: ADMIN,
    });

    const created = await unsafeGlobalPrisma.order.findFirstOrThrow({ where: { companyId } });
    expect(created).toMatchObject({ orderNumber: "5001", customerId: target.id });
    expect((await mapping("ORDER", "5001"))?.status).toBe("LINKED");
  });

  it("ordrar som kommer före sin kund släpps när kunden kommer i en senare batch", async () => {
    expect((await ingest("orders", [order("5001", "100")]))[0].status).toBe("pending");
    await ingest("customers", [customer("100")]);
    expect((await mapping("ORDER", "5001"))?.status).toBe("LINKED");
  });

  it("en ignorerad kunds ordrar väntar", async () => {
    await unsafeGlobalPrisma.integration.update({ where: { id: integrationId }, data: { settings: { companyKey: "Demo AB" } } });
    await ingest("customers", [customer("100")]);
    await ignoreMapping(forCompany(companyId), { mappingId: (await mapping("CUSTOMER", "100"))!.id, actorEmail: ADMIN });
    const [result] = await ingest("orders", [order("5001", "100")]);
    expect(result).toMatchObject({ status: "pending", message: "customer-ignored" });
  });

  it("ett snabbjobb med samma nummer kopplas, får kunden och är granskat", async () => {
    await unsafeGlobalPrisma.order.create({ data: { companyId, orderNumber: "5001", isQuickJob: true } });
    await ingest("customers", [customer("100")]);
    expect((await ingest("orders", [order("5001", "100")]))[0].status).toBe("linked");

    const orders = await unsafeGlobalPrisma.order.findMany({ where: { companyId }, include: { customer: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ isQuickJob: false });
    expect(orders[0].customer?.name).toBe("Kund 100 AB");
  });

  it("samma nummer med en annan kund i Tikkr väntar, och går att koppla för hand", async () => {
    const other = await unsafeGlobalPrisma.customer.create({ data: { companyId, name: "Annan kund" } });
    const existing = await unsafeGlobalPrisma.order.create({ data: { companyId, orderNumber: "5001", customerId: other.id } });
    await ingest("customers", [customer("100")]);

    expect((await ingest("orders", [order("5001", "100")]))[0]).toMatchObject({ status: "pending", message: "order-customer-conflict" });

    const result = await linkToExistingOrder(forCompany(companyId), {
      mappingId: (await mapping("ORDER", "5001"))!.id,
      orderId: existing.id,
      actorEmail: ADMIN,
    });
    expect(result).toEqual({ ok: true });
    expect((await mapping("ORDER", "5001"))?.orderId).toBe(existing.id);
  });

  it("en order utan kund i källan skapas utan kund", async () => {
    expect((await ingest("orders", [order("5001", null)]))[0].status).toBe("created");
    expect((await unsafeGlobalPrisma.order.findFirstOrThrow({ where: { companyId } })).customerId).toBeNull();
  });
});
