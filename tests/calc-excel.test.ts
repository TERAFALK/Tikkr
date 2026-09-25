import { describe, it, expect } from "vitest";
import { buildOrderCalcWorkbook } from "@/lib/calc-excel";
import type { OrderCalc } from "@/lib/order-calc";

/**
 * Härledd ur funktionen i stället för importerad ur exceljs. Biblioteket
 * exporterar sina typer genom en namnrymd som inte går att plocka isär med en
 * vanlig typimport, och en härledd typ kan ändå aldrig glida isär från den
 * kod den beskriver.
 */
type Sheet = ReturnType<typeof buildOrderCalcWorkbook>["worksheets"][number];

/**
 * Excel-efterkalkylen.
 *
 * Testet finns av ett bestämt skäl: de två SUM-formlerna i de befintliga
 * exporterna summerade fel kolumn i månader utan att någon märkte det, för att
 * ingen kontrollerade vilken cell en formel hamnade i. Ett ark där kunden
 * fyller i material och får fel vinst är värre än inget ark.
 */

function calc(overrides: Partial<OrderCalc> = {}): OrderCalc {
  return {
    orderId: "o1",
    orderNumber: "35466",
    customerName: "ESSKA",
    groups: [],
    entryCount: 0,
    totalMinutes: 209,
    totalCostOre: 271150,
    minutesWithoutRate: 0,
    markupPercent: 140,
    markupFromOrder: false,
    priceOre: 379610,
    priceIsFixed: false,
    profitOre: 108460,
    profitPercent: 40,
    ongoingCount: 0,
    ungradedCount: 0,
    firstEntryAt: null,
    lastEntryAt: null,
    ...overrides,
  };
}

function sheetFor(order: OrderCalc): Sheet {
  return buildOrderCalcWorkbook("Vänertekno", [order]).worksheets[0];
}

/** Formeltexten i en cell, utan inledande likhetstecken. */
function formula(sheet: Sheet, ref: string): string {
  const value = sheet.getCell(ref).value as { formula?: string } | null;
  return value?.formula ?? "";
}

describe("huvudet", () => {
  it("fyller i kund och ordernummer", () => {
    const sheet = sheetFor(calc());

    expect(sheet.getCell("B1").value).toBe("Efterkalkyl");
    expect(sheet.getCell("E1").value).toBe("ESSKA");
    expect(sheet.getCell("E2").value).toBe("35466");
  });

  it("namnger fliken efter order och kund", () => {
    expect(sheetFor(calc()).name).toBe("35466 ESSKA");
  });

  it("klarar en order utan kundnamn", () => {
    const sheet = sheetFor(calc({ customerName: null }));

    expect(sheet.getCell("E1").value).toBe("");
    expect(sheet.name).toBe("35466");
  });
});

describe("raden Tikkr fyller i", () => {
  it("skriver tidskostnaden i kronor på rad 9", () => {
    const sheet = sheetFor(calc());

    expect(sheet.getCell("A9").value).toBe("Person och maskin:");
    expect(sheet.getCell("E9").value).toBe(2711.5);
  });

  it("skriver timmarna som decimaltal bredvid", () => {
    const sheet = sheetFor(calc({ totalMinutes: 209 }));

    // 209 minuter = 3,48 timmar.
    expect(sheet.getCell("E10").value).toBe(3.48);
    expect(sheet.getCell("F10").value).toBe("timmar");
  });

  it("förifyller påslaget på alla fyra kostnadsraderna", () => {
    const sheet = sheetFor(calc({ markupPercent: 140 }));

    for (const row of [6, 7, 8, 9]) {
      expect(sheet.getCell(`F${row}`).value).toBe(1.4);
    }
  });

  it("lämnar material tomt — det vet bara kunden", () => {
    expect(sheetFor(calc()).getCell("E6").value).toBeNull();
  });
});

describe("formlerna pekar på rätt celler", () => {
  it("kostnaden summerar de fyra kostnadsraderna", () => {
    expect(formula(sheetFor(calc()), "E13")).toBe("SUM(E6:E9)");
  });

  it("vinsten är kundpris minus kostnad", () => {
    expect(formula(sheetFor(calc()), "E15")).toBe("G13-E13");
  });

  it("vinstprocenten räknas mot kostnaden, inte mot priset", () => {
    // Samma räkning som kundens eget ark. Villkoret prövar dock kostnaden
    // och inte vinsten — originalet delar med noll när kostnaden är noll.
    expect(formula(sheetFor(calc()), "E16")).toBe("IF(E13>0,E15/E13,0)");
  });

  it("priset per styck delas med antalet och skyddar mot noll", () => {
    expect(formula(sheetFor(calc()), "G15")).toBe("IF(E5>0,G13/E5,0)");
  });

  it("varje kostnadsrad räknas upp med sitt eget påslag", () => {
    const sheet = sheetFor(calc());

    for (const row of [6, 7, 8, 9]) {
      expect(formula(sheet, `G${row}`)).toBe(`F${row}*E${row}`);
    }
  });

  it("ytbehandling hämtas ur sin detaljtabell", () => {
    expect(formula(sheetFor(calc()), "E7")).toBe("SUM(E45)");
  });

  it("frakterna hämtas ur båda detaljtabellerna", () => {
    expect(formula(sheetFor(calc()), "E8")).toBe("SUM(F31+F45)");
  });

  it("detaljtabellernas summor täcker sina egna rader", () => {
    const sheet = sheetFor(calc());

    expect(formula(sheet, "E31")).toBe("SUM(E20:E30)");
    expect(formula(sheet, "F31")).toBe("SUM(F20:F30)");
    expect(formula(sheet, "E45")).toBe("SUM(E34:E44)");
    expect(formula(sheet, "F45")).toBe("SUM(F34:F44)");
  });

  it("summaraden ligger utanför det den summerar", () => {
    // En summa som räknar in sig själv ger cirkelreferens och ett ark som
    // inte går att öppna utan en varning.
    expect(formula(sheetFor(calc()), "E31")).not.toContain("E31");
    expect(formula(sheetFor(calc()), "E45")).not.toContain("E45");
  });
});

describe("kundpriset", () => {
  it("fylls i när ordern har ett fast pris", () => {
    const sheet = sheetFor(
      calc({ priceIsFixed: true, priceOre: 735000 })
    );

    expect(sheet.getCell("G13").value).toBe(7350);
    expect(sheet.getCell("H13").value).toBe("Kundpris");
  });

  it("lämnas tomt på en löpande order", () => {
    // Priset avgörs av påslaget. En gissning i cellen hade styrt
    // vinsträkningen och sett ut som en överenskommelse.
    expect(sheetFor(calc({ priceIsFixed: false })).getCell("G13").value).toBeNull();
  });
});

describe("rubrikerna kunden känner igen", () => {
  it("behåller de två detaljtabellernas rubriker", () => {
    const sheet = sheetFor(calc());

    expect(sheet.getCell("B19").value).toBe("Löpnr");
    expect(sheet.getCell("E19").value).toBe("Material");
    expect(sheet.getCell("G19").value).toBe("Leverantör");
    expect(sheet.getCell("E33").value).toBe("Ytbehandling");
    expect(sheet.getCell("C31").value).toBe("Summa");
    expect(sheet.getCell("C45").value).toBe("Summa");
  });

  it("skriver företagets namn på kostnadsraden", () => {
    expect(sheetFor(calc()).getCell("D13").value).toBe("Kostnad Vänertekno");
  });
});
