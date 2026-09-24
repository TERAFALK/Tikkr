/**
 * SIDFOT I EN PDF.
 *
 * Finns för att sidfoten INTE ska skapa en tom sida — vilket den gjorde, i
 * varje utskrift systemet producerade.
 *
 * Så här gick det till: pdfkit lägger till en ny sida så fort text skrivs
 * nedanför sidans bottenmarginal. En A4-sida är 841,89 punkter hög och
 * marginalen är 50, alltså går gränsen vid 791,89. Sidfoten skrevs på 800.
 * Varje dokument fick därmed en sista sida som bara innehöll sidfoten, och som
 * på papper ser tom ut.
 *
 * Felet var svårt att se i koden, eftersom raden såg ut att bara skriva text
 * och gjorde det på exakt rätt ställe visuellt. Den enda ledtråden var en sida
 * till i utskriften.
 *
 * Lösningen är pdfkits egen: nolla bottenmarginalen runt skrivningen. Då är
 * ingenting "nedanför sidan" längre, och foten hamnar där den ska.
 */

export interface FooterOptions {
  marginLeft: number;
  contentWidth: number;
  /** Y-läget foten skrivs på. Ligger med flit under bottenmarginalen. */
  y: number;
}

export function drawFooter(
  doc: PDFKit.PDFDocument,
  text: string,
  options: FooterOptions
): void {
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.font("Helvetica").fontSize(7).fillColor("#a3a3a3");
  doc.text(text, options.marginLeft, options.y, {
    width: options.contentWidth,
    align: "center",
  });

  // Marginalen tillbaka, annars skulle allt som ritas efteråt sluta byta sida
  // av sig självt — och en tabell som växer förbi sidkanten är värre än en
  // tom sida.
  doc.page.margins.bottom = bottom;
}
