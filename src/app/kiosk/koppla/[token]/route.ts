import { NextResponse, type NextRequest } from "next/server";
import {
  KIOSK_COOKIE,
  kioskCookieOptions,
  resolveDeviceToken,
  touchDevice,
} from "@/lib/kiosk-auth";

// Engångslänken som kopplar en fysisk skärm till ett företag.
//
// Admin öppnar den här adressen en gång på skärmen. Token flyttas då från
// adressen till en cookie, och skärmen skickas vidare till kioskvyn — utan
// token i adressfältet. Därefter behöver ingen logga in igen.

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await resolveDeviceToken(token);

  if (!session) {
    // Medvetet knapphändigt: vi avslöjar inte om token är felstavad,
    // återkallad eller aldrig har funnits.
    return new NextResponse(
      "Ogiltig eller återkallad kopplingslänk. Be administratören om en ny.",
      { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  await touchDevice(session.deviceId);

  const response = NextResponse.redirect(new URL("/kiosk", _request.url));
  response.cookies.set(KIOSK_COOKIE, token, kioskCookieOptions());
  return response;
}
