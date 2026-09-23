import PDFDocument from "pdfkit";
import type { OrderExport } from "./order-export";
import { formatDate, formatDateTime, formatDuration } from "./format";
import { drawBarChart } from "./pdf-chart";

/**
 * UNDERLAG SOM PDF.
 *
 * Dokumentet är till för att skickas vidare som bilaga till en faktura. Det
 * betyder att mottagaren är kundens kund — någon som inte känner Tikkr och
 * inte ska behöva göra det.
 *
 * Därför: kundens egen logotyp överst, ordernummer och kundnamn som rubrik,
 * raderna i tidsordning, och summan sist. Tikkr nämns bara diskret i foten.
 *
 * En order per sida. Skickar man tio ordrar blir det ett dokument med tio
 * sidor istället för tio filer — enklare att bifoga, och enklare att skriva ut.
 *
 * INGA BELOPP HÄR. Dokumentet innehåller tid, aldrig kronor — varken
 * självkostnad, påslag eller pris. Det är det som gör att det går att skicka
 * vidare utan att någon först behöver läsa igenom det. Kalkylen med belopp är
 * ett eget dokument (src/lib/calc-pdf.ts) med en egen knapp, just för att de
 * två aldrig ska kunna förväxlas. Bygg inte in ett beloppsläge här.
 *
 * Tid skrivs som "1:59", inte som "1,99". Decimaltimmar är rätt matematik men
 * fel för ett öga: mottagaren läser 1,99 som klockslag och undrar var minut 99
 * kom ifrån. Enheten står i kolumnrubriken så att "1:59" inte i sin tur läses
 * som ett klockslag. Decimaltimmar finns kvar i Excel-exporten, där de behövs
 * för att kunna räknas med, och i kalkylen där de multipliceras med ett
 * timpris.
 */

const A4_WIDTH = 595.28;
const MARGIN = 50;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

export interface PdfCompany {
  name: string;
  timezone: string;
  logo: { data: Buffer; mimeType: string } | null;
}

const COLUMNS = [
  { key: "employee", label: "Anställd", width: 120, align: "left" as const },
  { key: "moment", label: "Arbetsmoment", width: 105, align: "left" as const },
  { key: "in", label: "Instämplad", width: 95, align: "left" as const },
  { key: "out", label: "Utstämplad", width: 95, align: "left" as const },
  // Bredden styrs av RUBRIKEN, inte av värdena: "312:45" är kort, men
  // "Tid (tim:min)" behöver sina punkter. Kolumnen har lineBreak: false, så
  // för smalt hade klippt texten utan att det syntes.
  { key: "hours", label: "Tid (tim:min)", width: 80, align: "right" as const },
];

