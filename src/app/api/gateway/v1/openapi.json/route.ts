import { NextResponse } from "next/server";
import { buildGatewayOpenApi } from "@/lib/integrations/gateway-openapi";

/**
 * GET /api/gateway/v1/openapi.json — specen för gateway-API:t.
 *
 * Öppen utan nyckel: den beskriver bara formen, och samma fil ligger i
 * gatewayens repo.
 */

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(buildGatewayOpenApi());
}
