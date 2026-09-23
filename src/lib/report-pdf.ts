import PDFDocument from "pdfkit";
import type { ReportResult, ReportGroup } from "./report";
import { formatDate, formatDateTime, formatDuration } from "./format";
import { drawBarChart } from "./pdf-chart";

/**
 * RAPPORTEN SOM PDF.
 *
 * Excel finns för den som ska räkna vidare. Det här finns för den som ska
 * LÄSA: skriva ut, lägga i en pärm, ta med till ett möte. Därför staplar och
 * summeringar i stället för celler.
 *
 * Två vyer, samma dokument. "Detalj" listar varje stämpling, "Person" summerar
 * per anställd. Den som vill veta vad någon gjort i tisdags behöver den ena,
 * den som ska stämma av en månad behöver den andra, och det är samma fråga
 * med två svar — inte två rapporter.
 *
 * Inproduktiv tid får en egen stapel. Den ska synas, men aldrig blandas in i
 * det som ska faktureras — se avgränsningen i CLAUDE.md.
 */

const A4_WIDTH = 595.28;
const MARGIN = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const FOOTER_Y = 800;
const PAGE_BREAK_Y = 720;

export type ReportView = "detalj" | "person";

export interface ReportPdfCompany {
  name: string;
  timezone: string;
  logo: { data: Buffer; mimeType: string } | null;
}

export interface ReportPdfOptions {
  /** Filtren i klartext, en rad per filter. Visas under rubriken. */
  filterLines: string[];
  view: ReportView;
}

// Bredderna styrs av RUBRIKERNA, inte av värdena: "Tid (tim:min)" är bredare
// än någon siffra den rymmer. Kolumnerna har lineBreak: false, så för smalt
// klipper texten utan att det syns. Summan måste bli CONTENT_WIDTH.
const DETAIL_COLUMNS = [
  { label: "Anställd", width: 120, align: "left" as const },
  { label: "Vad", width: 145, align: "left" as const },
  { label: "Instämplad", width: 105, align: "left" as const },
  // Bara klockslaget — datumet står redan i kolumnen före.
  { label: "Slut", width: 50, align: "left" as const },
  { label: "Tid (tim:min)", width: 75, align: "right" as const },
];

const PERSON_COLUMNS = [
  { label: "Anställd", width: 270, align: "left" as const },
  { label: "Stämplingar", width: 110, align: "right" as const },
  { label: "Tid (tim:min)", width: 115, align: "right" as const },
];

export function buildReportPdf(
  company: ReportPdfCompany,
  report: ReportResult,
  options: ReportPdfOptions
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: { Title: "Tidrapport", Author: company.name },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  render(doc, company, report, options);

  doc.end();
  return finished;
}

