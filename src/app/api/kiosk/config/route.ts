import { NextResponse, type NextRequest } from "next/server";
import { getKioskSession } from "@/lib/kiosk-auth";
import { appUrl } from "@/lib/app-url";
import { createDownload } from "@/lib/kiosk-config-store";

/**
 * EN ADRESS TILL SKÄRMENS KONFIGURATION.
 *
 * Skärmen har fått veta vilken version den ska ha, i sitt vanliga läge från
 * /api/kiosk/state, och ber här om en adress att hämta den från. Kioskappen
 * hämtar sedan filen själv, utan sidans kakor, se [token]/route.ts.
 *
 * Bara versionen skärmen faktiskt ska ha lämnas ut, se createDownload.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getKioskSession();
  if (!session) {
    return NextResponse.json({ error: "Skärmen är inte kopplad." }, { status: 401 });
  }

  let versionId: unknown;
  try {
    ({ versionId } = (await request.json()) as { versionId?: unknown });
  } catch {
    return NextResponse.json({ error: "Trasigt anrop." }, { status: 400 });
  }

  if (typeof versionId !== "string") {
    return NextResponse.json({ error: "Version saknas." }, { status: 400 });
  }

  const token = await createDownload({
    companyId: session.companyId,
    deviceId: session.deviceId,
    versionId,
  });

  if (!token) {
    return NextResponse.json({ error: "Fel version." }, { status: 409 });
  }

  // Adressen byggs ur APP_URL, aldrig ur anropet, som mejlade länkar.
  return NextResponse.json(
    { url: `${appUrl()}/api/kiosk/config/${token}` },
    { headers: { "cache-control": "no-store" } }
  );
}
