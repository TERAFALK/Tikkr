import { NextResponse } from "next/server";
import { requireAdminEvenIfLocked } from "@/lib/admin-session";
import { GATEWAY_RELEASE } from "@/lib/integrations/gateway-release";
import { downloadGatewayMsi, msiResponse } from "@/lib/integrations/gateway-download";

/**
 * GET /api/admin/gateway/download — senaste Tikkr Gateway, för administratören
 * under Inställningar, Integrationer, Anslutning.
 *
 * Släpps igenom prenumerationslåset, som gatewayen själv: integrationen ska
 * kunna sättas upp och hållas igång oavsett faktura.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdminEvenIfLocked();
  const result = await downloadGatewayMsi(GATEWAY_RELEASE);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return msiResponse(result, GATEWAY_RELEASE!.sha256);
}
