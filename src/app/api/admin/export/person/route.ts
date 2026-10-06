import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { companyTimeZone } from "@/lib/company";
import { buildPersonExport } from "@/lib/person-export";

/**
 * REGISTERUTDRAG FÖR EN ANSTÄLLD. Se person-export.ts.
 *
 * INGET PRENUMERATIONSLÅS, till skillnad från de andra uttagen. Rätten att
 * få veta vad som finns registrerat om sig gäller oavsett om kundens faktura
 * till oss är betald, och arbetsgivaren ska kunna svara på en begäran även
 * med en låst panel.
 *
 * Supportläget släpps igenom: uttaget läser bara.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { db, companyId } = await requireAdmin();

  const employeeId = request.nextUrl.searchParams.get("employeeId") ?? "";
  if (!employeeId) {
    return NextResponse.json({ error: "Välj en anställd." }, { status: 400 });
  }

  const result = await buildPersonExport(
    db,
    employeeId,
    await companyTimeZone(companyId)
  );

  if (!result) {
    return NextResponse.json({ error: "Personen finns inte." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.data), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${result.fileName}"`,
      // Personuppgifter ska aldrig ligga kvar i en mellanlagring.
      "cache-control": "no-store",
    },
  });
}
