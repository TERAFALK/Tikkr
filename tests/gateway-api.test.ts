import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { unsafeGlobalPrisma } from "@/lib/db";
import { __resetThrottle } from "@/lib/login-throttle";
import {
  __resetGatewayRateLimit,
  createRegistrationToken,
  GATEWAY_REQUESTS_PER_MINUTE,
  hashSecret,
  redeemRegistrationToken,
  resolveGatewayKey,
  allowGatewayRequest,
  type GatewaySession,
} from "@/lib/integrations/gateway-auth";
import { ackCommand, gatewayConfig, ingestTarget, pendingCommands, recordHeartbeat } from "@/lib/integrations/gateway";
import { ingestRecords } from "@/lib/integrations/ingest";
import { vismaAdministration } from "@/lib/integrations/providers/visma-administration";
import { stableHash } from "@/lib/integrations/stable-hash";
import { POST as registerRoute } from "@/app/api/gateway/v1/register/route";
import { POST as ingestRoute } from "@/app/api/gateway/v1/ingest/[source]/[entity]/route";
import { GET as configRoute } from "@/app/api/gateway/v1/config/route";

/**
 * GATEWAY-API:T: registrering, nyckel, heartbeat, uppdrag och ingest.
 *
 * Det viktigaste här är tre saker. En token fungerar en gång. En gateway når
 * bara sitt eget företag. Och samma post två gånger ger aldrig två rader.
 */

const PREFIX = "Gatewaytest ";
const REPORT = { machineName: "SRV-VISMA", version: "1.0.0" };

let companyId: string;

async function newCompany(): Promise<string> {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: PREFIX + Math.random().toString(36).slice(2, 8) },
  });
  return company.id;
}

async function addVisma(company: string, settings: object = { companyKey: "Demo AB" }) {
  return unsafeGlobalPrisma.integration.create({
    data: {
      companyId: company,
      provider: "visma-administration",
      connectionType: "GATEWAY",
      settings,
      createdByEmail: "admin@example.se",
    },
  });
}

