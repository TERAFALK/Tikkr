import { z } from "zod";

/**
 * GATEWAY-API:T, VERSION 1. Kontraktet mellan Tikkr och Tikkr Gateway.
 *
 * Varje rutt under /api/gateway/v1 validerar mot schemana här, och
 * OpenAPI-specen som gatewayens klient genereras ur byggs av samma scheman
 * (gateway-openapi.ts). Rutterna och specen kan därför inte säga olika saker.
 *
 * INOM v1 ÄNDRAS INGET BAKÅT: fält läggs till, aldrig tas bort eller byter
 * betydelse. En gateway som installerades för ett år sedan ska fortsätta
 * fungera. Ett brott kräver /api/gateway/v2.
 */

export const API_VERSION = "1";

/** Högsta antal poster i en batch. Gatewayen delar upp större. */
export const MAX_BATCH_RECORDS = 500;

/** Högsta storlek på en begäran, i byte. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const id = z.string().min(1).max(200);
const shortText = z.string().trim().max(200);

export const errorResponse = z
  .object({
    error: z.object({
      code: z.string().describe("Maskinläsbar kod, t.ex. invalid_token."),
      message: z.string().describe("Svensk text att visa eller logga."),
    }),
  })
  .meta({ id: "ErrorResponse" });

/* ---------------------------------------------------------------- register */

export const registerRequest = z
  .object({
    token: z.string().min(1).max(200).describe("Engångstoken från Inställningar, Integrationer."),
    machineName: shortText.min(1),
    version: z.string().min(1).max(50),
  })
  .meta({ id: "RegisterRequest" });

export const registerResponse = z
  .object({
    gatewayId: z.string(),
    gatewayKey: z
      .string()
      .describe("Permanent nyckel. Visas bara här. Skickas som Bearer i varje anrop."),
  })
  .meta({ id: "RegisterResponse" });

/* --------------------------------------------------------------- heartbeat */

export const sourceInstance = z
  .object({
    key: shortText.min(1).describe("Stabil nyckel, t.ex. Visma-företagets mappnamn."),
    name: shortText.min(1),
  })
  .meta({ id: "SourceInstance" });

export const sourceStatus = z
  .object({
    id: z.string().min(1).max(100).describe("Källans id, t.ex. visma-administration."),
    name: shortText.min(1),
    version: z.string().max(50).nullish(),
    healthy: z.boolean(),
    error: z.string().max(2000).nullish().describe("Senaste fel från källans hälsokontroll."),
    instances: z.array(sourceInstance).max(100).default([]),
    lastSuccessfulSyncAt: z.iso.datetime({ offset: true }).nullish(),
  })
  .meta({ id: "SourceStatus" });

export const heartbeatRequest = z
  .object({
    version: z.string().min(1).max(50),
    machineName: shortText.min(1),
    sources: z.array(sourceStatus).max(50),
    error: z.string().max(2000).nullish().describe("Gatewayens senaste fel, null om inget."),
  })
  .meta({ id: "HeartbeatRequest" });

export const heartbeatResponse = z
  .object({
    serverTime: z.iso.datetime(),
    pendingCommands: z.number().int().min(0),
  })
  .meta({ id: "HeartbeatResponse" });

/* ------------------------------------------------------------------ config */

export const entityKey = z.enum(["customers", "orders"]).meta({ id: "EntityKey" });

export const configIntegration = z
  .object({
    integrationId: z.string(),
    provider: z.string(),
    source: z.string().describe("Källan som ska läsas, samma som ISource.Id."),
    instanceKey: z.string().nullable().describe("Vilken instans, t.ex. Visma-företag. Null = inte vald än."),
    entities: z.array(entityKey).describe("I den ordning de ska synkas."),
    syncIntervalMinutes: z.number().int().min(1),
    options: z.record(z.string(), z.unknown()).describe("Källspecifika inställningar."),
  })
  .meta({ id: "ConfigIntegration" });

export const configResponse = z
  .object({
    heartbeatSeconds: z.number().int().min(10),
    commandsSeconds: z.number().int().min(10),
    configSeconds: z.number().int().min(10),
    autoUpdate: z.boolean(),
    integrations: z.array(configIntegration),
  })
  .meta({ id: "ConfigResponse" });

/* ---------------------------------------------------------------- commands */

export const commandType = z.enum(["sync-now", "full-resync"]).meta({ id: "CommandType" });

export const gatewayCommand = z
  .object({
    id: z.string(),
    type: commandType,
    integrationId: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "GatewayCommand" });

export const commandsResponse = z
  .object({ commands: z.array(gatewayCommand) })
  .meta({ id: "CommandsResponse" });

export const ackRequest = z
  .object({
    status: z.enum(["done", "failed"]),
    message: z.string().max(2000).nullish(),
  })
  .meta({ id: "AckRequest" });

export const ackResponse = z.object({ ok: z.literal(true) }).meta({ id: "AckResponse" });

/* ------------------------------------------------------------------ ingest */

export const ingestRecord = z
  .object({
    externalId: id.describe("Postens id i källan. Samma post har alltid samma id."),
    updatedAt: z.iso.datetime({ offset: true }).nullish().describe("När posten ändrades i källan."),
    data: z.record(z.string(), z.unknown()).describe("Posten i källans form, se källans schema."),
  })
  .meta({ id: "IngestRecord" });

export const ingestRequest = z
  .object({
    instanceKey: z.string().max(200).nullish(),
    records: z.array(ingestRecord).min(1).max(MAX_BATCH_RECORDS),
  })
  .meta({ id: "IngestRequest" });

/**
 * Utfallet per post. Gatewayen behöver bara veta om posten är MOTTAGEN
 * (allt utom `error`) och kan då släppa den ur sin kö. Resten är för loggen.
 */
export const ingestStatus = z
  .enum(["received", "unchanged", "created", "updated", "linked", "pending", "ignored", "error"])
  .meta({ id: "IngestStatus" });

export const ingestResult = z
  .object({
    externalId: z.string(),
    status: ingestStatus,
    message: z.string().nullish(),
  })
  .meta({ id: "IngestResult" });

export const ingestResponse = z
  .object({ results: z.array(ingestResult) })
  .meta({ id: "IngestResponse" });

/* ----------------------------------------------------------------- updates */

export const updateResponse = z
  .object({
    available: z.boolean(),
    version: z.string().nullable(),
    downloadUrl: z.string().nullable().describe("Kräver gatewayens nyckel."),
    sha256: z.string().nullable(),
  })
  .meta({ id: "UpdateResponse" });

export type IngestStatus = z.infer<typeof ingestStatus>;
export type IngestResult = z.infer<typeof ingestResult>;
