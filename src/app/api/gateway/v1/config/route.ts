import { NextResponse, type NextRequest } from "next/server";
import { gatewayConfig } from "@/lib/integrations/gateway";
import { withGateway } from "@/lib/integrations/gateway-http";

/** GET /api/gateway/v1/config — vilka källor gatewayen ska läsa, och hur. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withGateway(request, async (session) => NextResponse.json(await gatewayConfig(session)));
}
