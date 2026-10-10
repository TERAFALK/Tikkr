import { NextResponse } from "next/server";
import { unsafeGlobalPrisma } from "@/lib/db";

// Hälsokoll för uptime-övervakning (t.ex. UptimeRobot) och för Dockers
// healthcheck. Den svarar 200 bara om appen OCH databasen svarar — en app som
// lever men inte når databasen är lika trasig ur kundens synvinkel.
//
// Versionen är den imagen byggdes ur (se Dockerfile). scripts/release.sh
// väntar på att den stämmer innan en driftsättning räknas som klar.

export const dynamic = "force-dynamic";

export async function GET() {
  const version = process.env.TIKKR_VERSION ?? "dev";

  try {
    await unsafeGlobalPrisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok", version });
  } catch {
    return NextResponse.json(
      { status: "error", database: "unreachable", version },
      { status: 503 }
    );
  }
}
