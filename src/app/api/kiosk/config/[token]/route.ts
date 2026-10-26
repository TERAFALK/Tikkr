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
  const { token } = await params;
  const file = await redeemDownload(token);

  if (!file) return new NextResponse(null, { status: 404 });

  return NextResponse.json(file, {
    headers: {
      // Får aldrig sparas någonstans på vägen: den bär hemligheter.
      "cache-control": "no-store",
    },
  });
}
