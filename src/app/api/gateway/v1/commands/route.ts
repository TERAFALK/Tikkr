import { NextResponse, type NextRequest } from "next/server";
import { pendingCommands } from "@/lib/integrations/gateway";
import { withGateway } from "@/lib/integrations/gateway-http";

/** GET /api/gateway/v1/commands — uppdrag som väntar, äldst först. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withGateway(request, async (session) => NextResponse.json(await pendingCommands(session)));
}
