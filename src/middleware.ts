import { NextResponse, type NextRequest } from "next/server";

/**
 * DELAR UPP SÄLJSIDAN OCH SYSTEMET PÅ TVÅ ADRESSER.
 *
 * Målet: tikkr.se visar säljsidan, portal.tikkr.se är där man loggar in och
 * arbetar. Samma app och samma driftsättning — bara två adresser som pekar hit.
 *
 * Sätts på med två rader i .env:
 *   MARKETING_HOST=tikkr.se
 *   PORTAL_HOST=portal.tikkr.se
 *
 * Utan dem gör den här filen ingenting alls, vilket är läget i labbet där
 * allting ligger på samma adress.
 *
 * VIKTIGT: den här filen körs i en avskalad miljö där miljövariabler bakas in
 * när appen byggs, inte läses när den startar. Ändrar du raderna i .env måste
 * appen alltså byggas om — "docker compose up -d --build", inte bara
 * "docker compose up -d". Det gäller inte resten av inställningarna.
 *
 * Varför två adresser är värt besväret:
 *
 * - **Cookies.** Inloggningen sätts bara på portaladressen. En besökare på
 *   säljsidan har då inga sessionscookies alls, vilket är både snabbare och
 *   färre personuppgifter att förklara i en integritetspolicy.
 * - **Sökmotorer.** Säljsidan ska hittas, adminpanelen ska inte. Med två
 *   adresser blir det självklart istället för något man måste komma ihåg.
 * - **Byte utan risk.** Säljsidan kan bytas ut eller läggas hos någon annan
 *   utan att systemet påverkas.
 */

/** Adresser som hör till systemet, inte till säljsidan. */
const APP_PATHS = ["/admin", "/kiosk", "/plattform", "/registrera"];

function isAppPath(pathname: string): boolean {
  return APP_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest) {
  // Flera säljadresser tillåts, kommaseparerat. Praktiskt när både tikkr.se
  // och www.tikkr.se ska fungera: även om proxyn skickar den ena till den
  // andra ska omdirigeringen till portalen fungera oavsett vilken som råkar
  // träffa appen först.
  const marketingHosts = (process.env.MARKETING_HOST ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  const portalHost = process.env.PORTAL_HOST?.toLowerCase();

  // Inte konfigurerat — allt ligger på samma adress, som i labbet.
  if (marketingHosts.length === 0 || !portalHost) return NextResponse.next();

  // Bakom en reverse proxy står den riktiga adressen i x-forwarded-host.
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(":")[0]
    .toLowerCase();

  const path = request.nextUrl.pathname;

  // Systemets sidor på säljadressen → skicka till portalen.
  if (marketingHosts.includes(host) && isAppPath(path)) {
    return NextResponse.redirect(
      new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, `https://${portalHost}`)
    );
  }

  // Startsidan på portaladressen → skicka till inloggningen. Den som skriver
  // portal.tikkr.se i adressfältet vill logga in, inte läsa om produkten.
  if (host === portalHost && path === "/") {
    return NextResponse.redirect(new URL("/admin", `https://${portalHost}`));
  }

  return NextResponse.next();
}

export const config = {
  // Statiska filer och API-anrop lämnas i fred. En omdirigering där skulle
  // bara göra sidan långsammare utan att lösa något.
  matcher: ["/((?!_next/static|_next/image|api|favicon.ico|icon.svg|manifest.json|sw.js).*)"],
};
