import PDFDocument from "pdfkit";
import type { PayrollPeriod } from "./payroll";
import { ABSENCE_LABELS } from "./absence";
import { formatDate, formatDecimalHours, formatTime } from "./format";
import { drawFooter } from "./pdf-footer";

/**
 * TIDRAPPORTEN SOM PDF — LÖNEUNDERLAGET.
 *
 * Ett annat dokument än orderunderlaget, med en annan mottagare. Det här går
 * till lönekontoret och ska aldrig skickas till en kund: det visar vad en
 * namngiven person gjort varje timme av sin vecka.
 *
 * LAYOUTEN FÖLJER KUNDENS GAMLA RAPPORT. Den har lästs i tio år, och en
 * sammanställning som står i en annan ordning blir läst fel innan den blir
 * läst rätt. Därför samma block, i samma följd: raderna per dag, dagssumman,
 * periodsumman, och sammanställningen längst ner med planerad tid, närvarotid,
 * produktiv och improduktiv tid, flex och komp — och sist vad den improduktiva
 * tiden gick till.
 *
 * TID SKRIVS SOM DECIMALTIMMAR i sammanställningen (33,75) och som klockslag i
 * raderna (06:23). Det är inte en inkonsekvens utan kundens eget format: de
 * summerar vidare på sammanställningen i Excel, och 33:45 går inte att
 * addera. Klockslagen skrivs däremot som klockslag och inte som "6,23" — den
 * gamla rapportens sätt att skriva 06:23 som ett decimaltal är en fälla som
 * inte ska ärvas.
 *
 * INGA BELOPP. Varken timkostnad, lön eller lönearter. Tikkr räknar tid; vad
 * tiden är värd avgörs av kollektivavtalet i lönesystemet.
 */

const A4_WIDTH = 595.28;
const FOOTER_Y = 800;
const MARGIN = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

export interface TimesheetCompany {
  name: string;
  timezone: string;
  logo: { data: Buffer; mimeType: string } | null;
}

export function buildTimesheetPdf(
  company: TimesheetCompany,
  periods: PayrollPeriod[]
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: {
      Title:
        periods.length === 1
          ? `Tidrapport ${periods[0].employee.name}`
          : "Tidrapport",
      Author: company.name,
    },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  periods.forEach((period, index) => {
    if (index > 0) doc.addPage();
    renderPeriod(doc, company, period);
  });

  if (periods.length === 0) {
    doc
      .fontSize(11)
      .fillColor("#525252")
      .text("Ingen anställd vald.", MARGIN, MARGIN);
  }

  doc.end();
  return finished;
}