function render(
  doc: PDFKit.PDFDocument,
  company: ReportPdfCompany,
  report: ReportResult,
  options: ReportPdfOptions
) {
  let y = MARGIN;

  /* --- Huvud --------------------------------------------------------------- */

  if (company.logo) {
    try {
      doc.image(company.logo.data, MARGIN, y, { fit: [120, 32] });
      y += 42;
    } catch {
      // En trasig bild ska inte hindra att rapporten skapas.
      y += 4;
    }
  }

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#171717");
  doc.text(company.name, MARGIN, y);
  y = doc.y + 14;

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0a0a0a");
  doc.text("Tidrapport", MARGIN, y);
  y = doc.y + 6;

  // Filtren i klartext. En rapport utan sina villkor är en siffra utan fråga,
  // och den som hittar utskriften om ett halvår ska veta vad den visar.
  doc.font("Helvetica").fontSize(9).fillColor("#737373");
  doc.text(
    [...options.filterLines, `Skapad ${formatDate(new Date(), company.timezone)}`].join(
      "   ·   "
    ),
    MARGIN,
    y,
    { width: CONTENT_WIDTH }
  );

  y = doc.y + 16;

  /* --- Summering ----------------------------------------------------------- */

  doc.rect(MARGIN, y, CONTENT_WIDTH, 54).fill("#f5f5f5");

  const stats: [string, string][] = [
    ["Att fakturera", formatDuration(report.billableMinutes)],
    ["Inproduktiv", formatDuration(report.indirectMinutes)],
    ["Stämplingar", String(report.rows.length)],
    ["Att granska", String(report.needsReviewCount)],
  ];

  const statWidth = CONTENT_WIDTH / stats.length;

  stats.forEach(([label, value], index) => {
    const x = MARGIN + statWidth * index + 10;

    doc.font("Helvetica").fontSize(8).fillColor("#737373");
    doc.text(label.toUpperCase(), x, y + 10, { width: statWidth - 20 });

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0a0a0a");
    doc.text(value, x, y + 24, { width: statWidth - 20 });
  });

  y += 66;

  if (report.ongoingCount > 0) {
    doc.font("Helvetica").fontSize(8).fillColor("#a16207");
    doc.text(
      `${report.ongoingCount} stämpling${report.ongoingCount === 1 ? "" : "ar"} ` +
        `pågår och är räknad till och med utskriftstillfället.`,
      MARGIN,
      y,
      { width: CONTENT_WIDTH }
    );
    y = doc.y + 12;
  }

  /* --- Staplar ------------------------------------------------------------- */

  y = drawGroupChart(
    doc,
    "Fördelning per arbetsmoment",
    report.byMoment,
    report.billableMinutes,
    y,
    "#2563eb"
  );

  // Egen stapel, egen färg, egen rubrik. Inproduktiv tid ska synas men aldrig
  // se ut som en del av det som ska faktureras.
  y = drawGroupChart(
    doc,
    "Inproduktiv tid",
    report.byIndirect,
    report.indirectMinutes,
    y,
    "#a16207"
  );

  /* --- Tabellen ------------------------------------------------------------ */

  if (options.view === "person") {
    y = drawPersonTable(doc, report.byEmployee, y);
  } else {
    y = drawDetailTable(doc, company, report, y);
  }

  /* --- Sidfot -------------------------------------------------------------- */

  doc.font("Helvetica").fontSize(7).fillColor("#a3a3a3");
  doc.text("Tidrapport skapad med Tikkr", MARGIN, FOOTER_Y, {
    width: CONTENT_WIDTH,
    align: "center",
  });
}

/** En stapel per grupp, eller ingenting när gruppen är tom. */
function drawGroupChart(
  doc: PDFKit.PDFDocument,
  title: string,
  groups: ReportGroup[],
  totalMinutes: number,
  startY: number,
  barColor: string
): number {
  if (groups.length === 0 || totalMinutes <= 0) return startY;

  return drawBarChart(doc, {
    title,
    items: groups.map((group) => ({
      label: group.label,
      value: group.minutes,
      valueText: `${formatDuration(group.minutes)} · ${Math.round(
        (group.minutes / totalMinutes) * 100
      )} %`,
    })),
    startY,
    marginLeft: MARGIN,
    contentWidth: CONTENT_WIDTH,
    pageWidth: A4_WIDTH,
    bottomLimit: PAGE_BREAK_Y,
    pageTopY: MARGIN,
    barColor,
  });
}

/** Summerat per anställd. Svaret på "hur mycket har var och en lagt ner". */
function drawPersonTable(
  doc: PDFKit.PDFDocument,
  groups: ReportGroup[],
  startY: number
): number {
  let y = startY + 6;

  if (groups.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#737373");
    doc.text("Ingen registrerad tid i perioden.", MARGIN, y);
    return doc.y + 10;
  }

  y = drawHead(doc, PERSON_COLUMNS, y);
  doc.font("Helvetica").fontSize(9);

  let totalMinutes = 0;
  let totalEntries = 0;

  for (const group of groups) {
    if (y + 20 > PAGE_BREAK_Y) {
      doc.addPage();
      y = drawHead(doc, PERSON_COLUMNS, MARGIN);
      doc.font("Helvetica").fontSize(9);
    }

    totalMinutes += group.minutes;
    totalEntries += group.entries;

    drawRow(
      doc,
      PERSON_COLUMNS,
      [
        group.sublabel ? `${group.label} (${group.sublabel})` : group.label,
        String(group.entries),
        formatDuration(group.minutes),
      ],
      y
    );

    y += 20;
    line(doc, y);
  }

  return drawTotal(
    doc,
    PERSON_COLUMNS,
    ["TOTALT", String(totalEntries), formatDuration(totalMinutes)],
    y
  );
}

