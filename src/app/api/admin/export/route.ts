import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/admin-session";
import { lockedExportResponse } from "@/lib/export-access";
import { buildReport, type ReportGroup } from "@/lib/report";
import { formatDate, formatDuration, toDecimalHours } from "@/lib/format";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  endOfDayIn,
  excelWallTime,
  parseLocalDate,
  startOfDayIn,
} from "@/lib/time-zone";
import { buildReportPdf, type ReportView } from "@/lib/report-pdf";
import type { ReportResult } from "@/lib/report";

/**
 * Excel-export av en rapport.
 *
 * Filen är fakturaunderlag och ska gå att arbeta vidare i, inte bara titta på.
 * Därför:
 *  - tid som DECIMALTIMMAR i egna celler, inte text som "7:30".
 *    Excel kan summera 7,5 men inte en mening.
 *  - riktiga datum- och tidsceller, så sortering och filtrering fungerar
 *  - en flik per sammanställning, plus en med alla rader
 *  - en tydlig kolumn som markerar poster som ännu inte granskats, så att
 *    ingen råkar fakturera en beräknad tid utan att veta om det
 */

export const runtime = "nodejs";

/** Företagets tidszon. `Company` nås bara genom den globala klienten. */
async function timeZoneOf(companyId: string): Promise<string> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });

  return company?.timezone ?? "Europe/Stockholm";
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  const { db, companyId, companyName } = session;
  const params = request.nextUrl.searchParams;

  // Låst prenumeration: inga uttag, se export-access.ts.
  const locked = await lockedExportResponse(session);
  if (locked) return locked;

  // DATUMEN RÄKNAS I FÖRETAGETS TIDSZON, inte i serverns.
  //
  // Stod som `new Date("2026-10-05T00:00:00")`, vilket Date tolkar i den
  // lokala zonen — och servern kör UTC. Gränsen låg därför 02:00 på
  // verkstadsgolvet om sommaren, så morgonens stämplingar föll ur arket
  // medan de syntes på skärmen. Två dokument över samma vecka med olika
  // summor, och det ena är ett fakturaunderlag.
  //
  // Samma räkning som rapportvyn gör, se rapporter/page.tsx.
  const timeZone = await timeZoneOf(companyId);

  // Datumen som de står i adressen. Används till filnamnet längre ned, där
  // "2026-10-05" är vad man vill läsa — inte en tidpunkt.
  const from = params.get("from");
  const to = params.get("to");

  const fromDate = parseLocalDate(from ?? "", timeZone);
  const toDate = parseLocalDate(to ?? "", timeZone);

  const report = await buildReport(db, {
    from: fromDate ? startOfDayIn(fromDate, timeZone) : undefined,
    to: toDate ? endOfDayIn(toDate, timeZone) : undefined,
    employeeId: params.get("employeeId") ?? undefined,
    orderId: params.get("orderId") ?? undefined,
    momentId: params.get("momentId") ?? undefined,
    // Speglar rapportvyns filter. Utelämnat betyder fakturerbar tid, så en
    // export som görs utan att någon tänkt på saken innehåller aldrig
    // improduktiv tid.
    kind:
      params.get("kind") === "INDIRECT"
        ? "INDIRECT"
        : params.get("kind") === "ALL"
          ? "ALL"
          : "ORDER",
  });

  const requested = params.get("visning");
  const view: ReportView =
    requested === "person" ||
    requested === "persondetalj" ||
    requested === "kund"
      ? requested
      : "detalj";

  if (params.get("format") === "pdf") {
    return reportAsPdf(companyId, companyName, report, params, view);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tikkr";
  workbook.created = new Date();

  /* --- Flik 1: alla stämplingar ------------------------------------------- */

  const details = workbook.addWorksheet("Stämplingar");
  details.columns = [
    { header: "Anställd", key: "employee", width: 24 },
    { header: "Anst.nr", key: "employeeNumber", width: 10 },
    { header: "Ordernummer", key: "order", width: 16 },
    { header: "Kund", key: "customer", width: 26 },
    { header: "Arbetsmoment", key: "moment", width: 20 },
    { header: "Instämplad", key: "in", width: 20 },
    { header: "Utstämplad", key: "out", width: 20 },
    // BÅDA FORMATEN, och tim:min först. Det är formatet hela systemet visar,
    // och den som jämför arket mot en skärm ska hitta samma tal utan att
    // räkna om. Decimalkolumnen står bredvid för den som ska summera eller
    // multiplicera med en timpeng, vilket inte går i tim:min.
    { header: "Tid (tim:min)", key: "duration", width: 14 },
    { header: "Timmar (decimal)", key: "hours", width: 16 },
    { header: "Anmärkning", key: "note", width: 28 },
  ];

  for (const row of report.rows) {
    const notes: string[] = [];
    if (row.ongoing) notes.push("Pågår");
    if (row.needsReview) notes.push("Beräknad sluttid, ej granskad");
    if (row.manual) notes.push("Tid inskriven av administratör");

    details.addRow({
      employee: row.employeeName,
      employeeNumber: row.employeeNumber ?? "",
      order: row.orderNumber ?? "",
      customer: row.customerName ?? "",
      moment: row.momentName,
      // I företagets tidszon, se excelWallTime. Stod som rå Date och visades
      // därför i UTC: två timmar fel på sommaren.
      in: excelWallTime(row.clockInAt, timeZone),
      out: row.clockOutAt ? excelWallTime(row.clockOutAt, timeZone) : "",
      duration: formatDuration(row.minutes),
      hours: toDecimalHours(row.minutes),
      note: notes.join(". "),
    });
  }

  details.getColumn("in").numFmt = "yyyy-mm-dd hh:mm";
  details.getColumn("out").numFmt = "yyyy-mm-dd hh:mm";
  details.getColumn("hours").numFmt = "0.00";

  // Summarad sist, med en riktig SUMMA-formel så den räknar om ifall någon
  // ändrar en rad i efterhand.
  //
  // Kolumnbokstaven hämtas ur arket och skrivs inte som en bokstav i koden.
  // Den stod som "H" och pekade fel i samma stund som en kolumn lades till
  // före den — formeln summerade då grannkolumnen, utan att något såg trasigt
  // ut.
  const lastRow = details.rowCount;
  const hoursLetter = details.getColumn("hours").letter;
  const lastLetter = details.getColumn("note").letter;

  if (lastRow > 1) {
    const total = details.addRow({
      moment: "TOTALT",
      hours: { formula: `SUM(${hoursLetter}2:${hoursLetter}${lastRow})` },
    });
    total.font = { bold: true };
    total.getCell("hours").numFmt = "0.00";
  }

  styleHeader(details);
  details.views = [{ state: "frozen", ySplit: 1 }];
  details.autoFilter = {
    from: "A1",
    to: `${lastLetter}${Math.max(1, lastRow)}`,
  };

  /* --- Flik 2–4: sammanställningar ---------------------------------------- */

  addSummarySheet(workbook, "Per order", "Order", report.byOrder, true);
  // Fliken läggs bara till när någon order i urvalet har en kund. En tom flik
  // som heter "Per kund" ser ut som att uppgifterna saknas i systemet.
  if (report.byCustomer.length > 0) {
    addSummarySheet(workbook, "Per kund", "Kund", report.byCustomer, false);
  }
  addSummarySheet(workbook, "Per anställd", "Anställd", report.byEmployee, false);
  addSummarySheet(workbook, "Per moment", "Arbetsmoment", report.byMoment, false);

  /* --- Filnamn ------------------------------------------------------------- */

  const period =
    from && to
      ? `${from}_${to}`
      : from
        ? `fran-${from}`
        : formatDate(new Date()).replace(/-/g, "");

  const fileName = `tikkr-${slug(companyName)}-${period}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileName}"`,
      // Fakturaunderlag får aldrig serveras från en gammal kopia.
      "cache-control": "no-store",
    },
  });
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  title: string,
  label: string,
  groups: ReportGroup[],
  withCustomer: boolean
) {
  const sheet = workbook.addWorksheet(title);

  sheet.columns = [
    { header: label, key: "label", width: 26 },
    ...(withCustomer
      ? [{ header: "Kund", key: "sublabel", width: 26 }]
      : []),
    { header: "Stämplingar", key: "entries", width: 14 },
    { header: "Tid (tim:min)", key: "duration", width: 14 },
    { header: "Timmar (decimal)", key: "hours", width: 16 },
  ];

  for (const group of groups) {
    sheet.addRow({
      label: group.label,
      sublabel: group.sublabel ?? "",
      entries: group.entries,
      duration: formatDuration(group.minutes),
      hours: toDecimalHours(group.minutes),
    });
  }

  sheet.getColumn("hours").numFmt = "0.00";

  if (groups.length > 0) {
    const totalMinutes = groups.reduce((sum, group) => sum + group.minutes, 0);

    const total = sheet.addRow({
      label: "TOTALT",
      entries: groups.reduce((sum, group) => sum + group.entries, 0),
      duration: formatDuration(totalMinutes),
      hours: toDecimalHours(totalMinutes),
    });
    total.font = { bold: true };
    total.getCell("hours").numFmt = "0.00";
  }

  styleHeader(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 22;
}

/** Gör ett filnamnsvänligt företagsnamn. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Rapporten som PDF.
 *
 * Excel finns för den som ska räkna vidare, PDF för den som ska läsa och
 * skriva ut. Filtren skrivs ut i klartext på pappret — en rapport utan sina
 * villkor är en siffra utan fråga, och den som hittar utskriften om ett halvår
 * ska veta vad den visar.
 */
async function reportAsPdf(
  companyId: string,
  companyName: string,
  report: ReportResult,
  params: URLSearchParams,
  view: ReportView
) {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true, logoWideData: true, logoWideMimeType: true },
  });

  const timeZone = company?.timezone ?? "Europe/Stockholm";

  const from = params.get("from");
  const to = params.get("to");

  const filterLines = [
    from || to
      ? `Period ${from ?? "start"} – ${to ?? "idag"}`
      : "Hela perioden",
    params.get("kind") === "INDIRECT"
      ? "Improduktiv tid"
      : params.get("kind") === "ALL"
        ? "Fakturerbar och improduktiv tid"
        : "Fakturerbar tid",
    view === "person"
      ? "Summerat per anställd"
      : view === "kund"
        ? "Summerat per kund"
        : view === "persondetalj"
          ? "Varje stämpling, grupperad per anställd"
          : "Varje stämpling",
  ];

  try {
    const pdf = await buildReportPdf(
      {
        name: companyName,
        timezone: timeZone,
        logo:
          company?.logoWideData && company.logoWideMimeType
            ? {
                data: Buffer.from(company.logoWideData),
                mimeType: company.logoWideMimeType,
              }
            : null,
      },
      report,
      { filterLines, view }
    );

    const period = from && to ? `${from}_${to}` : formatDate(new Date(), timeZone);

    // Utskriftsknappen ber om visning i stället för nedladdning. Ett dokument
    // som kommer som "attachment" hamnar i nedladdningsmappen i stället för i
    // skrivardialogen. Se PrintButton i panelen.
    const inline = params.get("visa") === "1";

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${
          inline ? "inline" : "attachment"
        }; filename="tikkr-rapport-${period}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Rapport-PDF kunde inte skapas", error);

    return NextResponse.json(
      { error: "PDF:en kunde inte skapas. Försök igen, eller ta ut som Excel." },
      { status: 500 }
    );
  }
}
