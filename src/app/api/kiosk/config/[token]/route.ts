import { NextResponse } from "next/server";
import { redeemDownload } from "@/lib/kiosk-config-store";

/**
 * KONFIGURATIONSFILEN, för kioskappen att läsa in.
 *
 * Hämtas av appen själv med `importSettingsFile`, utanför sidan och därmed
 * utan skärmens kaka. Adressen är biljetten: slumpad, för en skärm och en
 * version, i två minuter och en gång. Filen bär PIN-koden och lösenorden, så
 * ett svar som inte är en giltig biljett säger ingenting om varför.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  // Adressen slutar på .json för appens skull, se ../route.ts.
  const { token } = await params;
  const file = await redeemDownload(token.replace(/\.json$/, ""));

  if (!file) return new NextResponse(null, { status: 404 });

  return new NextResponse(JSON.stringify(file, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="fully-settings.json"',
      // Får aldrig sparas någonstans på vägen: den bär hemligheter. Och ska
      // inte packas om: appen läser filen som den kommer.
      "cache-control": "no-store, no-transform",
    },
  });
}
