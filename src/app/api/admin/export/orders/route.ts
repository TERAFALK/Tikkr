import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getOrderExports, slugify, type OrderExport } from "@/lib/order-export";
import { buildOrderPdf, type PdfCompany } from "@/lib/pdf";
import { formatDate, toDecimalHours } from "@/lib/format";

/**
 * Underlag per order, som PDF eller Excel.
 *
 * PDF är dokumentet man bifogar en faktura — en order per sida, med kundens
 * logotyp överst och summan sist.
 *
 * Excel är samma innehåll men att räkna vidare på: en flik per order plus en
 * sammanställning först.
 *
 * Flera ordrar ger EN fil i båda fallen. Tio separata filer skulle bli tio
 * bilagor att hålla reda på, och en PDF med tio sidor skrivs ut i ett svep.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { db, companyId, companyName } = await requireAdmin();
  const params = request.nextUrl.searchParams;

  const format = params.get("format") === "excel" ? "excel" : "pdf";
  let orderIds = params.getAll("order").filter(Boolean);

  // Inga markerade — ta alla öppna. Att svara med ett felmeddelande när någon
  // trycker på exportknappen utan att ha kryssat i något vore korrekt men
  // ovänligt; det de vill ha är nästan alltid allt.
  if (orderIds.length === 0) {
    const open = await db.order.findMany({
      where: { status: "OPEN" },
      select: { id: true },
    });
    orderIds = open.map((order) => order.id);
  }

  const orders = await getOrderExports(db, orderIds);

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: {
      timezone: true,
      logoData: true,
      logoMimeType: true,
    },
  });

  const timeZone = company?.timezone ?? "Europe/Stockholm";

  const fileBase =
    orders.length === 1
      ? `order-${slugify(orders[0].orderNumber)}`
      : `ordrar-${slugify(companyName)}-${formatDate(new Date(), timeZone)}`;

  if (format === "excel") {
    const workbook = await buildWorkbook(companyName, timeZone, orders);
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fileBase}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  }

  const pdfCompany: PdfCompany = {
    name: companyName,
    timezone: timeZone,
    logo:
      company?.logoData && company.logoMimeType
        ? {
            data: Buffer.from(company.logoData),
            mimeType: company.logoMimeType,
          }
        : null,
  };

  const pdf = await buildOrderPdf(pdfCompany, orders);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fileBase}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

async function buildWorkbook(
  companyName: string,
  timeZone: string,
  orders: OrderExport[]
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tikkr";
  workbook.created = new Date();

  // Sammanställningen först, så den som öppnar filen ser helheten innan
  // detaljerna. Hoppas över när det bara finns en order — då vore den bara
  // en extra flik att klicka förbi.
  if (orders.length > 1) {
    const summary = workbook.addWorksheet("Sammanställning");
    summary.columns = [
      { header: "Order", key: "order", width: 16 },
      { header: "Kund", key: "customer", width: 28 },
      { header: "Stämplingar", key: "entries", width: 14 },
      { header: "Timmar", key: "hours", width: 12 },
    ];

    for (const order of orders) {
      summary.addRow({
        order: order.orderNumber,
        customer: order.customerName ?? "",
        entries: order.rows.length,
        hours: toDecimalHours(order.totalMinutes),
      });
    }

    const total = summary.addRow({
      order: "TOTALT",
      entries: orders.reduce((sum, order) => sum + order.rows.length, 0),
      hours: toDecimalHours(
        orders.reduce((sum, order) => sum + order.totalMinutes, 0)
      ),
    });
    total.font = { bold: true };

    summary.getColumn("hours").numFmt = "0.00";
    styleHeader(summary);
  }

  for (const order of orders) {
    // Fliknamn får inte innehålla vissa tecken och max vara 31 tecken.
    const name = `${order.orderNumber} ${order.customerName ?? ""}`
      .replace(/[\\/*?:[\]]/g, " ")
      .trim()
      .slice(0, 31);

    const sheet = workbook.addWorksheet(name || order.orderNumber);

    sheet.mergeCells("A1:E1");
    const title = sheet.getCell("A1");
    title.value = order.customerName
      ? `Order ${order.orderNumber} — ${order.customerName}`
      : `Order ${order.orderNumber}`;
    title.font = { bold: true, size: 14 };

    sheet.mergeCells("A2:E2");
    sheet.getCell("A2").value = `${companyName} · underlag skapat ${formatDate(new Date(), timeZone)}`;
    sheet.getCell("A2").font = { color: { argb: "FF737373" }, size: 9 };

    sheet.getRow(4).values = [
      "Anställd",
      "Arbetsmoment",
      "Instämplad",
      "Utstämplad",
      "Timmar",
      "Anmärkning",
    ];

    sheet.columns = [
      { width: 24 },
      { width: 20 },
      { width: 19 },
      { width: 19 },
      { width: 10 },
      { width: 26 },
    ];

    for (const row of order.rows) {
      const notes: string[] = [];
      if (row.ongoing) notes.push("Pågår");
      if (row.needsReview) notes.push("Gissad sluttid");
      if (row.manual) notes.push("Inlagd för hand");

      sheet.addRow([
        row.employeeName,
        row.momentName,
        row.clockInAt,
        row.clockOutAt ?? "",
        toDecimalHours(row.minutes),
        notes.join(". "),
      ]);
    }

    const lastRow = sheet.rowCount;
    if (lastRow > 4) {
      const total = sheet.addRow([
        "TOTALT",
        "",
        "",
        "",
        { formula: `SUM(E5:E${lastRow})` },
        "",
      ]);
      total.font = { bold: true };
    }

    sheet.getColumn(3).numFmt = "yyyy-mm-dd hh:mm";
    sheet.getColumn(4).numFmt = "yyyy-mm-dd hh:mm";
    sheet.getColumn(5).numFmt = "0.00";

    const header = sheet.getRow(4);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0A0A0A" },
    };
    header.height = 20;

    sheet.views = [{ state: "frozen", ySplit: 4 }];
  }

  return workbook;
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0A0A0A" },
  };
  header.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}
