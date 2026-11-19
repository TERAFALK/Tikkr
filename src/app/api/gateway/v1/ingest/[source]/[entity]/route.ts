import { NextResponse, type NextRequest } from "next/server";
import { ingestTarget } from "@/lib/integrations/gateway";
import { apiError, readBody, withGateway } from "@/lib/integrations/gateway-http";
import { ingestRequest } from "@/lib/integrations/gateway-schema";
import { ingestRecords } from "@/lib/integrations/ingest";

/**
 * POST /api/gateway/v1/ingest/{source}/{entity} — en batch poster.
 *
 * Svarar med utfallet per post. En post med status `error` ska gatewayen
 * behålla och skicka igen när källan rättats; allt annat är mottaget.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ source: string; entity: string }> }
) {
  return withGateway(request, async (session) => {
    const body = await readBody(request, ingestRequest);
    if (!body.ok) return body.response;

    const { source, entity } = await params;
    const target = await ingestTarget(session, source, entity, body.data.instanceKey);
    if (!target.ok) return apiError(target.status, target.code, target.message);

    const results = await ingestRecords({
      companyId: session.companyId,
      integrationId: target.integrationId,
      provider: target.provider,
      entity: target.entity,
      records: body.data.records,
      gatewayId: session.gatewayId,
    });
    return NextResponse.json({ results });
  });
}
