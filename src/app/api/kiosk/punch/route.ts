import { NextResponse, type NextRequest } from "next/server";
import { getKioskSession, touchDevice } from "@/lib/kiosk-auth";
import { clockIn, clockOut, ClockError } from "@/lib/clock";

// Tar emot en stämpling från kioskskärmen.
//
// Ska kännas omedelbar. Skärmen uppdaterar sig själv direkt vid trycket och
// skickar hit i bakgrunden — den väntar alltså inte på svaret för att visa
// något. Går anropet fel läggs det i offline-kön och skickas om.

export const runtime = "nodejs";

interface PunchBody {
  action: "in" | "out";
  employeeId: string;
  orderId?: string;
  momentId?: string;
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
      { error: "Skärmen är inte kopplad. Öppna kopplingslänken igen." },
      { status: 401 }
    );
  }

  let body: PunchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Trasigt anrop." }, { status: 400 });
  }

  if (!body?.employeeId || (body.action !== "in" && body.action !== "out")) {
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
    if (body.action === "out") {
      const closed = await clockOut(session.companyId, {
        ...context,
        employeeId: body.employeeId,
      });
      await touchDevice(session.deviceId);
      return NextResponse.json({ ok: true, closed });
    }

    if (!body.orderId || !body.momentId) {
      return NextResponse.json(
        { error: "Order och arbetsmoment måste anges." },
        { status: 400 }
      );
    }

    const result = await clockIn(session.companyId, {
      ...context,
      employeeId: body.employeeId,
      orderId: body.orderId,
      momentId: body.momentId,
    });

    await touchDevice(session.deviceId);
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