async function registerGateway(company: string) {
  const { token } = await createRegistrationToken(company, "admin@example.se");
  const result = await redeemRegistrationToken(token, REPORT);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const customer = (n: string, name = `Kund ${n}`) => ({
  externalId: n,
  data: { customerNumber: n, name, orgNumber: "556000-0000" },
});

beforeEach(async () => {
  await __resetThrottle();
  __resetGatewayRateLimit();
  companyId = await newCompany();
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("registreringen", () => {
  it("ger en nyckel som pekar på rätt företag, och sparar bara fingeravtrycket", async () => {
    const result = await registerGateway(companyId);
    expect(result.gatewayKey).toMatch(/^tgk_/);

    const row = await unsafeGlobalPrisma.gateway.findUniqueOrThrow({ where: { id: result.gatewayId } });
    expect(row.keyHash).toBe(hashSecret(result.gatewayKey));
    expect(row.machineName).toBe("SRV-VISMA");

    const session = await resolveGatewayKey(`Bearer ${result.gatewayKey}`);
    expect(session).toEqual({ gatewayId: result.gatewayId, companyId });
  });

  it("token fungerar en gång, inte två", async () => {
    const { token } = await createRegistrationToken(companyId, "admin@example.se");
    expect((await redeemRegistrationToken(token, REPORT)).ok).toBe(true);
    expect(await redeemRegistrationToken(token, REPORT)).toEqual({ ok: false, reason: "used" });
  });

  it("två samtidiga försök med samma token ger en gateway", async () => {
    const { token } = await createRegistrationToken(companyId, "admin@example.se");
    const results = await Promise.all([
      redeemRegistrationToken(token, REPORT),
      redeemRegistrationToken(token, REPORT),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await unsafeGlobalPrisma.gateway.count({ where: { companyId } })).toBe(1);
  });

  it("token som gått ut avvisas", async () => {
    const past = new Date(Date.now() - 25 * 3600_000);
    const { token } = await createRegistrationToken(companyId, "admin@example.se", past);
    expect(await redeemRegistrationToken(token, REPORT)).toEqual({ ok: false, reason: "expired" });
  });

  it("påhittad token avvisas", async () => {
    expect(await redeemRegistrationToken("tgr_finnsinte", REPORT)).toEqual({ ok: false, reason: "invalid" });
  });

  it("en integration som väntar på gateway får den nya", async () => {
    const integration = await addVisma(companyId);
    const { gatewayId } = await registerGateway(companyId);
    const row = await unsafeGlobalPrisma.integration.findUniqueOrThrow({ where: { id: integration.id } });
    expect(row.gatewayId).toBe(gatewayId);
  });

  it("rutten svarar 201 med nyckeln och 401 på en dålig token", async () => {
    const { token } = await createRegistrationToken(companyId, "admin@example.se");
    const request = (t: string) =>
      new NextRequest("http://localhost/api/gateway/v1/register", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ token: t, ...REPORT }),
      });

    const ok = await registerRoute(request(token));
    expect(ok.status).toBe(201);
    expect((await ok.json()).gatewayKey).toMatch(/^tgk_/);

    const bad = await registerRoute(request(token));
    expect(bad.status).toBe(401);
    expect((await bad.json()).error.code).toBe("token_used");
  });
});

describe("nyckeln", () => {
  it("en okänd eller felformaterad nyckel ger ingen session", async () => {
    expect(await resolveGatewayKey(null)).toBeNull();
    expect(await resolveGatewayKey("Bearer tgk_finnsinte")).toBeNull();
    expect(await resolveGatewayKey("Basic abc")).toBeNull();
  });

  it("en borttagen gateway kommer inte in", async () => {
    const { gatewayId, gatewayKey } = await registerGateway(companyId);
    await unsafeGlobalPrisma.gateway.delete({ where: { id: gatewayId } });
    expect(await resolveGatewayKey(`Bearer ${gatewayKey}`)).toBeNull();
  });

  it("rutterna svarar 401 utan nyckel", async () => {
    const response = await configRoute(new NextRequest("http://localhost/api/gateway/v1/config"));
    expect(response.status).toBe(401);
  });

  it("anropen per minut har ett tak", () => {
    const now = Date.now();
    for (let i = 0; i < GATEWAY_REQUESTS_PER_MINUTE; i++) expect(allowGatewayRequest("g1", now)).toBe(true);
    expect(allowGatewayRequest("g1", now)).toBe(false);
    expect(allowGatewayRequest("g2", now)).toBe(true);
    expect(allowGatewayRequest("g1", now + 60_000)).toBe(true);
  });
});

describe("heartbeat", () => {
  it("sparar det gatewayen rapporterar och loggar bara när felet ändras", async () => {
    const { gatewayId } = await registerGateway(companyId);
    const session: GatewaySession = { gatewayId, companyId };
    const report = {
      version: "1.0.1",
      machineName: "SRV-VISMA",
      sources: [
        {
          id: "visma-administration",
          name: "Visma Administration",
          healthy: false,
          error: "ADK saknas",
          instances: [{ key: "Demo AB", name: "Demo AB" }],
        },
      ],
      error: "ADK saknas",
    };

    await recordHeartbeat(session, report);
    await recordHeartbeat(session, report);
    await recordHeartbeat(session, { ...report, error: null });

    const row = await unsafeGlobalPrisma.gateway.findUniqueOrThrow({ where: { id: gatewayId } });
    expect(row.version).toBe("1.0.1");
    expect(row.lastError).toBeNull();
    expect(row.sources).toEqual(report.sources);

    const events = await unsafeGlobalPrisma.integrationEvent.findMany({
      where: { gatewayId, message: { contains: "fel" } },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => e.level)).toEqual(["ERROR", "INFO"]);
  });
});

describe("konfigurationen", () => {
  it("skickar källa, instans och kunder före ordrar", async () => {
    await addVisma(companyId, { companyKey: "Demo AB", entities: ["orders", "customers"] });
    const { gatewayId } = await registerGateway(companyId);
    const config = await gatewayConfig({ gatewayId, companyId });

    expect(config.integrations).toHaveLength(1);
    expect(config.integrations[0]).toMatchObject({
      provider: "visma-administration",
      source: "visma-administration",
      instanceKey: "Demo AB",
      entities: ["customers", "orders"],
      options: { orderStatuses: ["open"] },
    });
  });

  it("trasiga inställningar ger standardvärden, inte ett fel", async () => {
    await addVisma(companyId, { entities: "fel" });
    const { gatewayId } = await registerGateway(companyId);
    const config = await gatewayConfig({ gatewayId, companyId });
    expect(config.integrations[0].instanceKey).toBeNull();
    expect(config.integrations[0].entities).toEqual(["customers", "orders"]);
  });
});

describe("uppdragen", () => {
  it("listas tills de kvitterats, och kan kvitteras två gånger", async () => {
    const { gatewayId } = await registerGateway(companyId);
    const session = { gatewayId, companyId };
    const command = await unsafeGlobalPrisma.gatewayCommand.create({
      data: { companyId, gatewayId, type: "SYNC_NOW" },
    });

    expect((await pendingCommands(session)).commands).toMatchObject([{ id: command.id, type: "sync-now" }]);
    expect(await ackCommand(session, command.id, { status: "done" })).toBe("ok");
    expect(await ackCommand(session, command.id, { status: "done" })).toBe("ok");
    expect((await pendingCommands(session)).commands).toEqual([]);
    expect(await ackCommand(session, "finns-inte", { status: "done" })).toBe("not-found");
  });

  it("kvittensen står i integrationens logg med gatewayens besked", async () => {
    const integration = await addVisma(companyId);
    const { gatewayId } = await registerGateway(companyId);
    const session = { gatewayId, companyId };
    const ok = await unsafeGlobalPrisma.gatewayCommand.create({
      data: { companyId, gatewayId, integrationId: integration.id, type: "SYNC_NOW" },
    });
    const failed = await unsafeGlobalPrisma.gatewayCommand.create({
      data: { companyId, gatewayId, integrationId: integration.id, type: "FULL_RESYNC" },
    });

    await ackCommand(session, ok.id, { status: "done", message: "Synken är klar." });
    await ackCommand(session, failed.id, { status: "failed", message: "Licensen saknas." });
    // En upprepad kvittens loggas inte igen.
    await ackCommand(session, ok.id, { status: "done", message: "Synken är klar." });

    const events = await unsafeGlobalPrisma.integrationEvent.findMany({
      where: { integrationId: integration.id, message: { startsWith: "Synka nu" } },
    });
    expect(events.map((e) => e.message)).toEqual(["Synka nu: Synken är klar."]);
    const warning = await unsafeGlobalPrisma.integrationEvent.findFirstOrThrow({
      where: { integrationId: integration.id, message: { startsWith: "Läs om allt" } },
    });
    expect(warning).toMatchObject({ level: "WARNING", message: "Läs om allt: Licensen saknas." });
  });

  it("en annan gateways uppdrag syns inte och går inte att kvittera", async () => {
    const mine = await registerGateway(companyId);
    const other = await registerGateway(companyId);
    const command = await unsafeGlobalPrisma.gatewayCommand.create({
      data: { companyId, gatewayId: other.gatewayId, type: "FULL_RESYNC" },
    });
    const session = { gatewayId: mine.gatewayId, companyId };
    expect((await pendingCommands(session)).commands).toEqual([]);
    expect(await ackCommand(session, command.id, { status: "done" })).toBe("not-found");
  });
});

describe("ingest", () => {
  it("samma post två gånger ger en rad, och andra gången är den oförändrad", async () => {
    const integration = await addVisma(companyId);
    const input = { companyId, integrationId: integration.id, provider: vismaAdministration, entity: "customers" as const };

    const first = await ingestRecords({ ...input, records: [customer("1"), customer("2")] });
    // Utan träff och utan "skapa direkt" hamnar kunderna i inkorgen.
    expect(first.map((r) => r.status)).toEqual(["pending", "pending"]);

    // Fälten i en annan ordning är samma post.
    const second = await ingestRecords({
      ...input,
      records: [{ externalId: "1", data: { orgNumber: "556000-0000", name: "Kund 1", customerNumber: "1" } }],
    });
    expect(second).toEqual([{ externalId: "1", status: "unchanged" }]);

    expect(await unsafeGlobalPrisma.integrationRecord.count({ where: { integrationId: integration.id } })).toBe(2);
  });

  it("en ändrad post skrivs om", async () => {
    const integration = await addVisma(companyId);
    const input = { companyId, integrationId: integration.id, provider: vismaAdministration, entity: "customers" as const };
    await ingestRecords({ ...input, records: [customer("1")] });
    const result = await ingestRecords({ ...input, records: [customer("1", "Nytt namn AB")] });
    expect(result[0].status).toBe("pending");

    const row = await unsafeGlobalPrisma.integrationRecord.findFirstOrThrow({ where: { integrationId: integration.id } });
    expect(row.dataHash).toBe(stableHash(customer("1", "Nytt namn AB").data));
  });

  it("en trasig post stoppar inte de andra", async () => {
    const integration = await addVisma(companyId);
    const results = await ingestRecords({
      companyId,
      integrationId: integration.id,
      provider: vismaAdministration,
      entity: "customers",
      records: [customer("1"), { externalId: "2", data: { customerNumber: "2" } }, customer("3")],
    });
    expect(results.map((r) => r.status)).toEqual(["pending", "error", "pending"]);
    expect(results[1].message).toContain("name");

    const event = await unsafeGlobalPrisma.integrationEvent.findFirstOrThrow({
      where: { integrationId: integration.id },
    });
    expect(event.level).toBe("WARNING");
    expect(event.message).toBe("Tog emot 3 kunder: 2 i inkorgen, 1 med fel.");
  });

  it("poster från fel Visma-företag avvisas", async () => {
    await addVisma(companyId, { companyKey: "Demo AB" });
    const { gatewayId } = await registerGateway(companyId);
    const target = await ingestTarget({ gatewayId, companyId }, "visma-administration", "customers", "Annat AB");
    expect(target).toMatchObject({ ok: false, code: "instance_mismatch" });
  });

  it("utan valt företag tas inget emot", async () => {
    await addVisma(companyId, {});
    const { gatewayId } = await registerGateway(companyId);
    const target = await ingestTarget({ gatewayId, companyId }, "visma-administration", "customers", null);
    expect(target).toMatchObject({ ok: false, code: "instance_mismatch" });
  });

  it("okänd källa och entitet ger 404-svar", async () => {
    const { gatewayId } = await registerGateway(companyId);
    const session = { gatewayId, companyId };
    expect(await ingestTarget(session, "finns-inte", "customers", null)).toMatchObject({ status: 404 });
    expect(await ingestTarget(session, "visma-administration", "employees", null)).toMatchObject({ status: 404 });
  });

  it("en gateway når aldrig ett annat företags integration", async () => {
    const otherCompany = await newCompany();
    await addVisma(otherCompany);
    await registerGateway(otherCompany);

    await addVisma(companyId);
    const mine = await registerGateway(companyId);

    // Rutten tar företaget ur nyckeln och ingenting annat. Posterna landar hos
    // det egna företaget, aldrig hos det andra.
    const response = await ingestRoute(
      new NextRequest("http://localhost/api/gateway/v1/ingest/visma-administration/customers", {
        method: "POST",
        headers: { authorization: `Bearer ${mine.gatewayKey}` },
        body: JSON.stringify({ instanceKey: "Demo AB", records: [customer("9")] }),
      }),
      { params: Promise.resolve({ source: "visma-administration", entity: "customers" }) }
    );
    expect(response.status).toBe(200);
    expect(await unsafeGlobalPrisma.integrationRecord.count({ where: { companyId: otherCompany } })).toBe(0);
    expect(await unsafeGlobalPrisma.integrationRecord.count({ where: { companyId } })).toBe(1);
  });

  it("rutten avvisar en för stor batch", async () => {
    await addVisma(companyId);
    const { gatewayKey } = await registerGateway(companyId);
    const records = Array.from({ length: 501 }, (_, i) => customer(String(i)));
    const response = await ingestRoute(
      new NextRequest("http://localhost/api/gateway/v1/ingest/visma-administration/customers", {
        method: "POST",
        headers: { authorization: `Bearer ${gatewayKey}` },
        body: JSON.stringify({ instanceKey: "Demo AB", records }),
      }),
      { params: Promise.resolve({ source: "visma-administration", entity: "customers" }) }
    );
    expect(response.status).toBe(400);
  });
});
