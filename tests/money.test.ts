import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatMarkup,
  parseOre,
  parseMarkupPercent,
  costForMinutes,
  applyMarkup,
} from "@/lib/money";

/**
 * Pengar.
 *
 * Allt räknas i ören som heltal. Ett belopp som inte stämmer på öret i ett
 * fakturaunderlag är ett belopp ingen litar på, och avrundningsfel syns först
 * när hundra rader summerats — alltså när det är för sent.
 */

describe("visa belopp", () => {
  it("skriver ören som kronor med två decimaler", () => {
    expect(formatCurrency(0)).toBe("0,00 kr");
    expect(formatCurrency(18000)).toBe("180,00 kr");
    expect(formatCurrency(18250)).toBe("182,50 kr");
    expect(formatCurrency(5)).toBe("0,05 kr");
  });

  it("delar tusental med mellanslag", () => {
    expect(formatCurrency(123456)).toBe("1 234,56 kr");
    expect(formatCurrency(123456789)).toBe("1 234 567,89 kr");
  });

  it("använder ett vanligt mellanslag, inte ett hårt", () => {
    // pdfkit skriver WinAnsi. Ett tecken utanför den tabellen blir en fyrkant
    // mitt i ett belopp, och just beloppen är det man tittar på.
    expect(formatCurrency(123456)).not.toContain(" ");
  });

  it("klarar negativa belopp", () => {
    expect(formatCurrency(-18000)).toBe("-180,00 kr");
  });

  it("skriver påslaget som en faktor", () => {
    expect(formatMarkup(140)).toBe("×1,40");
    expect(formatMarkup(100)).toBe("×1,00");
  });
});

describe("läsa belopp", () => {
  it("godtar både komma och punkt", () => {
    expect(parseOre("182,50")).toBe(18250);
    expect(parseOre("182.50")).toBe(18250);
  });

  it("godtar mellanslag i tusental", () => {
    expect(parseOre("1 250")).toBe(125000);
  });

  it("ger null för tomt fält — det är inte noll kronor", () => {
    expect(parseOre("")).toBeNull();
    expect(parseOre("   ")).toBeNull();
    expect(parseOre(null)).toBeNull();
  });

  it("avvisar skräp och negativa belopp", () => {
    expect(parseOre("abc")).toBeNull();
    expect(parseOre("-5")).toBeNull();
  });

  it("avrundar till hela ören", () => {
    // Inte 10,005: det talet ligger på avrundningens knivsegg och blir
    // 1000,4999… som flyttal. Ett test ska mäta koden, inte IEEE 754.
    expect(parseOre("10,006")).toBe(1001);
    expect(parseOre("10,004")).toBe(1000);
  });
});

describe("läsa påslag", () => {
  it("tar en faktor och ger procent", () => {
    expect(parseMarkupPercent("1,4")).toBe(140);
    expect(parseMarkupPercent("1.4")).toBe(140);
    expect(parseMarkupPercent("1")).toBe(100);
    expect(parseMarkupPercent("2,25")).toBe(225);
  });

  it("avvisar ett värde som ser ut som procent", () => {
    // Någon som skriver "40" menar fyrtio procent, inte fyrtio gånger
    // pengarna. Det felet får inte sparas tyst.
    expect(parseMarkupPercent("40")).toBeNull();
    expect(parseMarkupPercent("140")).toBeNull();
  });

  it("avvisar påslag under ett", () => {
    expect(parseMarkupPercent("0,8")).toBeNull();
    expect(parseMarkupPercent("0")).toBeNull();
  });

  it("ger null för tomt fält", () => {
    expect(parseMarkupPercent("")).toBeNull();
  });
});

describe("räkna", () => {
  it("räknar kostnad för en tid", () => {
    expect(costForMinutes(60, 18000)).toBe(18000);
    expect(costForMinutes(90, 18000)).toBe(27000);
    expect(costForMinutes(30, 18000)).toBe(9000);
  });

  it("avrundar en gång, till hela ören", () => {
    expect(costForMinutes(7, 18000)).toBe(2100);
    expect(costForMinutes(1, 18333)).toBe(306);
  });

  it("räknar upp med påslaget", () => {
    expect(applyMarkup(10000, 140)).toBe(14000);
    expect(applyMarkup(10000, 100)).toBe(10000);
    expect(applyMarkup(18250, 140)).toBe(25550);
  });
});
