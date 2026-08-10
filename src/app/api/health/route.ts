import { NextResponse } from "next/server";
import { unsafeGlobalPrisma } from "@/lib/db";

// Hälsokoll för uptime-övervakning (t.ex. UptimeRobot) och för Dockers
// healthcheck. Den svarar 200 bara om appen OCH databasen svarar — en app som
// lever men inte når databasen är lika trasig ur kundens synvinkel.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await unsafeGlobalPrisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch {
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503 }
    );
  }
}