/** Varje stämpling på egen rad. Svaret på "vad gjorde hen i tisdags". */
function drawDetailTable(
  doc: PDFKit.PDFDocument,
  company: ReportPdfCompany,
  report: ReportResult,
  startY: number
): number {
  let y = startY + 6;

  if (report.rows.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#737373");
    doc.text("Ingen registrerad tid i perioden.", MARGIN, y);
    return doc.y + 10;
  }

  y = drawHead(doc, DETAIL_COLUMNS, y);
  doc.font("Helvetica").fontSize(9);

  for (const row of report.rows) {
    if (y + 20 > PAGE_BREAK_Y) {
      doc.addPage();
      y = drawHead(doc, DETAIL_COLUMNS, MARGIN);
      doc.font("Helvetica").fontSize(9);
    }

    drawRow(
      doc,
      DETAIL_COLUMNS,
      [
        row.employeeNumber
          ? `${row.employeeName} (${row.employeeNumber})`
          : row.employeeName,
        row.label,
        formatDateTime(row.clockInAt, company.timezone),
        row.ongoing ? "pågår" : formatDateTime(row.clockOutAt!, company.timezone).slice(11),
        formatDuration(row.minutes),
      ],
      y,
      row.billable ? "#404040" : "#a16207"
    );

    y += 20;
    line(doc, y);
  }

  return drawTotal(
    doc,
    DETAIL_COLUMNS,
    ["TOTALT", "", "", "", formatDuration(report.totalMinutes)],
    y
  );
}

/* --- Ritverktyg som båda tabellerna delar --------------------------------- */

type Column = { label: string; width: number; align: "left" | "right" };

function drawHead(
  doc: PDFKit.PDFDocument,
  columns: Column[],
  y: number
): number {
  doc.rect(MARGIN, y, CONTENT_WIDTH, 22).fill("#0a0a0a");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff");

  let x = MARGIN + 8;
  for (const column of columns) {
    doc.text(column.label, x, y + 7, {
      width: column.width - 12,
      align: column.align,
      lineBreak: false,
    });
    x += column.width;
  }

  return y + 22;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  columns: Column[],
  values: string[],
  y: number,
  color = "#404040"
) {
  doc.font("Helvetica").fontSize(9).fillColor(color);

  let x = MARGIN + 8;
  values.forEach((value, index) => {
    doc.text(value, x, y + 6, {
      width: columns[index].width - 12,
      align: columns[index].align,
      lineBreak: false,
    });
    x += columns[index].width;
  });
}

function drawTotal(
  doc: PDFKit.PDFDocument,
  columns: Column[],
  values: string[],
  y: number
): number {
  if (y + 26 > PAGE_BREAK_Y) {
    doc.addPage();
    y = MARGIN;
  }

  doc.rect(MARGIN, y, CONTENT_WIDTH, 24).fill("#f5f5f5");
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0a0a0a");

  let x = MARGIN + 8;
  values.forEach((value, index) => {
    doc.text(value, x, y + 7, {
      width: columns[index].width - 12,
      align: columns[index].align,
      lineBreak: false,
    });
    x += columns[index].width;
  });

  return y + 32;
}

function line(doc: PDFKit.PDFDocument, y: number) {
  doc
    .moveTo(MARGIN, y)
    .lineTo(A4_WIDTH - MARGIN, y)
    .strokeColor("#f0f0f0")
    .stroke();
}
