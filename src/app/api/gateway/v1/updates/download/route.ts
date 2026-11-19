import type { NextRequest } from "next/server";
import { apiError, withGateway } from "@/lib/integrations/gateway-http";
import { GATEWAY_RELEASE } from "@/lib/integrations/gateway-release";
import { downloadGatewayMsi, msiResponse } from "@/lib/integrations/gateway-download";

/**
 * GET /api/gateway/v1/updates/download?version=X.Y.Z — MSI:n som
 * /updates/latest pekar på. Bara den versionen lämnas ut, så att en gateway
 * aldrig kan be om en annan än den Tikkr godkänt.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withGateway(request, async () => {
    const version = request.nextUrl.searchParams.get("version");
    if (!GATEWAY_RELEASE || version !== GATEWAY_RELEASE.version) {
      return apiError(404, "unknown_version", "Versionen finns inte. Hämta /updates/latest igen.");
    }
    const result = await downloadGatewayMsi(GATEWAY_RELEASE);
    if (!result.ok) return apiError(result.status, "download_failed", result.message);
    return msiResponse(result, GATEWAY_RELEASE.sha256);
  });
}
