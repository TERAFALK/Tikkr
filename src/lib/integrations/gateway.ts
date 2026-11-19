import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { forCompany } from "../tenant";
import { ENTITY_KEYS, type EntityKey, type IntegrationProvider } from "./provider";
import { providerById, providerForGatewaySource } from "./providers";
import type { GatewaySession } from "./gateway-auth";
import { readSettings } from "./settings";
import type {
  ackRequest,
  commandsResponse,
  configResponse,
  heartbeatRequest,
  heartbeatResponse,
} from "./gateway-schema";

/**
 * Det gatewayen rapporterar och hämtar: heartbeat, konfiguration och uppdrag.
 * Rutterna under /api/gateway/v1 är tunna; logiken ligger här och prövas av
 * tests/gateway-api.test.ts.
 */

/** Hur ofta gatewayen hör av sig, i sekunder. Skickas med i /config. */
export const HEARTBEAT_SECONDS = 60;
export const COMMANDS_SECONDS = 30;
export const CONFIG_SECONDS = 300;
export const SYNC_INTERVAL_MINUTES = 15;

export async function recordHeartbeat(
  session: GatewaySession,
  report: z.infer<typeof heartbeatRequest>,
  now = new Date()
): Promise<z.infer<typeof heartbeatResponse>> {
  const db = forCompany(session.companyId);
  const before = await db.gateway.findFirst({
    where: { id: session.gatewayId },
    select: { lastError: true },
  });
  const error = report.error?.trim() || null;

  await db.gateway.update({
    where: { id: session.gatewayId },
    data: {
      machineName: report.machineName,
      version: report.version,
      sources: report.sources as Prisma.InputJsonValue,
      lastHeartbeatAt: now,
      lastError: error,
      lastErrorAt: error ? (error === before?.lastError ? undefined : now) : null,
    },
  });

  // Bara ändringar loggas. Ett fel som består skulle annars skrivas en gång
  // i minuten, och loggen bli oläslig.
  if (error !== (before?.lastError ?? null)) {
    await db.integrationEvent.create({
      data: {
        companyId: session.companyId,
        gatewayId: session.gatewayId,
        level: error ? "ERROR" : "INFO",
        message: error ? `Gatewayen rapporterar ett fel: ${error}` : "Gatewayens fel är åtgärdat.",
      },
    });
  }

  const pendingCommands = await db.gatewayCommand.count({
    where: { gatewayId: session.gatewayId, status: "PENDING" },
  });

  return { serverTime: now.toISOString(), pendingCommands };
}

/** Integrationerna gatewayen ska köra, i källans termer. */
export async function gatewayConfig(
  session: GatewaySession
): Promise<z.infer<typeof configResponse>> {
  const integrations = await forCompany(session.companyId).integration.findMany({
    where: { gatewayId: session.gatewayId, connectionType: "GATEWAY" },
    orderBy: { createdAt: "asc" },
  });

  const list: z.infer<typeof configResponse>["integrations"] = [];
  for (const integration of integrations) {
    const provider = providerById(integration.provider);
    if (!provider?.gatewaySource) continue;

    const settings = readSettings(provider.settingsSchema, integration.settings);
    const source = provider.sourceOptions(settings);
    list.push({
      integrationId: integration.id,
      provider: provider.id,
      source: provider.gatewaySource,
      instanceKey: source.instanceKey,
      // Kunder före ordrar, oavsett ordningen i inställningen: en order
      // kopplas via sin kund, och kunden ska då redan finnas.
      entities: ENTITY_KEYS.filter((e) => source.entities.includes(e) && provider.entities.includes(e)),
      syncIntervalMinutes: SYNC_INTERVAL_MINUTES,
      options: source.options,
    });
  }

  return {
    heartbeatSeconds: HEARTBEAT_SECONDS,
    commandsSeconds: COMMANDS_SECONDS,
    configSeconds: CONFIG_SECONDS,
    autoUpdate: true,
    integrations: list,
  };
}

export type IngestTarget =
  | { ok: true; integrationId: string; provider: IntegrationProvider; entity: EntityKey }
  | { ok: false; status: number; code: string; message: string };

/**
 * Vilken integration en batch från gatewayen hör till.
 *
 * Instansen prövas mot inställningen: poster från FEL Visma-företag skulle
 * annars kopplas mot kundens riktiga kunder, och det går inte att reda ut i
 * efterhand.
 */
export async function ingestTarget(
  session: GatewaySession,
  source: string,
  entity: string,
  instanceKey: string | null | undefined
): Promise<IngestTarget> {
  const provider = providerForGatewaySource(source);
  if (!provider) {
    return { ok: false, status: 404, code: "unknown_source", message: `Källan ${source} finns inte i Tikkr.` };
  }
  const entityKey = ENTITY_KEYS.find((e) => e === entity);
  if (!entityKey || !provider.entities.includes(entityKey)) {
    return { ok: false, status: 404, code: "unknown_entity", message: `Källan ${source} har inga ${entity}.` };
  }

  const integration = await forCompany(session.companyId).integration.findFirst({
    where: { provider: provider.id, gatewayId: session.gatewayId, connectionType: "GATEWAY" },
  });
  if (!integration) {
    return {
      ok: false,
      status: 409,
      code: "integration_inactive",
      message: `Integrationen ${provider.name} är inte aktiv för den här gatewayen.`,
    };
  }

  const settings = readSettings(provider.settingsSchema, integration.settings);
  const expected = provider.sourceOptions(settings);
  if (!expected.entities.includes(entityKey)) {
    return { ok: false, status: 409, code: "entity_disabled", message: `Synk av ${entity} är avstängd.` };
  }
  if (!expected.instanceKey || expected.instanceKey !== (instanceKey ?? null)) {
    return {
      ok: false,
      status: 409,
      code: "instance_mismatch",
      message: "Posterna kommer från en annan instans än den som är vald i Tikkr. Hämta konfigurationen igen.",
    };
  }

  return { ok: true, integrationId: integration.id, provider, entity: entityKey };
}

const COMMAND_TYPES ={ SYNC_NOW: "sync-now", FULL_RESYNC: "full-resync" } as const;

export async function pendingCommands(
  session: GatewaySession
): Promise<z.infer<typeof commandsResponse>> {
  const rows = await forCompany(session.companyId).gatewayCommand.findMany({
    where: { gatewayId: session.gatewayId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  return {
    commands: rows.map((row) => ({
      id: row.id,
      type: COMMAND_TYPES[row.type],
      integrationId: row.integrationId,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/**
 * Kvitterar ett uppdrag. Att kvittera samma uppdrag två gånger går bra:
 * gatewayen kan ha tappat svaret och försöker igen.
 */
export async function ackCommand(
  session: GatewaySession,
  commandId: string,
  ack: z.infer<typeof ackRequest>,
  now = new Date()
): Promise<"ok" | "not-found"> {
  const db = forCompany(session.companyId);
  const updated = await db.gatewayCommand.updateMany({
    where: { id: commandId, gatewayId: session.gatewayId, status: "PENDING" },
    data: {
      status: ack.status === "done" ? "DONE" : "FAILED",
      result: ack.message ?? null,
      ackedAt: now,
    },
  });
  if (updated.count === 1) return "ok";

  const exists = await db.gatewayCommand.count({
    where: { id: commandId, gatewayId: session.gatewayId },
  });
  return exists ? "ok" : "not-found";
}
