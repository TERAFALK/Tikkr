import { NextResponse, type NextRequest } from "next/server";
import { currentAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import { blocksInWeek, hoursOn, stationsFor } from "@/lib/planning";
import { progressFor, type LiveBlock } from "@/lib/plan-live";
import { staffBlocksInWeek, staffingOf } from "@/lib/staff-planning";
import {
  hoursForEmployee,
  hoursOnDay,
  loadStaffHours,
  type StaffHoursSet,
} from "@/lib/staff-hours";
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
 * TVÅ VYER (fas 4, 2026-10-17). Med `vy=personal` räknas utfallet per pass,
 * med personens egna stämplingar. Annars per stationsruta, och dessutom för
 * bemanningen av rutorna, som stationsrutans dialog visar per pass.
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

  // currentAdmin() går förbi låset i requireAdmin(). Se admin-session.ts.
  if (session.locked) {
    return NextResponse.json({ error: "Panelen är låst." }, { status: 402 });
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

  if (request.nextUrl.searchParams.get("vy") === "personal") {
    const [passes, hours] = await Promise.all([
      staffBlocksInWeek(db, monday, timeZone),
      loadStaffHours(db),
    ]);

    const progress = await progressFor(
      db,
      toLive(passes, hours, timeZone),
      timeZone
    );

    return respond({ progress: Object.fromEntries(progress), staffing: {} });
  }

  const [stations, blocks, hours] = await Promise.all([
    stationsFor(db, timeZone),
    blocksInWeek(db, monday, timeZone),
    loadStaffHours(db),
  ]);

  const byId = new Map(stations.map((station) => [station.id, station]));

  const staffing = await staffingOf(
    db,
    blocks.map((block) => block.id)
  );

  const [progress, staffingProgress] = await Promise.all([
    progressFor(
      db,
      blocks.map((block) => {
        const station = byId.get(block.stationId);

        return {
          id: block.id,
          orderId: block.orderId,
          momentId: block.momentId,
          startsAt: block.startsAt,
          minutes: block.minutes,
          hours: station
            ? hoursOn(station.hours, block.startsAt, timeZone)
            : null,
        };
      }),
      timeZone
    ),
    progressFor(
      db,
      toLive(Object.values(staffing).flat(), hours, timeZone),
      timeZone
    ),
  ]);

  return respond({
    progress: Object.fromEntries(progress),
    staffing: Object.fromEntries(staffingProgress),
  });
}

/** Passen i den form utfallet räknas för, med personens tider den dagen. */
function toLive(
  passes: {
    id: string;
    employeeId: string;
    orderId: string;
    momentId: string;
    startsAt: Date;
    minutes: number;
  }[],
  hours: StaffHoursSet,
  timeZone: string
): LiveBlock[] {
  return passes.map((pass) => ({
    id: pass.id,
    employeeId: pass.employeeId,
    orderId: pass.orderId,
    momentId: pass.momentId,
    startsAt: pass.startsAt,
    minutes: pass.minutes,
    hours:
      hoursOnDay(
        hoursForEmployee(hours, pass.employeeId),
        pass.startsAt,
        timeZone
      ) ?? null,
  }));
}

function respond(body: {
  progress: Record<string, unknown>;
  staffing: Record<string, unknown>;
}) {
  return NextResponse.json(
    {
      now: new Date().toISOString(),
      ...body,
    },
    // Får aldrig mellanlagras. En cachad bild av vad som pågår är exakt det
    // problem funktionen finns för att lösa.
    { headers: { "cache-control": "no-store" } }
  );
}
