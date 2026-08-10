import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/admin-session";
import { buildReport, type ReportGroup } from "@/lib/report";
import { formatDate, toDecimalHours } from "@/lib/format";

/**
 * Excel-export av en rapport.
 *
 * Filen är fakturaunderlag och ska gå att arbeta vidare i, inte bara titta på.
 * Därför:
 *  - tid som DECIMALTIMMAR i egna celler, inte text som "7 tim 30 min".
 *    Excel kan summera 7,5 men inte en mening.
 *  - riktiga datum- och tidsceller, så sortering och filtrering fungerar
 *  - en flik per sammanställning, plus en med alla rader
 *  - en tydlig kolumn som markerar poster som ännu inte granskats, så att
 *    ingen råkar fakturera en gissad tid utan att veta om det
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { db, companyName } = await requireAdmin();
  const params = request.nextUrl.searchParams;

  const from = params.get("from");
  const to = params.get("to");

  const report = await buildReport(db, {
    from: from ? new Date(`${from}T00:00:00`) : undefined,
    to: to ? new Date(`${to}T23:59:59`) : undefined,
    employeeId: params.get("employeeId") ?? undefined,
    orderId: params.get("orderId") ?? undefined,
    momentId: params.get("momentId") ?? undefined,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tikkr";
  workbook.created = new Date();

  /* --- Flik 1: alla stämplingar ------------------------------------------- */

  const details = workbook.addWorksheet("Stämplingar");
  details.columns = [
    { header: "Anställd", key: "employee", width: 24 },
    { header: "Ordernummer", key: "order", width: 16 },
    { header: "Kund", key: "customer", width: 26 },
    { header: "Arbetsmoment", key: "moment", width: 20 },
    { header: "Instämplad", key: "in", width: 20 },
    { header: "Utstämplad", key: "out", width: 20 },
    { header: "Timmar", key: "hours", width: 12 },
    { header: "Anmärkning", key: "note", width: 28 },
  ];

  for (const row of report.rows) {
    const notes: string[] = [];
    if (row.ongoing) notes.push("Pågår — ej avslutad");
    if (row.needsReview) notes.push("Gissad sluttid, ej granskad");
    if (row.manual) notes.push("Tid inskriven av administratör");

    details.addRow({
      employee: row.employeeName,
      order: row.orderNumber,
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
      hours: { formula: `SUM(G2:G${lastRow})` },
    });
    total.font = { bold: true };
    total.getCell("hours").numFmt = "0.00";
  }

  styleHeader(details);
  details.views = [{ state: "frozen", ySplit: 1 }];
  details.autoFilter = { from: "A1", to: `H${Math.max(1, lastRow)}` };

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
    { header: "Timmar", key: "hours", width: 12 },
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