function renderPeriod(
  doc: PDFKit.PDFDocument,
  company: TimesheetCompany,
  period: PayrollPeriod
) {
  const tz = company.timezone;
  let y = MARGIN;

  /* --- Sidhuvud ----------------------------------------------------------- */

  if (company.logo) {
    try {
      doc.image(company.logo.data, MARGIN, y, { fit: [130, 34] });
      y += 44;
    } catch {
      // En trasig bild ska inte hindra att tidrapporten skapas.
      y += 4;
    }
  }

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0a0a0a");
  doc.text("Tidrapport", MARGIN, y);

  // Anställningsnumret till höger, som i kundens rapport. Det är så två
  // personer med samma namn hålls isär i lönekörningen.
  if (period.employee.employeeNumber) {
    doc.font("Helvetica").fontSize(10).fillColor("#525252");
    doc.text("Anställd", A4_WIDTH - MARGIN - 160, y + 4, {
      width: 100,
      align: "right",
    });
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#0a0a0a");
    doc.text(period.employee.employeeNumber, A4_WIDTH - MARGIN - 60, y, {
      width: 60,
      align: "right",
    });
  }

  y = doc.y + 10;

  doc.rect(MARGIN, y, CONTENT_WIDTH, 30).fill("#f5f5f5");
  doc.font("Helvetica").fontSize(8).fillColor("#737373");
  doc.text("Namn", MARGIN + 8, y + 5);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0a0a0a");
  doc.text(period.employee.name, MARGIN + 8, y + 15);

  doc.font("Helvetica").fontSize(8).fillColor("#737373");
  doc.text(
    `${company.name}   ·   ${formatDate(period.from, tz)} – ${formatDate(
      period.to,
      tz
    )}`,
    A4_WIDTH - MARGIN - 280,
    y + 17,
    { width: 272, align: "right" }
  );

  y += 42;

  /* --- Raderna ------------------------------------------------------------ */

  y = drawRowHeader(doc, y);

  for (const day of period.days) {
    // Dagar helt utan innehåll utelämnas. En tidrapport som listar fyra tomma
    // helgdagar gör den verkliga veckan svårare att läsa.
    const empty =
      day.entries.length === 0 &&
      day.breaks.length === 0 &&
      day.absences.length === 0;

    if (empty && day.plannedMinutes === 0) continue;

    if (y > 690) {
      doc.addPage();
      y = MARGIN;
      y = drawRowHeader(doc, y);
    }

    const label = `${dayName(day.weekday)} ${formatDate(day.date, tz)}`;

    for (const absence of day.absences) {
      doc.font("Helvetica").fontSize(9).fillColor("#a16207");
      doc.text(label, MARGIN + 4, y + 4, { width: 90, lineBreak: false });
      doc.text(ABSENCE_LABELS[absence.type], MARGIN + 100, y + 4, {
        width: 200,
        lineBreak: false,
      });
      doc.text(formatDecimalHours(absence.minutes), A4_WIDTH - MARGIN - 64, y + 4, {
        width: 60,
        align: "right",
        lineBreak: false,
      });
      y += 16;
    }

    for (const entry of day.entries) {
      doc.font("Helvetica").fontSize(9).fillColor("#171717");
      doc.text(label, MARGIN + 4, y + 4, { width: 90, lineBreak: false });

      const what = entry.momentName
        ? `${entry.label} · ${entry.momentName}`
        : entry.label;

      doc.text(what, MARGIN + 100, y + 4, { width: 200, lineBreak: false });
      doc.text(formatTime(entry.clockInAt, tz), MARGIN + 305, y + 4, {
        width: 46,
        lineBreak: false,
      });
      doc.text(
        entry.clockOutAt ? formatTime(entry.clockOutAt, tz) : "pågår",
        MARGIN + 355,
        y + 4,
        { width: 46, lineBreak: false }
      );
      doc.text(entry.kind === "ORDER" ? "P" : "I", MARGIN + 408, y + 4, {
        width: 20,
        lineBreak: false,
      });
      doc.text(formatDecimalHours(entry.minutes), A4_WIDTH - MARGIN - 64, y + 4, {
        width: 60,
        align: "right",
        lineBreak: false,
      });

      y += 16;
    }

    for (const rest of day.breaks) {
      doc.font("Helvetica").fontSize(8).fillColor("#a3a3a3");
      doc.text(label, MARGIN + 4, y + 4, { width: 90, lineBreak: false });
      doc.text(rest.name, MARGIN + 100, y + 4, { width: 200, lineBreak: false });
      doc.text(formatTime(rest.startedAt, tz), MARGIN + 305, y + 4, {
        width: 46,
        lineBreak: false,
      });
      doc.text(
        rest.endedAt ? formatTime(rest.endedAt, tz) : "pågår",
        MARGIN + 355,
        y + 4,
        { width: 46, lineBreak: false }
      );
      doc.text(formatDecimalHours(rest.minutes), A4_WIDTH - MARGIN - 64, y + 4, {
        width: 60,
        align: "right",
        lineBreak: false,
      });
      y += 14;
    }

    // Dagssumman, som i kundens rapport: en fet siffra under dagens rader.
    if (day.workedMinutes > 0) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#0a0a0a");
      doc.text(
        formatDecimalHours(day.workedMinutes),
        A4_WIDTH - MARGIN - 64,
        y + 2,
        { width: 60, align: "right", lineBreak: false }
      );
      y += 15;
    }

    doc
      .moveTo(MARGIN, y)
      .lineTo(A4_WIDTH - MARGIN, y)
      .strokeColor("#e5e5e5")
      .stroke();
    y += 4;
  }

  /* --- Periodsumma -------------------------------------------------------- */

  if (y > 640) {
    doc.addPage();
    y = MARGIN;
  }

  y += 4;
  doc.rect(MARGIN, y, CONTENT_WIDTH, 24).fill("#f5f5f5");
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0a0a0a");
  doc.text("Totalt för perioden", MARGIN + 8, y + 7, { width: 240 });
  doc.text(
    formatDecimalHours(period.totals.worked),
    A4_WIDTH - MARGIN - 68,
    y + 7,
    { width: 60, align: "right" }
  );
  y += 34;

  /* --- Sammanställningen -------------------------------------------------- */

  y = drawSummary(doc, y, period);

  /* --- Improduktiv tid per typ -------------------------------------------- */

  if (period.indirectByMoment.length > 0) {
    y += 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#0a0a0a");
    doc.text("Improduktiv tid", MARGIN, y);
    y += 14;

    for (const row of period.indirectByMoment) {
      doc.font("Helvetica").fontSize(9).fillColor("#404040");
      doc.text(row.name, MARGIN + 8, y, { width: 300, lineBreak: false });
      doc.text(formatDecimalHours(row.minutes), A4_WIDTH - MARGIN - 68, y, {
        width: 60,
        align: "right",
        lineBreak: false,
      });
      y += 14;
    }
  }

  /* --- Underskrifter ------------------------------------------------------ */

  y += 24;

  if (y < 720) {
    doc.font("Helvetica").fontSize(9).fillColor("#525252");

    const fields = ["Spara ___ tim", "Ta ut ___ tim", "Datum", "Tidrapport ok"];
    const width = CONTENT_WIDTH / fields.length;

    fields.forEach((field, index) => {
      const x = MARGIN + width * index;
      doc.text(field, x, y, { width: width - 10, lineBreak: false });
      doc
        .moveTo(x, y + 26)
        .lineTo(x + width - 16, y + 26)
        .strokeColor("#a3a3a3")
        .stroke();
    });
  }

  drawFooter(doc, "Tidrapport från Tikkr. Löneunderlag — skickas inte till kund.", {
    marginLeft: MARGIN,
    contentWidth: CONTENT_WIDTH,
    y: FOOTER_Y,
  });
}

