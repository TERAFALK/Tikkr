import { NextResponse, type NextRequest } from "next/server";
import { recordHeartbeat } from "@/lib/integrations/gateway";
import { readBody, withGateway } from "@/lib/integrations/gateway-http";
import { heartbeatRequest } from "@/lib/integrations/gateway-schema";

/** POST /api/gateway/v1/heartbeat — gatewayen lever, och detta har den. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withGateway(request, async (session) => {
    const body = await readBody(request, heartbeatRequest);
    if (!body.ok) return body.response;
    return NextResponse.json(await recordHeartbeat(session, body.data));
  });
}
