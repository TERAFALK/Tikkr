import PDFDocument from "pdfkit";
import type { OrderCalc } from "./order-calc";
import { formatDate, formatDuration } from "./format";
import { formatCurrency, formatMarkup } from "./money";
import { drawBarChart } from "./pdf-chart";

/**
 * KALKYL SOM PDF — INTERNT UNDERLAG.
 *
 * Det här dokumentet innehåller självkostnad, påslag och marginal. Det ska
 * ALDRIG skickas till kundens kund. Tidsunderlaget i pdf.ts är dokumentet som
 * går vidare; det innehåller tid och inga belopp alls.
 *
 * Därför två skilda filer med varsin knapp i gränssnittet, i stället för ett
 * dokument med ett läge. Ett läge är något man kan glömma att slå av. Två
 * knappar kräver att man trycker på fel.
 *
 * Utseendet skiljer sig med flit: ett svart band överst där det står vad
 * dokumentet är. Den som håller pappret i handen ska se skillnaden på en meter
 * utan att läsa rubriken.
 */

const A4_WIDTH = 595.28;
const MARGIN = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const FOOTER_Y = 800;

export interface CalcCompany {
  name: string;
  timezone: string;
  logo: { data: Buffer; mimeType: string } | null;
}

const COLUMNS = [
  { label: "Arbetsmoment", width: 175, align: "left" as const },
  { label: "Tid (tim:min)", width: 100, align: "right" as const },
  { label: "Timkostnad", width: 110, align: "right" as const },
  { label: "Kostnad", width: 110, align: "right" as const },
];

export function buildOrderCalcPdf(
  company: CalcCompany,
  orders: OrderCalc[]
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: {
      Title:
        orders.length === 1 ? `Kalkyl order ${orders[0].orderNumber}` : "Kalkyl",
      Author: company.name,
    },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  orders.forEach((order, index) => {
    if (index > 0) doc.addPage();
    renderCalc(doc, company, order);
  });

  if (orders.length === 0) {
    doc
      .fontSize(11)
      .fillColor("#525252")
      .text("Inga ordrar valda.", MARGIN, MARGIN);
  }

  doc.end();
  return finished;
}

