import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getOrderExports, slugify, type OrderExport } from "@/lib/order-export";
import { getOrderCalcs } from "@/lib/order-calc";
import { buildOrderPdf, type PdfCompany } from "@/lib/pdf";
import { buildOrderCalcPdf } from "@/lib/calc-pdf";
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
 * Kalkyl är något annat: ett INTERNT underlag med självkostnad, påslag och
 * pris. Det har egen datahämtning (order-calc.ts) och egen ritning
 * (calc-pdf.ts), och delar inte en rad med de två andra. Se toppkommentaren i
 * calc-pdf.ts för varför de hålls isär.
 *
 * Flera ordrar ger EN fil i samtliga fall. Tio separata filer skulle bli tio
 * bilagor att hålla reda på, och en PDF med tio sidor skrivs ut i ett svep.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { db, companyId, companyName } = await requireAdmin();
  const params = request.nextUrl.searchParams;

  const requested = params.get("format");
  const format =
    requested === "excel" ? "excel" : requested === "kalkyl" ? "kalkyl" : "pdf";
  const orderIds = params.getAll("order").filter(Boolean);

  if (orderIds.length === 0) {
    return NextResponse.json({ error: "Ingen order vald." }, { status: 400 });
  }

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: {
      timezone: true,
      // Standardpåslaget. Ordern kan ha ett eget som gäller före detta.
      markupPercent: true,
      // Bara den breda används på utskrifter. Märket i panelen är fyrkantigt
      // och skulle bli en klump i ett brevhuvud.
      logoWideData: true,
      logoWideMimeType: true,
    },
  });

  const timeZone = company?.timezone ?? "Europe/Stockholm";

  const logo =
    company?.logoWideData && company.logoWideMimeType
      ? {
          data: Buffer.from(company.logoWideData),
          mimeType: company.logoWideMimeType,
        }
      : null;

  /* --- Kalkyl: eget spår hela vägen --------------------------------------- */

  if (format === "kalkyl") {
    const calcs = await getOrderCalcs(
      db,
      orderIds,
      company?.markupPercent ?? 100
    );

    if (calcs.length === 0) {
      return NextResponse.json(
        { error: "Hittade ingen order." },
        { status: 404 }
      );
    }

    // Filnamnet säger vad filen är. Ett "order-1001.pdf" i mappen bredvid ett
    // annat "order-1001.pdf" är precis den förväxling som inte får ske här.
    const calcBase =
      calcs.length === 1
        ? `efterkalkyl-${slugify(calcs[0].orderNumber)}`
        : `efterkalkyler-${slugify(companyName)}-${formatDate(new Date(), timeZone)}`;

    try {
      const pdf = await buildOrderCalcPdf(
        { name: companyName, timezone: timeZone, logo },
        calcs
      );

      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${calcBase}.pdf"`,
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      console.error("Efterkalkylen kunde inte skapas", error);

      return NextResponse.json(
        {
          error:
            "Efterkalkylen kunde inte skapas. Felet står i serverloggen.",
        },
        { status: 500 }
      );
    }
  }

  /* --- Tidsunderlag: PDF eller Excel -------------------------------------- */

  // Både öppna och stängda ordrar går att exportera. En färdig order är ofta
  // den man vill titta på — "hur lång tid tog ett liknande jobb förra gången"
  // är hela poängen med att spara tiden.
  const orders = await getOrderExports(db, orderIds);

  if (orders.length === 0) {
    return NextResponse.json({ error: "Hittade ingen order." }, { status: 404 });
  }

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
    logo,
  };

  try {
    const pdf = await buildOrderPdf(pdfCompany, orders);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileBase}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    // Ett tyst fel här ser ut som att knappen inte gör något. Skriv ut det som
    // faktiskt hände i loggen och svara med något begripligt.
    console.error("PDF kunde inte skapas", error);

    return NextResponse.json(
      {
        error:
          "PDF:en kunde inte skapas. Felet står i serverloggen. Excel-exporten fungerar under tiden.",
      },
      { status: 500 }
    );
  }
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
      { header: "Timmar (decimal)", key: "hours", width: 16 },
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
      "Anst.nr",
      "Arbetsmoment",
      "Instämplad",
      "Utstämplad",
      "Timmar (decimal)",
      "Anmärkning",
    ];

    sheet.columns = [
      { width: 24 }, // A Anställd
      { width: 10 }, // B Anst.nr
      { width: 20 }, // C Arbetsmoment
      { width: 19 }, // D Instämplad
      { width: 19 }, // E Utstämplad
      { width: 16 }, // F Timmar (decimal)
      { width: 26 }, // G Anmärkning
    ];

    for (const row of order.rows) {
      const notes: string[] = [];
      if (row.ongoing) notes.push("Pågår");
      if (row.needsReview) notes.push("Gissad sluttid");
      if (row.manual) notes.push("Inlagd för hand");

      sheet.addRow([
        row.employeeName,
        row.employeeNumber ?? "",
        row.momentName,
        row.clockInAt,
        row.clockOutAt ?? "",
        toDecimalHours(row.minutes),
        notes.join(". "),
      ]);
    }

    const lastRow = sheet.rowCount;
    if (lastRow > 4) {
      // Kolumnerna är A Anställd, B Anst.nr, C Arbetsmoment, D Instämplad,
      // E Utstämplad, F Timmar, G Anmärkning. Summan hör till F — en tom
      // plats för lite här gav tidigare en summa av utstämplingstiderna.
      const total = sheet.addRow([
        "TOTALT",
        "",
        "",
        "",
        "",
        { formula: `SUM(F5:F${lastRow})` },
        "",
      ]);
      total.font = { bold: true };
    }

    sheet.getColumn(4).numFmt = "yyyy-mm-dd hh:mm"; // D Instämplad
    sheet.getColumn(5).numFmt = "yyyy-mm-dd hh:mm"; // E Utstämplad
    sheet.getColumn(6).numFmt = "0.00";             // F Timmar

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
