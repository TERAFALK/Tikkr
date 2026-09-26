import { NextResponse, type NextRequest } from "next/server";
import {
  getKioskSession,
  refreshKioskCookie,
  touchDevice,
} from "@/lib/kiosk-auth";
import { clockIn, clockOut, clockOutAll, ClockError } from "@/lib/clock";
import { startBreak, endBreak } from "@/lib/breaks";
import { currentFlexMinutes } from "@/lib/payroll";
import { forCompany } from "@/lib/tenant";
import { unsafeGlobalPrisma } from "@/lib/db";

// Tar emot en stämpling från kioskskärmen.
//
// Ska kännas omedelbar. Skärmen uppdaterar sig själv direkt vid trycket och
// skickar hit i bakgrunden — den väntar alltså inte på svaret för att visa
// något. Går anropet fel läggs det i offline-kön och skickas om.

export const runtime = "nodejs";

interface PunchBody {
  /**
   * "out" stämplar ut från ETT jobb och bör ange momentId — se clockOut om
   * vad som händer utan. "out-all" stämplar ut från allt personen har igång.
   */
  action: "in" | "out" | "out-all" | "break" | "break-end";
  employeeId: string;
  /** Vilken rast som tas. Krävs för "break". */
  breakTypeId?: string;
  orderId?: string;
  momentId?: string;
  /** Ifyllt i stället för order och moment när tiden är improduktiv. */
  indirectMomentId?: string;
  clientPunchId?: string;
  /** När personen tryckte — inte när anropet råkade komma fram. */
  at?: string;
  /** true när trycket legat i offline-kön. Syns i audit-loggen. */
  queued?: boolean;
}

/** Tillåten klockavvikelse framåt. Skärmens klocka kan gå någon minut fel. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Så gammalt ett köat tryck får vara. Äldre än så är något uppenbart fel. */
const MAX_QUEUE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Kontrollerar tidpunkten skärmen uppger.
 *
 * Skärmen får bestämma när trycket skedde — det är hela poängen med
 * offline-kön. Men den får inte hitta på vad som helst: en tid i framtiden
 * eller flera veckor bakåt är antingen en trasig klocka eller ett försök att
 * skriva om historien, och blir i båda fallen ett felaktigt fakturaunderlag.
 */
function validatePunchTime(raw: string | undefined): Date | undefined | null {
  if (!raw) return undefined;

  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return null;

  const drift = at.getTime() - Date.now();
  if (drift > MAX_CLOCK_SKEW_MS) return null;
  if (-drift > MAX_QUEUE_AGE_MS) return null;

  return at;
}

