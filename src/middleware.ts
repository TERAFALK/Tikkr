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

/** Hjälpcentret. Har en egen adress när SUPPORT_HOST är satt. */
const HELP_PATH = "/hjalp";

function isHelpPath(pathname: string): boolean {
  return pathname === HELP_PATH || pathname.startsWith(`${HELP_PATH}/`);
}

/**
 * HJÄLPCENTRET PÅ EN EGEN ADRESS.
 *
 * Sätts på med en rad i .env, och kräver en omstart med bygge av samma skäl
 * som raderna nedan:
 *   SUPPORT_HOST=support.tikkr.se
 *
 * Sidorna ligger kvar under /hjalp även där, så att samma adress fungerar på
 * alla värdar: support.tikkr.se/hjalp/koppla-skarm. Annars hade varje länk i
 * panelen behövt veta om adressen finns, och panelens länkar är skrivna som
 * /hjalp/<guide> just för att slippa det.
 *
 *   support.tikkr.se/          → /hjalp på samma adress
 *   support.tikkr.se/admin     → portalen, som alla systemsidor
 *   support.tikkr.se/<annat>   → säljsidan, t.ex. menyns /#pris
 *   <annan adress>/hjalp/...   → support.tikkr.se, så att varje guide har en
 *                                adress och inte tre
 *
 * Utan SUPPORT_HOST händer ingenting av det här, och hjälpcentret ligger på
 * /hjalp vid säljsidan. Det är läget i labbet.
 */
function supportRedirect(
  request: NextRequest,
  host: string,
  supportHost: string,
  marketingHost: string | undefined,
  portalHost: string | undefined
): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  const target = (base: string, path = pathname) =>
    NextResponse.redirect(new URL(`${path}${search}`, `https://${base}`));

  if (host === supportHost) {
    if (pathname === "/") return target(supportHost, HELP_PATH);
    if (isHelpPath(pathname)) return null;
    if (isAppPath(pathname) && portalHost) return target(portalHost);
    if (marketingHost) return target(marketingHost);
    return null;
  }

  if (isHelpPath(pathname)) return target(supportHost);

  return null;
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
  const supportHost = process.env.SUPPORT_HOST?.trim().toLowerCase();

  // Bakom en reverse proxy står den riktiga adressen i x-forwarded-host.
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(":")[0]
    .toLowerCase();

  // Hjälpcentret först. Det gäller oavsett om säljsidan och portalen har
  // fått var sin adress, eftersom de två raderna nedan är oberoende av den.
  if (supportHost) {
    const redirect = supportRedirect(
      request,
      host,
      supportHost,
      marketingHosts[0],
      portalHost
    );
    if (redirect) return redirect;
  }

  // Inte konfigurerat — allt ligger på samma adress, som i labbet.
  if (marketingHosts.length === 0 || !portalHost) return NextResponse.next();

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
  //
  // RADEN MÅSTE VARA EN ENDA STRÄNGLITERAL. Next läser mönstret när appen
  // byggs, innan någon kod körts, och begriper därför varken variabler eller
  // strängar som satts ihop med plus. Den sortens rad blir inte ett fel vid
  // bygget utan en matcher som tystnar, vilket syns först som att
  // omdirigeringen mellan säljsidan och portalen slutat fungera.
  //
  // Därför står ikonerna och logotyperna uppräknade med namn, trots längden.
  // prettier-ignore
  matcher: ["/((?!_next/static|_next/image|api|favicon.ico|favicon.svg|icon.svg|apple-touch-icon.png|icon-192.png|icon-512.png|icon-maskable-512.png|og.png|brand/|manifest.json|sw.js).*)"],
};
