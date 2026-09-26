import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * GRÄNSEN MELLAN LÖNEUNDERLAG OCH FAKTURAUNDERLAG.
 *
 * Tikkr lämnar två sorters dokument till två olika mottagare. Kundens kund får
 * ett fakturaunderlag; kundens egen personalavdelning får en tidrapport. De
 * ska aldrig kunna blandas ihop, och framför allt ska ett löneskäl aldrig
 * kunna påverka vad som faktureras.
 *
 * Skillnaden är inte teoretisk. Samma timme räknas olika:
 *
 *   En operatör kör två maskiner 08–12. Fakturaunderlaget ska visa ÅTTA
 *   maskintimmar — båda ordrarna ska betala sin. Tidrapporten ska visa FYRA
 *   timmar, för det är så länge personen var på jobbet.
 *
 * Skulle fakturasidan börja läsa `payroll.ts` vore det bara en tidsfråga
 * innan någon "förenklade" genom att använda samma siffra på båda ställena,
 * och kunden skulle faktureras för halva arbetet.
 *
 * Samma sorts skyddsnät som tenant-coverage.test.ts. Behöver ingen databas.
 */

const SRC = path.resolve(__dirname, "../src");

/** Modulerna som räknar löneunderlag. */
const PAYROLL_MODULES = [
  "payroll",
  "schedule",
  "absence",
  "breaks",
  "break-close",
  "timesheet-pdf",
];

/** Filerna som bygger underlag till kundens kund. */
const INVOICE_FILES = [
  "lib/order-export.ts",
  "lib/order-calc.ts",
  "lib/order-price.ts",
  "lib/pdf.ts",
  "lib/calc-pdf.ts",
  "lib/calc-excel.ts",
  "lib/report.ts",
  "lib/report-pdf.ts",
  // Rutterna som faktiskt lämnar ut dokumenten.
  "app/api/admin/export/route.ts",
  "app/api/admin/export/orders/route.ts",
];

function importsOf(file: string): string[] {
  const source = readFileSync(path.join(SRC, file), "utf8");
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

function exists(file: string): boolean {
  try {
    readFileSync(path.join(SRC, file), "utf8");
    return true;
  } catch {
    return false;
  }
}

describe("fakturaunderlaget känner inte till löneunderlaget", () => {
  for (const file of INVOICE_FILES.filter(exists)) {
    it(`${file} importerar ingen lönemodul`, () => {
      const forbidden = importsOf(file).filter((specifier) =>
        PAYROLL_MODULES.some(
          (module) =>
            specifier === `./${module}` ||
            specifier === `@/lib/${module}` ||
            specifier.endsWith(`/lib/${module}`)
        )
      );

      expect(
        forbidden,
        `${file} bygger underlag till kundens kund och får inte läsa ` +
          `löneunderlaget. Samma timme räknas olika i de två dokumenten — se ` +
          `kommentaren överst i den här filen.`
      ).toEqual([]);
    });
  }

  it("listan över fakturafiler pekar på filer som finns", () => {
    // En rad som pekar på en borttagen fil är ett hål som står kvar och ser
    // ut som ett skydd.
    const missing = INVOICE_FILES.filter((file) => !exists(file));
    expect(missing).toEqual([]);
  });
});

describe("rasttid kan inte faktureras", () => {
  it("BreakEntry har varken order eller arbetsmoment", () => {
    const schema = readFileSync(
      path.resolve(__dirname, "../prisma/schema.prisma"),
      "utf8"
    );

    const start = schema.indexOf("model BreakEntry {");
    const body = schema.slice(start, schema.indexOf("\n}", start));

    expect(start, "BreakEntry saknas i schemat").toBeGreaterThan(-1);
    expect(body).not.toMatch(/orderId/);
    expect(body).not.toMatch(/momentId\s+String/);
    expect(body).not.toMatch(/CostRateOre/);
  });
});

describe("kiosken visar inga belopp", () => {
  it("ingen kioskfil läser en timkostnad eller ett pris", () => {
    const dir = path.join(SRC, "components/kiosk");
    const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));

    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(path.join(dir, file), "utf8");
      if (/costRateOre|fixedPriceOre|formatCurrency|markupPercent/.test(source)) {
        offenders.push(file);
      }
    }

    expect(
      offenders,
      "Stämplingsskärmen visar aldrig belopp. Flexsaldo är tid och är tillåtet."
    ).toEqual([]);
  });
});
