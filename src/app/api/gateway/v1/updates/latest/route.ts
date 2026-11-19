import { NextResponse, type NextRequest } from "next/server";
import { withGateway } from "@/lib/integrations/gateway-http";
import { GATEWAY_RELEASE } from "@/lib/integrations/gateway-release";

/**
 * GET /api/gateway/v1/updates/latest — senaste versionen av gatewayen.
 *
 * Adressen till filen är relativ till Tikkr och kräver gatewayens nyckel.
 * Gatewayen kontrollerar SHA-256 OCH Authenticode-signaturen innan den
 * installerar något.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withGateway(request, async () => {
    const release = GATEWAY_RELEASE;
    return NextResponse.json({
      available: release !== null,
      version: release?.version ?? null,
      downloadUrl: release ? `/api/gateway/v1/updates/download?version=${encodeURIComponent(release.version)}` : null,
      sha256: release?.sha256 ?? null,
    });
  });
}
