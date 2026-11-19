import { NextResponse, type NextRequest } from "next/server";
import { clientIpFrom } from "@/lib/client-ip";
import { isLockedOut, LOCKED_OUT_MESSAGE, noteFailedLogin } from "@/lib/login-throttle";
import { redeemRegistrationToken } from "@/lib/integrations/gateway-auth";
import { apiError, readBody } from "@/lib/integrations/gateway-http";
import { registerRequest } from "@/lib/integrations/gateway-schema";

/**
 * POST /api/gateway/v1/register — engångstoken mot permanent nyckel.
 *
 * Den enda rutten utan nyckel, och därför bromsad per IP-adress i databasen
 * som kopplingskoden till skärmarna. Token går inte att gissa, men en adress
 * som provar hundra ska ändå stoppas.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THROTTLE_SCOPE = "gateway-register-ip";
const MAX_FAILURES = 10;

const REASONS = {
  invalid: "Token är ogiltig. Skapa en ny under Inställningar, Integrationer.",
  expired: "Token har gått ut. Skapa en ny under Inställningar, Integrationer.",
  used: "Token är redan använd. Skapa en ny under Inställningar, Integrationer.",
} as const;

export async function POST(request: NextRequest) {
  const ip = clientIpFrom(request.headers) ?? "okänd";
  if (await isLockedOut(THROTTLE_SCOPE, ip, MAX_FAILURES)) {
    return apiError(429, "rate_limited", LOCKED_OUT_MESSAGE);
  }

  const body = await readBody(request, registerRequest);
  if (!body.ok) return body.response;

  const result = await redeemRegistrationToken(body.data.token, {
    machineName: body.data.machineName,
    version: body.data.version,
  });

  if (!result.ok) {
    await noteFailedLogin(THROTTLE_SCOPE, ip);
    return apiError(401, `token_${result.reason}`, REASONS[result.reason]);
  }

  return NextResponse.json(
    { gatewayId: result.gatewayId, gatewayKey: result.gatewayKey },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
