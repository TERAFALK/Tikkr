import { NextResponse } from "next/server";
import { requireAdminEvenIfLocked } from "@/lib/admin-session";
import { lockedExportResponse } from "@/lib/export-access";
import { GATEWAY_RELEASE } from "@/lib/integrations/gateway-release";
import { downloadGatewayMsi, msiResponse } from "@/lib/integrations/gateway-download";

/**
 * GET /api/admin/gateway/download — senaste Tikkr Gateway, för administratören
 * under Inställningar, Integrationer, Anslutning.
 *
 * Prövar prenumerationslåset själv, som uttagen, och svarar 402 i stället för
 * en omdirigering. En redan installerad gateway fortsätter fungera för en låst
 * arbetsyta; en ny installationsfil hör till panelen.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminEvenIfLocked();
  const locked = await lockedExportResponse(session);
  if (locked) return locked;

  const result = await downloadGatewayMsi(GATEWAY_RELEASE);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return msiResponse(result, GATEWAY_RELEASE!.sha256);
}