function drawRowHeader(doc: PDFKit.PDFDocument, y: number): number {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#737373");
  doc.text("Dag", MARGIN + 4, y, { width: 90, lineBreak: false });
  doc.text("Order / improduktivt", MARGIN + 100, y, { width: 200, lineBreak: false });
  doc.text("Start", MARGIN + 305, y, { width: 46, lineBreak: false });
  doc.text("Stopp", MARGIN + 355, y, { width: 46, lineBreak: false });
  // P och I i stället för orden. Kolumnen är smal, och förkortningen förklaras
  // i foten på sammanställningen.
  doc.text("P/I", MARGIN + 408, y, { width: 20, lineBreak: false });
  doc.text("Tim", A4_WIDTH - MARGIN - 64, y, {
    width: 60,
    align: "right",
    lineBreak: false,
  });

  y += 12;
  doc
    .moveTo(MARGIN, y)
    .lineTo(A4_WIDTH - MARGIN, y)
    .strokeColor("#d4d4d4")
    .stroke();

  return y + 2;
}

/**
 * Sammanställningen längst ner — kundens fyra efterfrågade rader plus flex
 * och komp.
 *
 * Två kolumner i tre rader, som i deras gamla rapport. Ordningen är deras.
 */
function drawSummary(
  doc: PDFKit.PDFDocument,
  y: number,
  period: PayrollPeriod
): number {
  const rows: [string, string][][] = [
    [
      ["Planerad tid", formatDecimalHours(period.totals.planned)],
      ["Närvarotid", formatDecimalHours(period.totals.worked)],
    ],
    [
      ["Produktiv tid", formatDecimalHours(period.totals.productive)],
      ["Improduktiv tid", formatDecimalHours(period.totals.indirect)],
    ],
    [
      ["Frånvaro", formatDecimalHours(period.totals.absence)],
      ["Rast", formatDecimalHours(period.totals.breaks)],
    ],
    [
      ["Flextid, perioden", signed(period.totals.flex)],
      ["Flexsaldo", signed(period.flex.closing)],
    ],
    [
      ["Intjänad komp", formatDecimalHours(period.comp.earned)],
      ["Uttagen komp", formatDecimalHours(period.comp.taken)],
    ],
    [["Komptidssaldo", signed(period.comp.closing)], ["", ""]],
  ];

  const height = rows.length * 16 + 14;
  doc.rect(MARGIN, y, CONTENT_WIDTH, height).fill("#fafafa");

  let cursor = y + 8;
  const half = CONTENT_WIDTH / 2;

  for (const row of rows) {
    row.forEach(([label, value], column) => {
      if (!label) return;

      const x = MARGIN + 8 + half * column;

      doc.font("Helvetica").fontSize(9).fillColor("#525252");
      doc.text(label, x, cursor, { width: half - 90, lineBreak: false });

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#0a0a0a");
      doc.text(value, x + half - 100, cursor, {
        width: 70,
        align: "right",
        lineBreak: false,
      });
    });

    cursor += 16;
  }

  y += height + 6;

  doc.font("Helvetica").fontSize(7).fillColor("#a3a3a3");
  doc.text(
    "Tid i decimaltimmar. P = produktiv tid på kundorder, I = improduktiv tid. " +
      "Flextid = närvarotid + frånvaro − planerad tid − intjänad komp.",
    MARGIN,
    y,
    { width: CONTENT_WIDTH }
  );

  return doc.y + 4;
}

function signed(minutes: number): string {
  if (Math.round(minutes) === 0) return "0,00";
  const sign = minutes > 0 ? "+" : "-";
  return `${sign}${formatDecimalHours(Math.abs(minutes))}`;
}

function dayName(weekday: number): string {
  return ["Må", "Ti", "On", "To", "Fr", "Lö", "Sö"][weekday - 1] ?? "";
}
