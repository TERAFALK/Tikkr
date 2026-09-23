/**
 * STAPLAR I EN PDF.
 *
 * Ritas med rektanglar och inte med ett diagrambibliotek. En handfull värden
 * behöver ingen ritmotor, och underlagen ska kunna skapas på en server utan
 * grafikbibliotek installerade.
 *
 * Här finns bara ritandet. Vad staplarna betyder — timmar, kronor — bestämmer
 * anroparen genom `valueText`. Den här filen känner därför varken till
 * tidsunderlag eller kalkyler, och kan användas av båda utan att binda ihop
 * dem.
 */

export interface BarChartItem {
  label: string;
  /** Styr stapelns längd. Skalas mot det största värdet i listan. */
  value: number;
  /** Texten till höger om stapeln, färdigformaterad av anroparen. */
  valueText: string;
}

export interface BarChartOptions {
  title: string;
  items: BarChartItem[];
  startY: number;
  marginLeft: number;
  contentWidth: number;
  pageWidth: number;
  /** Y-läge där sidan är slut och en ny måste börja. */
  bottomLimit: number;
  /** Y-läge där innehållet börjar på en ny sida, dvs. övre marginalen. */
  pageTopY: number;
  /** Stapelns färg. Blå för tid, mörkare för belopp. */
  barColor?: string;
}

const LABEL_WIDTH = 130;
const VALUE_WIDTH = 110;
const ROW_HEIGHT = 16;

/**
 * Ritar diagrammet och returnerar det nya y-läget.
 *
 * Finns färre än två staplar ritas ingenting och y lämnas orört. En ensam
 * stapel som fyller hela bredden säger inget som inte redan står i totalen.
 */
export function drawBarChart(
  doc: PDFKit.PDFDocument,
  options: BarChartOptions
): number {
  const { items, marginLeft, contentWidth, pageWidth, bottomLimit, pageTopY } =
    options;

  const largest = Math.max(...items.map((item) => item.value), 0);
  if (items.length < 2 || largest <= 0) return options.startY;

  const barWidth = contentWidth - LABEL_WIDTH - VALUE_WIDTH - 16;
  const barColor = options.barColor ?? "#2563eb";

  let y = options.startY;

  // Rubriken ska aldrig bli ensam kvar längst ner på en sida. Behövs plats
  // för rubriken plus minst två staplar, annars börjar diagrammet på nästa.
  if (y + 16 + ROW_HEIGHT * 2 > bottomLimit) {
    doc.addPage();
    y = pageTopY;
  }

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#525252");
  doc.text(options.title, marginLeft, y);
  y += 16;

  for (const item of items) {
    if (y + ROW_HEIGHT > bottomLimit) {
      doc.addPage();
      y = pageTopY;
    }

    doc.font("Helvetica").fontSize(9).fillColor("#404040");
    doc.text(item.label, marginLeft, y + 2, {
      width: LABEL_WIDTH,
      ellipsis: true,
    });

    // Bakgrunden visar hela skalan, så att en kort stapel läses som "lite av
    // totalen" i stället för som ett tomt fält.
    doc.rect(marginLeft + LABEL_WIDTH, y + 3, barWidth, 8).fill("#f5f5f5");

    const width = Math.max(2, (item.value / largest) * barWidth);
    doc.rect(marginLeft + LABEL_WIDTH, y + 3, width, 8).fill(barColor);

    doc.font("Helvetica").fontSize(9).fillColor("#525252");
    doc.text(item.valueText, pageWidth - marginLeft - VALUE_WIDTH, y + 2, {
      width: VALUE_WIDTH,
      align: "right",
    });

    y += ROW_HEIGHT;
  }

  return y + 8;
}
