import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { buildPayrollPeriod, type PayrollPeriod } from "@/lib/payroll";
import { buildTimesheetPdf } from "@/lib/timesheet-pdf";
import { slugify } from "@/lib/order-export";
import {
  addDaysInZone,
  parseLocalDate,
  startOfWeekIn,
  toDateInput,
} from "@/lib/time-zone";

/**
 * TIDRAPPORT SOM PDF — LÖNEUNDERLAG.
 *
 * Egen rutt och inte ett format i orderexporten, av samma skäl som efterkalkylen
 * fick en egen: de två dokumenten har olika mottagare. Orderunderlaget går till
 * kundens kund, tidrapporten till lönekontoret — och en tidrapport som råkar
 * bifogas en faktura lämnar ut vad en namngiven person gjort varje timme.
 *
 * Utan angiven anställd tas hela personalen med, en person per sida. Det är så
 * en lönekörning går till: alla på en gång, i en fil.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { db, companyId, companyName } = await requireAdmin();
  const params = request.nextUrl.searchParams;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: {
      timezone: true,
      logoWideData: true,
      logoWideMimeType: true,
    },
  });

  const timeZone = company?.timezone ?? "Europe/Stockholm";
  const now = new Date();

  const from =
    parseLocalDate(params.get("from") ?? "", timeZone) ??
    startOfWeekIn(now, timeZone);
  const to =
    parseLocalDate(params.get("to") ?? "", timeZone) ??
    addDaysInZone(from, 6, timeZone);

  if (to < from) {
    return NextResponse.json(
      { error: "Slutdatumet ligger före startdatumet." },
      { status: 400 }
    );
  }

  const requested = params.getAll("anstalld").filter(Boolean);

  const employeeIds =
    requested.length > 0
      ? requested
      : (
          await db.employee.findMany({
            where: { active: true },
            orderBy: { name: "asc" },
            select: { id: true },
          })
        ).map((employee) => employee.id);

  if (employeeIds.length === 0) {
    return NextResponse.json(
      { error: "Ingen anställd att rapportera." },
      { status: 404 }
    );
  }

  const periods: PayrollPeriod[] = [];

  for (const employeeId of employeeIds) {
    // En i taget och inte parallellt: varje tidrapport gör flera frågor, och
    // femtio personer samtidigt skulle öppna hundratals anslutningar för att
    // spara någon sekund på en knapp man trycker en gång i veckan.
    const period = await buildPayrollPeriod(
      db,
      timeZone,
      employeeId,
      from,
      to
    );

    // En anställd som inte finns i företaget ger null. Den hoppas över
    // tyst — filtreringslagret har redan gjort sitt jobb.
    if (period) periods.push(period);
  }

  if (periods.length === 0) {
    return NextResponse.json({ error: "Hittade ingen anställd." }, { status: 404 });
  }

  const logo =
    company?.logoWideData && company.logoWideMimeType
      ? {
          data: Buffer.from(company.logoWideData),
          mimeType: company.logoWideMimeType,
        }
      : null;

  const pdf = await buildTimesheetPdf(
    { name: companyName, timezone: timeZone, logo },
    periods
  );

  // Filnamnet säger vad filen är. En tidrapport ska inte kunna förväxlas med
  // ett orderunderlag i samma nedladdningsmapp.
  const base =
    periods.length === 1
      ? `tidrapport-${slugify(periods[0].employee.name)}-${toDateInput(from, timeZone)}`
      : `tidrapporter-${slugify(companyName)}-${toDateInput(from, timeZone)}`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${base}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
