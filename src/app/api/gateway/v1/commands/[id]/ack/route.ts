import { NextResponse, type NextRequest } from "next/server";
import { ackCommand } from "@/lib/integrations/gateway";
import { apiError, readBody, withGateway } from "@/lib/integrations/gateway-http";
import { ackRequest } from "@/lib/integrations/gateway-schema";

/** POST /api/gateway/v1/commands/{id}/ack — uppdraget är utfört eller misslyckat. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withGateway(request, async (session) => {
    const body = await readBody(request, ackRequest);
    if (!body.ok) return body.response;
    const { id } = await params;
    const result = await ackCommand(session, id, body.data);
    if (result === "not-found") return apiError(404, "not_found", "Uppdraget finns inte.");
    return NextResponse.json({ ok: true });
  });
}
