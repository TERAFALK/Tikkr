import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import { evaluateAccess } from "@/lib/subscription";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  buildPayrollPeriod,
  employeesForTimesheet,
  type PayrollPeriod,
} from "@/lib/payroll";
import { buildTimesheetPdf } from "@/lib/timesheet-pdf";
import { buildAtf, type AtfBasis } from "@/lib/atf";
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
 * Utan angiven anställd tas hela personalen med, en person per sida, och den
 * som slutat men har tid i perioden. Det är så en lönekörning går till: alla på
 * en gång, i en fil. Se employeesForTimesheet.
 *
 * `rader=franvaro` ger Löneunderlaget: samma dokument med bara frånvaron i
 * raderna, utan stämplingar och raster. Summeringen är densamma. Se `rows` i
 * timesheet-pdf.ts.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { db, companyId, companyName } = await requireAdmin();
  const params = request.nextUrl.searchParams;

  // MODULGRINDEN LIGGER HÄR OCH INTE I EN LAYOUT. Rutterna under /api nås
  // aldrig via panelens layout — middleware.ts undantar dem, och den här
  // filen är hela vägen in. Ett 404 och inte ett 403: en adress till något
  // kunden inte har ska se ut som att den inte finns.
  if (!(await hasModule(companyId, "PAYROLL"))) {
    return NextResponse.json({ error: "Okänd adress." }, { status: 404 });
  }

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: {
      timezone: true,
      atfAgreement: true,
      logoWideData: true,
      logoWideMimeType: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      pastDueSince: true,
    },
  });

  // Samma lås som panelen, av samma skäl — och det behövs separat här, för
  // layoutens kontroll gäller bara sidor. Utan den går exporten att hämta med
  // en direktlänk medan panelen är låst.
  const access = evaluateAccess({
    status: company?.subscriptionStatus ?? "TRIALING",
    trialEndsAt: company?.trialEndsAt ?? null,
    pastDueSince: company?.pastDueSince ?? null,
  });

  if (access.level === "locked") {
    return NextResponse.json({ error: access.headline }, { status: 402 });
  }

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
      : await employeesForTimesheet(db, timeZone, from, to);

  if (employeeIds.length === 0) {
    return NextResponse.json(
      { error: "Ingen anställd att rapportera." },
      { status: 404 }
    );
  }

  const periods: PayrollPeriod[] = [];
  const atf: Record<string, AtfBasis | null> = {};

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
    if (!period) continue;

    periods.push(period);

    // Bara för en hel kalendermånad och bara med ett valt avtal; annars null,
    // och PDF:en visar ingen ATF. Se atf.ts.
    atf[period.employee.id] = await buildAtf(
      db,
      timeZone,
      period,
      company?.atfAgreement ?? null
    );
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

  const absenceOnly = params.get("rader") === "franvaro";

  const pdf = await buildTimesheetPdf(
    { name: companyName, timezone: timeZone, logo },
    periods,
    { rows: absenceOnly ? "absence" : "all", atf }
  );

  // Filnamnet säger vad filen är. En tidrapport ska inte kunna förväxlas med
  // ett orderunderlag i samma nedladdningsmapp.
  const kind = absenceOnly ? "loneunderlag" : "tidrapport";
  const base =
    periods.length === 1
      ? `${kind}-${slugify(periods[0].employee.name)}-${toDateInput(from, timeZone)}`
      : `${absenceOnly ? "loneunderlag" : "tidrapporter"}-${slugify(companyName)}-${toDateInput(from, timeZone)}`;

  // VISNING ELLER NEDLADDNING.
  //
  // Utskriftsknappen laddar dokumentet i en dold ram och ber webbläsaren
  // skriva ut det. En fil som kommer som `attachment` hamnar då i
  // nedladdningsmappen i stället för i skrivardialogen. Samma mönster som
  // orderexporten, se CLAUDE.md § 3.2.
  const inline = params.get("visa") === "1";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${base}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