export async function POST(request: NextRequest) {
  const session = await getKioskSession();
  if (!session) {
    return NextResponse.json(
      { error: "Skärmen är inte kopplad. Hämta en ny kod i adminpanelen." },
      { status: 401 }
    );
  }

  let body: PunchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Trasigt anrop." }, { status: 400 });
  }

  const knownAction =
    body?.action === "in" ||
    body?.action === "out" ||
    body?.action === "out-all" ||
    body?.action === "break" ||
    body?.action === "break-end";

  if (!body?.employeeId || !knownAction) {
    return NextResponse.json({ error: "Ofullständigt anrop." }, { status: 400 });
  }

  const at = validatePunchTime(body.at);
  if (at === null) {
    return NextResponse.json(
      { error: "Orimlig tidpunkt på stämplingen. Kontrollera skärmens klocka." },
      { status: 400 }
    );
  }

  const context = {
    kioskDeviceId: session.deviceId,
    sourceIp: clientIp(request),
    clientPunchId: body.clientPunchId,
    at,
    fromOfflineQueue: body.queued === true,
  };

  try {
    if (body.action === "break") {
      if (!body.breakTypeId) {
        return NextResponse.json({ error: "Ingen rast vald." }, { status: 400 });
      }

      // Rasten stänger alla pågående jobb. Se src/lib/breaks.ts.
      const result = await startBreak(session.companyId, {
        ...context,
        employeeId: body.employeeId,
        breakTypeId: body.breakTypeId,
      });

      await Promise.all([touchDevice(session.deviceId), refreshKioskCookie()]);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "break-end") {
      const ended = await endBreak(session.companyId, {
        ...context,
        employeeId: body.employeeId,
      });

      await Promise.all([touchDevice(session.deviceId), refreshKioskCookie()]);
      return NextResponse.json({ ok: true, ended });
    }

    if (body.action === "out-all") {
      const closed = await clockOutAll(session.companyId, {
        ...context,
        employeeId: body.employeeId,
      });
      await Promise.all([touchDevice(session.deviceId), refreshKioskCookie()]);

      // Flexsaldot följer med svaret på dagens sista tryck. Skärmen visar det
      // en kort stund som kvitto. TID, aldrig kronor — kiosken visar inga
      // belopp, se CLAUDE.md § 3 regel 4.
      //
      // Misslyckas räkningen svarar vi ändå ok: utstämplingen är gjord, och
      // ett saldo som inte gick att räkna fram får aldrig se ut som att
      // stämplingen inte gick igenom.
      let flexMinutes: number | null = null;
      try {
        flexMinutes = await flexFor(session.companyId, body.employeeId);
      } catch (error) {
        console.error("Kunde inte räkna fram flexsaldot", error);
      }

      return NextResponse.json({ ok: true, closed, flexMinutes });
    }

    if (body.action === "out") {
      // momentId utelämnas av tryck som köats av en äldre skärm. clockOut
      // stänger då det senast påbörjade och flaggar för granskning i stället
      // för att svara med ett fel — ett 4xx här skulle få offline-kön att
      // kasta trycket, och arbetstid får aldrig gå förlorad.
      const closed = await clockOut(session.companyId, {
        ...context,
        employeeId: body.employeeId,
        momentId: body.momentId,
        indirectMomentId: body.indirectMomentId,
      });
      await Promise.all([touchDevice(session.deviceId), refreshKioskCookie()]);
      return NextResponse.json({ ok: true, closed });
    }

    // Antingen order OCH moment, eller ett improduktivt moment. Aldrig både
    // och, och aldrig ingetdera — se JobRef i src/lib/clock.ts.
    const job = body.indirectMomentId
      ? ({
          kind: "INDIRECT",
          indirectMomentId: body.indirectMomentId,
        } as const)
      : body.orderId && body.momentId
        ? ({
            kind: "ORDER",
            orderId: body.orderId,
            momentId: body.momentId,
          } as const)
        : null;

    if (!job) {
      return NextResponse.json(
        {
          error:
            "Ange antingen order och arbetsmoment, eller ett improduktivt moment.",
        },
        { status: 400 }
      );
    }

    const result = await clockIn(session.companyId, {
      ...context,
      employeeId: body.employeeId,
      ...job,
    });

    await Promise.all([touchDevice(session.deviceId), refreshKioskCookie()]);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ClockError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Stämpling misslyckades", error);
    return NextResponse.json(
      { error: "Något gick fel. Försök igen." },
      { status: 500 }
    );
  }
}

/**
 * Vilken IP trycket kom ifrån, för audit-loggen.
 *
 * Bakom en reverse proxy är den direkta avsändaren proxyn själv. Den riktiga
 * adressen står i X-Forwarded-For, där första värdet är klienten.
 */
function clientIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? undefined;
}

/**
 * Flexsaldot för en anställd, räknat på samma sätt som i tidrapporten.
 *
 * Går via payroll.ts och inte via en egen räkning. Skärmen och kontoret måste
 * visa samma tal — ett saldo som skiljer sig mellan verkstaden och lönelistan
 * är en diskussion ingen vinner.
 */
async function flexFor(
  companyId: string,
  employeeId: string
): Promise<number | null> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });

  return currentFlexMinutes(
    forCompany(companyId),
    company?.timezone ?? "Europe/Stockholm",
    employeeId
  );
}
