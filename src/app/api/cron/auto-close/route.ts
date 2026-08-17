import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { unsafeGlobalPrisma } from "@/lib/db";
import { autoCloseForgottenEntries } from "@/lib/clock";
import { noteCronRun } from "@/lib/platform-health";
import { recordSnapshot } from "@/lib/revenue-history";

/**
 * Stänger glömda stämplingar. Anropas av ett schemalagt jobb på servern.
 *
 * Logiken för VAD som ska stängas ligger i clock.ts och är testad. Det här är
 * bara motorn som får den att köra — utan den skulle en glömd stämpling ligga
 * öppen i evighet och räknas upp för alltid.
 *
 * Körs var 15:e minut. Att köra ofta är ofarligt: varje post stängs vid sitt
 * eget klockslag, och en post som redan stängts rörs inte igen.
 *
 * Skyddas med en delad hemlighet, eftersom adressen annars vore en öppen väg
 * att stänga alla pågående stämplingar hos alla kunder.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("CRON_SECRET saknas — automatisk utstämpling är avstängd.");
    return NextResponse.json({ error: "Ej konfigurerad." }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!provided || !equalInConstantTime(provided, secret)) {
    return NextResponse.json({ error: "Nekad." }, { status: 401 });
  }

  const companies = await unsafeGlobalPrisma.company.findMany({
    select: { id: true, name: true },
  });

  const now = new Date();
  const result: { company: string; closed: number }[] = [];

  for (const company of companies) {
    try {
      const closed = await autoCloseForgottenEntries(company.id, now);
      if (closed.length > 0) {
        result.push({ company: company.name, closed: closed.length });
      }
    } catch (error) {
      // Ett företag med trasig inställning ska inte stoppa de andra.
      console.error(`Autoutstämpling misslyckades för ${company.name}`, error);
    }
  }

  // Två anteckningar på vägen ut. Ingen av dem får fälla körningen — den
  // huvudsakliga uppgiften är gjord, och en misslyckad bokföring av den är
  // ett mindre problem än en post som ligger öppen till i morgon.
  try {
    await Promise.all([noteCronRun(now), recordSnapshot(now)]);
  } catch (error) {
    console.error("Kunde inte skriva driftläge eller intäktsmätning", error);
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    companiesChecked: companies.length,
    closed: result,
  });
}

/** Jämför utan att svarstiden avslöjar hur många tecken som stämde. */
function equalInConstantTime(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
