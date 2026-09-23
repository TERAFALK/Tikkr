import ExcelJS from "exceljs";
import type { OrderCalc } from "./order-calc";
import { toDecimalHours } from "./format";

/**
 * EFTERKALKYL SOM EXCEL — KUNDENS EGET ARK.
 *
 * Layouten är inte vår. Den är en avbild av det kalkylark kunden redan
 * använder, rad för rad, och det är hela poängen: de ska känna igen pappret
 * och slippa lära om.
 *
 * I deras ark fylls raden "Från system Andersson" i för hand med orderns
 * maskintidskostnad, hämtad ur en utskriven rapport. Det är den enda raden
 * Tikkr kan veta något om, och det är precis den de bad om att slippa skriva.
 * Material, ytbehandling, frakter och kundpris lämnas tomma — dem vet bara de.
 *
 * Summorna skrivs som FORMLER och inte som färdiga tal. Ett ark där man fyller
 * i materialkostnaden och ingenting räknas om är ett dött papper.
 *
 * Rubriken "Från system Andersson" behålls ordagrant fastän siffran nu kommer
 * härifrån. Det är vad de känner igen raden på. Dagen de slutar med System
 * Andersson är det en textsträng att ändra, inte en struktur.
 */

/** Radnummer, så att formlerna och cellerna inte glider isär. */
const ROW = {
  title: 1,
  orderNumber: 2,
  drawing: 4,
  quantity: 5,
  material: 6,
  surface: 7,
  freight: 8,
  fromTimeSystem: 9,
  hours: 10,
  cost: 13,
  profit: 15,
  profitPercent: 16,
  materialHead: 19,
  materialFirst: 20,
  materialLast: 30,
  materialSum: 31,
  surfaceHead: 33,
  surfaceFirst: 34,
  surfaceLast: 44,
  surfaceSum: 45,
} as const;

const MONEY = "#,##0.00";

/**
 * Vad en cell får innehålla.
 *
 * Härledd ur Worksheet i stället för hämtad som ExcelJS.CellValue. Worksheet
 * används redan på andra håll i kodbasen och är därmed bevisad; en härledd typ
 * kan dessutom aldrig glida isär från biblioteket den beskriver.
 */
type CellValue = ReturnType<ExcelJS.Worksheet["getCell"]>["value"];