function renderCalc(
  doc: PDFKit.PDFDocument,
  company: CalcCompany,
  order: OrderCalc
) {
  let y = MARGIN;

  /* --- Märkning, logotyp och rubrik --------------------------------------- */

  // Bandet först av allt, före logotypen. Det ska inte gå att missa vad man
  // håller i, och en logotyp överst får ett papper att se ut som något man
  // skickar vidare.
  doc.rect(MARGIN, y, CONTENT_WIDTH, 20).fill("#0a0a0a");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");
  doc.text("INTERNT UNDERLAG — INNEHÅLLER SJÄLVKOSTNAD", MARGIN + 8, y + 6, {
    width: CONTENT_WIDTH - 16,
  });
  y += 32;

  if (company.logo) {
    try {
      doc.image(company.logo.data, MARGIN, y, { fit: [120, 32] });
      y += 42;
    } catch {
      // En trasig bild ska inte hindra att kalkylen skapas.
      y += 4;
    }
  }

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#171717");
  doc.text(company.name, MARGIN, y);
  y = doc.y + 14;

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0a0a0a");
  doc.text(`Kalkyl order ${order.orderNumber}`, MARGIN, y);
  y = doc.y + 2;

  if (order.customerName) {
    doc.font("Helvetica").fontSize(13).fillColor("#525252");
    doc.text(order.customerName, MARGIN, y);
    y = doc.y;
  }

  y += 10;

  const period =
    order.firstEntryAt && order.lastEntryAt
      ? `${formatDate(order.firstEntryAt, company.timezone)} – ${formatDate(order.lastEntryAt, company.timezone)}`
      : "Ingen registrerad tid";

  doc.font("Helvetica").fontSize(9).fillColor("#737373");
  doc.text(
    `Period: ${period}   ·   Kalkyl skapad ${formatDate(new Date(), company.timezone)}`,
    MARGIN,
    y
  );

  y = doc.y + 16;

  /* --- Tabell -------------------------------------------------------------- */

  y = drawTableHead(doc, y);
  doc.font("Helvetica").fontSize(9);

  for (const row of order.rows) {
    if (y > 700) {
      doc.addPage();
      y = drawTableHead(doc, MARGIN);
      doc.font("Helvetica").fontSize(9);
    }

    const values = [
      row.momentName,
      formatDuration(row.minutes),
      row.costRateOre === null ? "—" : `${formatCurrency(row.costRateOre)}/tim`,
      row.costOre === null ? "saknas" : formatCurrency(row.costOre),
    ];

    let x = MARGIN + 8;
    values.forEach((value, index) => {
      // Raden utan timkostnad markeras i gult. Den är inte ett fel, men den är
      // ett hål i summan, och det ska synas på raden och inte bara i en
      // anmärkning längst ner som ögat hoppar över.
      doc.fillColor(
        row.costRateOre === null && index >= 2 ? "#a16207" : "#404040"
      );
      doc.text(value, x, y + 6, {
        width: COLUMNS[index].width - 12,
        align: COLUMNS[index].align,
        lineBreak: false,
      });
      x += COLUMNS[index].width;
    });

    y += 20;
    doc
      .moveTo(MARGIN, y)
      .lineTo(A4_WIDTH - MARGIN, y)
      .strokeColor("#e5e5e5")
      .stroke();
  }

  /* --- Summering ----------------------------------------------------------- */

  if (y > 640) {
    doc.addPage();
    y = MARGIN;
  }

  y += 10;

  y = drawSumLine(
    doc,
    y,
    "Total tid (tim:min)",
    formatDuration(order.totalMinutes)
  );
  y = drawSumLine(doc, y, "Total kostnad", formatCurrency(order.totalCostOre));

  // Påslaget visas bara när det är påslaget som ger priset. På en
  // fastprisorder är det inte påslaget som bestämt något, och att visa det
  // hade sett ut som en uträkning som inte stämmer.
  if (!order.priceIsFixed) {
    y = drawSumLine(
      doc,
      y,
      `Påslag ${formatMarkup(order.markupPercent)}${
        order.markupFromOrder ? " (satt på ordern)" : ""
      }`,
      formatCurrency(order.profitOre)
    );
  }

  y += 4;
  doc.rect(MARGIN, y, CONTENT_WIDTH, 30).fill("#0a0a0a");
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffffff");
  doc.text(order.priceIsFixed ? "KUNDPRIS (FAST)" : "PRIS", MARGIN + 8, y + 9, {
    width: 240,
  });
  doc.text(formatCurrency(order.priceOre), A4_WIDTH - MARGIN - 218, y + 9, {
    width: 210,
    align: "right",
  });
  y += 38;

  // Vinsten står under priset och bara på fastprisordrar. På en löpande order
  // är vinsten per definition påslaget, och att upprepa samma tal med ett
  // annat namn får ett papper att se ut som om det säger mer än det gör.
  if (order.priceIsFixed) {
    y = drawSumLine(doc, y, "Vinst i kronor", formatCurrency(order.profitOre));
    y = drawSumLine(
      doc,
      y,
      "Vinst i procent av självkostnad",
      order.profitPercent === null ? "—" : `${order.profitPercent} %`
    );
    y += 6;
  }

  /* --- Anmärkningar -------------------------------------------------------- */

  const notes: string[] = [];

  if (order.minutesWithoutRate > 0) {
    notes.push(
      `${formatDuration(order.minutesWithoutRate)} (tim:min) saknar timkostnad ` +
        `och ingår inte i summan, som därför är lägre än den verkliga ` +
        `kostnaden. ` +
        `Fyll i timkostnad på arbetsmomentet — nya stämplingar får den då ` +
        `automatiskt, medan redan registrerad tid behåller sitt gamla underlag`
    );
  }

  if (order.ongoingCount > 0) {
    notes.push(
      `${order.ongoingCount} stämpling${
        order.ongoingCount === 1 ? "" : "ar"
      } pågår och är räknad till och med utskriftstillfället`
    );
  }

  if (order.ungradedCount > 0) {
    notes.push(
      `${order.ungradedCount} post${
        order.ungradedCount === 1 ? "" : "er"
      } har en sluttid beräknad av systemet och är ännu inte granskad`
    );
  }

  if (notes.length > 0) {
    doc.font("Helvetica").fontSize(8).fillColor("#a16207");
    doc.text(`Anmärkning: ${notes.join(". ")}.`, MARGIN, y, {
      width: CONTENT_WIDTH,
    });
    y = doc.y + 16;
  }

  /* --- Fördelning ---------------------------------------------------------- */

  const withCost = order.rows.filter((row) => row.costOre !== null);

  if (order.totalCostOre > 0) {
    drawBarChart(doc, {
      title: "Kostnad per arbetsmoment",
      items: withCost.map((row) => ({
        label: row.momentName,
        value: row.costOre ?? 0,
        valueText: `${formatCurrency(row.costOre ?? 0)} · ${Math.round(
          ((row.costOre ?? 0) / order.totalCostOre) * 100
        )} %`,
      })),
      startY: y,
      marginLeft: MARGIN,
      contentWidth: CONTENT_WIDTH,
      pageWidth: A4_WIDTH,
      bottomLimit: FOOTER_Y - 40,
      pageTopY: MARGIN,
      // Mörkare än tidsunderlagets blå. Kronor och timmar ska inte se likadana
      // ut när man bläddrar mellan de två dokumenten.
      barColor: "#0f172a",
    });
  }

  /* --- Sidfot -------------------------------------------------------------- */

  doc.font("Helvetica").fontSize(7).fillColor("#a3a3a3");
  doc.text(
    "Internt underlag skapat med Tikkr — innehåller självkostnad och marginal",
    MARGIN,
    FOOTER_Y,
    { width: CONTENT_WIDTH, align: "center" }
  );
}

function drawTableHead(doc: PDFKit.PDFDocument, y: number): number {
  doc.rect(MARGIN, y, CONTENT_WIDTH, 22).fill("#0a0a0a");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");

  let x = MARGIN + 8;
  for (const column of COLUMNS) {
    doc.text(column.label, x, y + 7, {
      width: column.width - 12,
      align: column.align,
    });
    x += column.width;
  }

  return y + 22;
}

/** En rad i summeringen: etikett till vänster, belopp till höger. */
function drawSumLine(
  doc: PDFKit.PDFDocument,
  y: number,
  label: string,
  value: string
): number {
  doc.font("Helvetica").fontSize(10).fillColor("#404040");
  doc.text(label, MARGIN + 8, y, { width: 280 });
  doc.text(value, A4_WIDTH - MARGIN - 218, y, { width: 210, align: "right" });

  return y + 18;
}
