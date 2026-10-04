import { NextResponse, type NextRequest } from "next/server";
import { currentAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import { blocksInWeek, hoursOn, stationsFor } from "@/lib/planning";
import { progressFor } from "@/lib/plan-live";
import { parseLocalDate, startOfWeekIn } from "@/lib/time-zone";

/**
 * VAD SOM FAKTISKT KÖRS AV DET PLANERADE.
 *
 * Tavlan hämtar sitt läge en gång vid laddning och skulle därefter visa en
 * plan som ser lika död ut klockan tre som klockan sju. Den här rutten är
 * skillnaden: planeraren ska kunna se att fräsningen på 2601 verkligen startade
 * i morse, utan att ladda om sidan.
 *
 * Svaret är avsiktligt litet — bara utfallet per ruta, inget om rutorna själva.
 * Anropas var tionde sekund av varje öppen tavla, och ska därför kosta nästan
 * ingenting. Samma hållning som /api/kiosk/state, som anropas var femte.
 *
 * MODULGRINDEN LIGGER HÄR OCH INTE I EN LAYOUT. Rutterna under /api renderas
 * aldrig genom panelens layout — middleware.ts undantar dem, och den här filen
 * är hela vägen in. Ett 404 och inte ett 403: en adress till något kunden inte
 * har ska se ut som att den inte finns.
 *
 * ETT 401 OCH INGEN OMDIRIGERING. `requireAdmin()` skickar den utloggade till
 * inloggningssidan, vilket är rätt för en sida och fel för ett anrop från
 * JavaScript: svaret hade blivit inloggningssidans HTML, och tavlan hade
 * försökt läsa den som JSON. Därför `currentAdmin()` och ett statuskodsvar.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await currentAdmin();

  if (!session) {
    return NextResponse.json({ error: "Inte inloggad." }, { status: 401 });
  }

  const { db, companyId } = session;

  if (!(await hasModule(companyId, "PLANNING"))) {
    return NextResponse.json({ error: "Okänd adress." }, { status: 404 });
  }

  const timeZone = await companyTimeZone(companyId);

  // Veckan kommer som ett datum, precis som tavlans egen adress tar den. Utan
  // parameter gäller den pågående veckan.
  const raw = request.nextUrl.searchParams.get("v");
  const picked = raw ? parseLocalDate(raw, timeZone) : null;
  const monday = startOfWeekIn(picked ?? new Date(), timeZone);

  const [stations, blocks] = await Promise.all([
    stationsFor(db, timeZone),
    blocksInWeek(db, monday, timeZone),
  ]);

  const byId = new Map(stations.map((station) => [station.id, station]));

  const progress = await progressFor(
    db,
    blocks.map((block) => {
      const station = byId.get(block.stationId);

      return {
        id: block.id,
        orderId: block.orderId,
        momentId: block.momentId,
        startsAt: block.startsAt,
        minutes: block.minutes,
        hours: station ? hoursOn(station, block.startsAt, timeZone) : null,
      };
    }),
    timeZone
  );

  return NextResponse.json(
    {
      now: new Date().toISOString(),
      progress: Object.fromEntries(progress),
    },
    // Får aldrig mellanlagras. En cachad bild av vad som pågår är exakt det
    // problem funktionen finns för att lösa.
    { headers: { "cache-control": "no-store" } }
  );
}