export function buildOrderCalcWorkbook(
  companyName: string,
  orders: OrderCalc[]
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tikkr";
  workbook.created = new Date();

  for (const order of orders) {
    // Fliknamn får inte innehålla vissa tecken och max vara 31 tecken.
    const name = `${order.orderNumber} ${order.customerName ?? ""}`
      .replace(/[\/*?:[\]]/g, " ")
      .trim()
      .slice(0, 31);

    renderSheet(
      workbook.addWorksheet(name || order.orderNumber),
      companyName,
      order
    );
  }

  if (orders.length === 0) {
    workbook.addWorksheet("Tomt").getCell("A1").value = "Inga ordrar valda.";
  }

  return workbook;
}

function renderSheet(
  sheet: ExcelJS.Worksheet,
  companyName: string,
  order: OrderCalc
) {
  sheet.columns = [
    { width: 22 }, // A  etiketter
    { width: 8 }, // B  löpnr
    { width: 26 }, // C  vad
    { width: 18 }, // D  etiketter till höger
    { width: 14 }, // E  belopp
    { width: 10 }, // F  påslag / frakt
    { width: 16 }, // G  belopp med påslag
    { width: 12 }, // H  etiketter längst ut
  ];

  const set = (ref: string, value: CellValue) => {
    sheet.getCell(ref).value = value;
    return sheet.getCell(ref);
  };

  const bold = (ref: string) => {
    sheet.getCell(ref).font = { bold: true };
  };

  /* --- Huvud --------------------------------------------------------------- */

  set("B1", "Efterkalkyl").font = { bold: true, size: 14 };
  set("D1", "Kund:");
  set("E1", order.customerName ?? "");
  set("G1", "Uppdaterad:");
  set("H1", new Date()).numFmt = "yyyy-mm-dd";

  set("D2", "Ordernummer:");
  set("E2", order.orderNumber);
  bold("E1");
  bold("E2");

  set(`A${ROW.drawing}`, "Ritnummer:");
  set(`A${ROW.quantity}`, "Antal");
  set(`F${ROW.quantity}`, "Påslag");
  bold(`F${ROW.quantity}`);

  /* --- Kostnadsraderna ----------------------------------------------------- */

  const markup = order.markupPercent / 100;

  // Påslaget förifylls på alla fyra raderna med företagets standard. I kundens
  // eget ark har ytbehandling ofta ett annat — det är en siffra de ändrar,
  // inte ett fält de behöver leta upp.
  const costRow = (row: number, label: string, value: CellValue) => {
    set(`A${row}`, label);
    set(`E${row}`, value).numFmt = MONEY;
    set(`F${row}`, markup);
    set(`G${row}`, { formula: `F${row}*E${row}` }).numFmt = MONEY;
  };

  costRow(ROW.material, "Material:", null);
  costRow(ROW.surface, "Ytbehandling:", {
    formula: `SUM(E${ROW.surfaceSum})`,
  });
  costRow(ROW.freight, "Frakter:", {
    formula: `SUM(F${ROW.materialSum}+F${ROW.surfaceSum})`,
  });

  // Den enda raden Tikkr kan fylla i, och skälet till att arket finns.
  costRow(
    ROW.fromTimeSystem,
    "Från system Andersson:",
    order.totalCostOre / 100
  );
  bold(`A${ROW.fromTimeSystem}`);
  bold(`E${ROW.fromTimeSystem}`);

  set(`E${ROW.hours}`, toDecimalHours(order.totalMinutes)).numFmt = "0.00";
  set(`F${ROW.hours}`, "timmar");

  /* --- Summering ----------------------------------------------------------- */

  set(`D${ROW.cost}`, `Kostnad ${companyName}`);
  bold(`D${ROW.cost}`);
  set(`E${ROW.cost}`, {
    formula: `SUM(E${ROW.material}:E${ROW.fromTimeSystem})`,
  }).numFmt = MONEY;

  // Kundpriset fylls i när ordern har ett avtalat fast pris. Är den löpande
  // lämnas cellen tom — vad kunden ska betala avgörs då av påslaget, och att
  // skriva in en gissning i en cell som styr vinsträkningen vore att låtsas.
  set(`H${ROW.cost}`, "Kundpris");
  const price = sheet.getCell(`G${ROW.cost}`);
  if (order.priceIsFixed) price.value = order.priceOre / 100;
  price.numFmt = MONEY;
  price.font = { bold: true };

  set(`D${ROW.profit}`, "Vinst i kronor");
  set(`E${ROW.profit}`, {
    formula: `G${ROW.cost}-E${ROW.cost}`,
  }).numFmt = MONEY;

  set(`G${ROW.profit}`, {
    formula: `IF(E${ROW.quantity}>0,G${ROW.cost}/E${ROW.quantity},0)`,
  }).numFmt = MONEY;
  set(`H${ROW.profit}`, "/st kund");

  set(`D${ROW.profitPercent}`, "Vinst i %");
  // Nämnaren är KOSTNADEN, inte priset — samma räkning som kundens eget ark.
  // Villkoret prövar dock kostnaden och inte vinsten: originalet delar med
  // noll så fort kostnaden är noll och vinsten positiv.
  set(`E${ROW.profitPercent}`, {
    formula: `IF(E${ROW.cost}>0,E${ROW.profit}/E${ROW.cost},0)`,
  }).numFmt = "0 %";

  /* --- Detaljtabeller att fylla i för hand --------------------------------- */

  detailTable(
    sheet,
    ROW.materialHead,
    ROW.materialFirst,
    ROW.materialLast,
    ROW.materialSum,
    "Material"
  );

  detailTable(
    sheet,
    ROW.surfaceHead,
    ROW.surfaceFirst,
    ROW.surfaceLast,
    ROW.surfaceSum,
    "Ytbehandling"
  );

  sheet.getCell("E18").value = "PRIS";
  sheet.getCell("E18").font = { bold: true };
}

/**
 * En av de två tabellerna kunden fyller i för hand.
 *
 * Tom, men med rubriker och en summaformel som redan pekar på rätt rader.
 * Summan läses av kostnadsraderna ovanför, så det räcker att skriva in
 * beloppen för att hela kalkylen ska räkna om sig.
 */
function detailTable(
  sheet: ExcelJS.Worksheet,
  headRow: number,
  firstRow: number,
  lastRow: number,
  sumRow: number,
  amountLabel: string
) {
  const head = [
    ["B", "Löpnr"],
    ["C", "Vad"],
    ["E", amountLabel],
    ["F", "Frakt"],
    ["G", "Leverantör"],
  ] as const;

  for (const [column, label] of head) {
    const cell = sheet.getCell(`${column}${headRow}`);
    cell.value = label;
    cell.font = { bold: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD4D4D4" } } };
  }

  for (let row = firstRow; row <= lastRow; row += 1) {
    sheet.getCell(`E${row}`).numFmt = MONEY;
    sheet.getCell(`F${row}`).numFmt = MONEY;
  }

  sheet.getCell(`C${sumRow}`).value = "Summa";
  sheet.getCell(`C${sumRow}`).font = { bold: true };

  for (const column of ["E", "F"]) {
    const cell = sheet.getCell(`${column}${sumRow}`);
    cell.value = { formula: `SUM(${column}${firstRow}:${column}${lastRow})` };
    cell.numFmt = MONEY;
    cell.font = { bold: true };
    cell.border = { top: { style: "thin", color: { argb: "FF737373" } } };
  }
}
