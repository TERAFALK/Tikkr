import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/admin-session";
import { buildReport, type ReportGroup } from "@/lib/report";
import { formatDate, toDecimalHours } from "@/lib/format";
import { unsafeGlobalPrisma } from "@/lib/db";
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

export async function GET(request: NextRequest) {
  const { db, companyId, companyName } = await requireAdmin();
  const params = request.nextUrl.searchParams;

  const from = params.get("from");
  const to = params.get("to");

  const report = await buildReport(db, {
    from: from ? new Date(`${from}T00:00:00`) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
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
    requested === "person" || requested === "persondetalj"
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
    { header: "Timmar (decimal)", key: "hours", width: 16 },
    { header: "Anmärkning", key: "note", width: 28 },
  ];

  for (const row of report.rows) {
    const notes: string[] = [];
    if (row.ongoing) notes.push("Pågår — ej avslutad");
    if (row.needsReview) notes.push("Beräknad sluttid, ej granskad");
    if (row.manual) notes.push("Tid inskriven av administratör");

    details.addRow({
      employee: row.employeeName,
      employeeNumber: row.employeeNumber ?? "",
      order: row.orderNumber ?? "",
      customer: row.customerName ?? "",
      moment: row.momentName,
      in: row.clockInAt,
      out: row.clockOutAt ?? "",
      hours: toDecimalHours(row.minutes),
      note: notes.join(". "),
    });
  }

  details.getColumn("in").numFmt = "yyyy-mm-dd hh:mm";
  details.getColumn("out").numFmt = "yyyy-mm-dd hh:mm";
  details.getColumn("hours").numFmt = "0.00";

  // Summarad sist, med en riktig SUMMA-formel så den räknar om ifall någon
  // ändrar en rad i efterhand.
  const lastRow = details.rowCount;
  if (lastRow > 1) {
    const total = details.addRow({
      moment: "TOTALT",
      hours: { formula: `SUM(H2:H${lastRow})` },
    });
    total.font = { bold: true };
    total.getCell("hours").numFmt = "0.00";
  }

  styleHeader(details);
  details.views = [{ state: "frozen", ySplit: 1 }];
  details.autoFilter = { from: "A1", to: `I${Math.max(1, lastRow)}` };

  /* --- Flik 2–4: sammanställningar ---------------------------------------- */

  addSummarySheet(workbook, "Per order", "Order", report.byOrder, true);
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
    { header: "Timmar (decimal)", key: "hours", width: 16 },
  ];

  for (const group of groups) {
    sheet.addRow({
      label: group.label,
      sublabel: group.sublabel ?? "",
      entries: group.entries,
      hours: toDecimalHours(group.minutes),
    });
  }

  sheet.getColumn("hours").numFmt = "0.00";

  if (groups.length > 0) {
    const total = sheet.addRow({
      label: "TOTALT",
      entries: groups.reduce((sum, group) => sum + group.entries, 0),
      hours: toDecimalHours(
        groups.reduce((sum, group) => sum + group.minutes, 0)
      ),
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

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="tikkr-rapport-${period}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("Rapport-PDF kunde inte skapas", error);

    return NextResponse.json(
      {
        error:
          "PDF:en kunde inte skapas. Felet står i serverloggen. Excel-exporten fungerar under tiden.",
      },
      { status: 500 }
    );
  }
}
