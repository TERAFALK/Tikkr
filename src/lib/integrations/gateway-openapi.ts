import { z } from "zod";
import * as api from "./gateway-schema";
import { PROVIDERS } from "./providers";

/**
 * OPENAPI-SPECEN FÖR GATEWAY-API:T, byggd ur samma zod-scheman som rutterna
 * validerar mot. Gatewayens C#-klient genereras ur den (NSwag), så att ingen
 * skriver DTO:er för hand på någon sida.
 *
 * Filen sparas i openapi/gateway-v1.json och i ../tikkr-gateway/api/.
 * tests/gateway-openapi.test.ts fäller en sparad fil som inte längre stämmer
 * med koden, och skriver om den med UPDATE_OPENAPI=1.
 *
 * OpenAPI 3.0 och inte 3.1, eftersom kodgeneratorerna för .NET läser 3.0
 * fullt ut.
 */

const SCHEMAS: Record<string, z.ZodType> = {
  ErrorResponse: api.errorResponse,
  RegisterRequest: api.registerRequest,
  RegisterResponse: api.registerResponse,
  SourceInstance: api.sourceInstance,
  SourceStatus: api.sourceStatus,
  HeartbeatRequest: api.heartbeatRequest,
  HeartbeatResponse: api.heartbeatResponse,
  EntityKey: api.entityKey,
  ConfigIntegration: api.configIntegration,
  ConfigResponse: api.configResponse,
  CommandType: api.commandType,
  GatewayCommand: api.gatewayCommand,
  CommandsResponse: api.commandsResponse,
  AckRequest: api.ackRequest,
  AckResponse: api.ackResponse,
  IngestRecord: api.ingestRecord,
  IngestRequest: api.ingestRequest,
  IngestStatus: api.ingestStatus,
  IngestResult: api.ingestResult,
  IngestResponse: api.ingestResponse,
  UpdateResponse: api.updateResponse,
};

function recordSchemas(): Record<string, z.ZodType> {
  const out: Record<string, z.ZodType> = {};
  for (const provider of PROVIDERS) {
    for (const schema of Object.values(provider.recordSchemas ?? {})) {
      const id = z.globalRegistry.get(schema)?.id;
      if (id) out[id] = schema;
    }
  }
  return out;
}

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });
const json = (id: string) => ({ "application/json": { schema: ref(id) } });
const ok = (id: string, description = "OK") => ({ description, content: json(id) });
const error = (description: string) => ({ description, content: json("ErrorResponse") });

const AUTHED_ERRORS = {
  "401": error("Nyckeln är ogiltig eller borttagen."),
  "429": error("För många anrop. Se Retry-After."),
};

export function buildGatewayOpenApi() {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries({ ...SCHEMAS, ...recordSchemas() })) {
    registry.add(schema, { id });
  }
  const { schemas } = z.toJSONSchema(registry, {
    target: "openapi-3.0",
    io: "input",
    uri: (id) => `#/components/schemas/${id}`,
    unrepresentable: "any",
  });
  // zod skriver ut $id och $schema på varje schema. De hör inte hemma i en
  // OpenAPI 3.0-komponent, och NSwag läser dem som externa referenser.
  for (const schema of Object.values(schemas) as Record<string, unknown>[]) {
    delete schema.$id;
    delete schema.$schema;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Tikkr Gateway API",
      version: api.API_VERSION,
      description:
        "API:t som Tikkr Gateway använder. Inom v1 läggs fält till men tas aldrig bort.",
    },
    servers: [{ url: "/api/gateway/v1" }],
    security: [{ gatewayKey: [] }],
    components: {
      securitySchemes: {
        gatewayKey: { type: "http", scheme: "bearer", description: "Gatewayens nyckel, tgk_…" },
      },
      schemas,
    },
    paths: {
      "/register": {
        post: {
          operationId: "Register",
          summary: "Löser in en engångstoken mot gatewayens permanenta nyckel.",
          security: [],
          requestBody: { required: true, content: json("RegisterRequest") },
          responses: {
            "201": ok("RegisterResponse", "Registrerad."),
            "400": error("Ogiltig begäran."),
            "401": error("Token är ogiltig, använd eller har gått ut."),
            "429": error("För många misslyckade försök."),
          },
        },
      },
      "/heartbeat": {
        post: {
          operationId: "Heartbeat",
          requestBody: { required: true, content: json("HeartbeatRequest") },
          responses: { "200": ok("HeartbeatResponse"), "400": error("Ogiltig begäran."), ...AUTHED_ERRORS },
        },
      },
      "/config": {
        get: {
          operationId: "GetConfig",
          responses: { "200": ok("ConfigResponse"), ...AUTHED_ERRORS },
        },
      },
      "/commands": {
        get: {
          operationId: "GetCommands",
          responses: { "200": ok("CommandsResponse"), ...AUTHED_ERRORS },
        },
      },
      "/commands/{id}/ack": {
        post: {
          operationId: "AckCommand",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: json("AckRequest") },
          responses: {
            "200": ok("AckResponse"),
            "400": error("Ogiltig begäran."),
            "404": error("Uppdraget finns inte."),
            ...AUTHED_ERRORS,
          },
        },
      },
      "/ingest/{source}/{entity}": {
        post: {
          operationId: "Ingest",
          parameters: [
            { name: "source", in: "path", required: true, schema: { type: "string" } },
            { name: "entity", in: "path", required: true, schema: ref("EntityKey") },
          ],
          requestBody: { required: true, content: json("IngestRequest") },
          responses: {
            "200": ok("IngestResponse", "Utfallet per post."),
            "400": error("Ogiltig begäran."),
            "404": error("Källan eller entiteten finns inte."),
            "409": error("Integrationen är inte aktiv, entiteten är avstängd eller instansen fel."),
            "413": error("Begäran är för stor."),
            ...AUTHED_ERRORS,
          },
        },
      },
      "/updates/latest": {
        get: {
          operationId: "GetLatestUpdate",
          responses: { "200": ok("UpdateResponse"), ...AUTHED_ERRORS },
        },
      },
    },
  };
}
