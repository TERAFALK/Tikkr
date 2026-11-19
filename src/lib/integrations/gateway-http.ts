import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { allowGatewayRequest, resolveGatewayKey, type GatewaySession } from "./gateway-auth";
import { MAX_BODY_BYTES } from "./gateway-schema";

/**
 * Det varje rutt under /api/gateway/v1 gör likadant: nyckeln, bromsen,
 * storleken och valideringen. En rutt som inte går genom withGateway() fälls
 * av tests/gateway-coverage.test.ts.
 *
 * Felen har alltid formen { error: { code, message } }, se ErrorResponse.
 */

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Läser och validerar kroppen. Högst MAX_BODY_BYTES. */
export async function readBody<S extends z.ZodType>(
  request: NextRequest,
  schema: S
): Promise<ParsedBody<z.infer<S>>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "too_large", "Begäran är för stor. Dela upp batchen.") };
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    return { ok: false, response: apiError(413, "too_large", "Begäran är för stor. Dela upp batchen.") };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, response: apiError(400, "invalid_json", "Kroppen är inte giltig JSON.") };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") || "kroppen";
    return {
      ok: false,
      response: apiError(400, "invalid_request", `Ogiltigt värde i ${where}: ${issue?.message ?? "okänt fel"}.`),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Kräver en giltig gatewaynyckel och håller anropen under taket. */
export async function withGateway(
  request: NextRequest,
  handler: (session: GatewaySession) => Promise<Response>
): Promise<Response> {
  const session = await resolveGatewayKey(request.headers.get("authorization"));
  if (!session) {
    return apiError(401, "invalid_key", "Gatewayens nyckel är ogiltig eller borttagen. Registrera gatewayen igen.");
  }
  if (!allowGatewayRequest(session.gatewayId)) {
    const response = apiError(429, "rate_limited", "För många anrop. Försök igen om en minut.");
    response.headers.set("Retry-After", "60");
    return response;
  }
  return handler(session);
}