export function buildOrderPdf(
  company: PdfCompany,
  orders: OrderExport[]
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: {
      Title:
        orders.length === 1
          ? `Tidsunderlag order ${orders[0].orderNumber}`
          : "Tidsunderlag",
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
    renderOrder(doc, company, order);
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

function renderOrder(
  doc: PDFKit.PDFDocument,
  company: PdfCompany,
  order: OrderExport
) {
  let y = MARGIN;

  /* --- Logotyp och företagsnamn ------------------------------------------ */

  if (company.logo) {
    try {
      // Höjden begränsas, bredden får följa med. En bred logotyp blir alltså
      // aldrig högre än sin ruta och trycker inte ner rubriken.
      doc.image(company.logo.data, MARGIN, y, { fit: [150, 40] });
      y += 52;
    } catch {
      // En trasig eller okänd bild ska inte hindra att underlaget skapas.
      y += 4;
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#171717")
    .text(company.name, MARGIN, y);

  y = doc.y + 18;

  /* --- Rubrik ------------------------------------------------------------- */

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0a0a0a");
  doc.text(`Order ${order.orderNumber}`, MARGIN, y);
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
    `Period: ${period}   ·   Underlag skapat ${formatDate(new Date(), company.timezone)}`,
    MARGIN,
    y
  );

  y = doc.y + 16;

  /* --- Tabellhuvud -------------------------------------------------------- */

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

  y += 22;

  /* --- Rader -------------------------------------------------------------- */

  doc.font("Helvetica").fontSize(9);

  for (const row of order.rows) {
    // Ny sida innan raden hamnar i sidfoten.
    if (y > 720) {
      doc.addPage();
      y = MARGIN;
    }

    doc.fillColor("#404040");

    const values = [
      // Numret bakom namnet, inte i en egen kolumn. Underlaget går vidare
      // till kundens kund, och en extra kolumn med interna nummer gör
      // dokumentet bredare utan att säga dem något.
      row.employeeNumber
        ? `${row.employeeName} (${row.employeeNumber})`
        : row.employeeName,
      row.momentName,
      formatDateTime(row.clockInAt, company.timezone),
      row.ongoing
        ? "pågår"
        : formatDateTime(row.clockOutAt!, company.timezone),
      formatDuration(row.minutes),
    ];

    x = MARGIN + 8;
    values.forEach((value, index) => {
      doc.text(value, x, y + 6, {
        width: COLUMNS[index].width - 12,
        align: COLUMNS[index].align,
        lineBreak: false,
      });
      x += COLUMNS[index].width;
    });

    // Markering för tid systemet gissat eller någon skrivit in för hand.
    // Mottagaren har rätt att veta vilka rader som inte kommer från en riktig
    // stämpling — att dölja det vore att lura någon som betalar.
    if (row.needsReview || row.manual) {
      doc.fillColor("#a16207").fontSize(7);
      doc.text(
        row.needsReview ? "beräknad sluttid" : "manuellt registrerad",
        MARGIN + 8,
        y + 15,
        { width: 200 }
      );
      doc.fontSize(9);
      y += 26;
    } else {
      y += 20;
    }

    doc.moveTo(MARGIN, y).lineTo(A4_WIDTH - MARGIN, y).strokeColor("#e5e5e5").stroke();
  }

  /* --- Summa -------------------------------------------------------------- */

  if (y > 700) {
    doc.addPage();
    y = MARGIN;
  }

  y += 4;
  doc.rect(MARGIN, y, CONTENT_WIDTH, 26).fill("#f5f5f5");

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0a0a0a");
  doc.text("TOTALT", MARGIN + 8, y + 8, { width: 200 });
  doc.text(
    formatDuration(order.totalMinutes),
    A4_WIDTH - MARGIN - 158,
    y + 8,
    { width: 150, align: "right" }
  );

  // Beräknad tid, när kunden angett en. Står direkt under totalen eftersom
  // det är där jämförelsen görs.
  if (order.budgetMinutes) {
    const over = order.totalMinutes > order.budgetMinutes;
    const share = Math.round((order.totalMinutes / order.budgetMinutes) * 100);

    doc.font("Helvetica").fontSize(8).fillColor(over ? "#a16207" : "#525252");
    doc.text(
      `Beräknad tid ${formatDuration(order.budgetMinutes)}. Upparbetat ${share} procent.`,
      MARGIN,
      y + 4,
      { width: CONTENT_WIDTH }
    );

    y += 14;
  }

  y += 34;

  // Diagrammet ligger efter summan och inte före tabellen. Den som öppnar
  // underlaget vill se raderna och totalen först; fördelningen är det man
  // tittar på när man redan vet vad ordern kostat.
  y = drawMomentChart(doc, order, y);

  if (order.ungradedCount > 0 || order.ongoingCount > 0) {
    const notes: string[] = [];
    if (order.ongoingCount > 0) {
      notes.push(
        `${order.ongoingCount} stämpling${order.ongoingCount === 1 ? "" : "ar"} pågår och är beräknad till och med utskriftstillfället`
      );
    }
    if (order.ungradedCount > 0) {
      notes.push(
        `${order.ungradedCount} post${order.ungradedCount === 1 ? "" : "er"} har en sluttid beräknad av systemet och är ännu inte granskad`
      );
    }

    doc.font("Helvetica").fontSize(8).fillColor("#a16207");
    doc.text(`Anmärkning: ${notes.join(". ")}.`, MARGIN, y, {
      width: CONTENT_WIDTH,
    });
  }

  /* --- Sidfot ------------------------------------------------------------- */

  doc.font("Helvetica").fontSize(7).fillColor("#a3a3a3");
  doc.text("Tidsunderlag skapat med Tikkr", MARGIN, 800, {
    width: CONTENT_WIDTH,
    align: "center",
  });
}

/* --- Fördelning per arbetsmoment ---------------------------------------- */

/**
 * Staplar som visar hur tiden fördelats mellan arbetsmomenten.
 *
 * Själva ritandet ligger i pdf-chart.ts. Här räknas bara ihop vad staplarna
 * ska visa.
 */
function drawMomentChart(
  doc: PDFKit.PDFDocument,
  order: OrderExport,
  startY: number
): number {
  const perMoment = new Map<string, number>();

  for (const row of order.rows) {
    perMoment.set(
      row.momentName,
      (perMoment.get(row.momentName) ?? 0) + row.minutes
    );
  }

  if (order.totalMinutes === 0) return startY;

  const moments = [...perMoment.entries()].sort((a, b) => b[1] - a[1]);

  return drawBarChart(doc, {
    title: "Fördelning per arbetsmoment",
    items: moments.map(([name, minutes]) => ({
      label: name,
      value: minutes,
      valueText: `${formatDuration(minutes)} · ${Math.round(
        (minutes / order.totalMinutes) * 100
      )} %`,
    })),
    startY,
    marginLeft: MARGIN,
    contentWidth: CONTENT_WIDTH,
    pageWidth: A4_WIDTH,
    // Sidfoten står på 800. Diagrammet fick tidigare skriva rakt igenom den
    // när en order hade många moment.
    bottomLimit: 760,
    pageTopY: MARGIN,
  });
}
