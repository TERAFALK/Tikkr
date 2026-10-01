import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  formatDuration,
  formatSignedDuration,
  toDecimalHours,
} from "@/lib/format";

/**
 * ETT FORMAT PÅ SKÄRMEN, ETT I KALKYLARKET.
 *
 * Tid som någon ska LÄSA skrivs tim:min. Tid som någon ska RÄKNA MED skrivs
 * decimalt, och bara i Excel-arket.
 *
 * Regeln kostade en bugg att lära sig. Tidrapporten stod i decimaltimmar
 * medan tabellen under den stod i tim:min, på samma sida om samma dag, och
 * "1,99" lästes som 1:59 — fyra minuter fel. Flexsaldot gick dessutom inte
 * att justera: rutan visade ett format och räknade i ett annat.
 *
 * Sista kontrollen är den viktiga. Den läser källkoden och fäller en ny sida
 * som visar decimaltimmar, även om ingen kommer ihåg att den här filen finns.
 * Samma teknik som ui-text.test.ts och module-coverage.test.ts.
 */

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

/**
 * Filerna som FÅR räkna i decimaltimmar, var och en med sitt skäl.
 *
 * format.ts: äger båda formaten.
 *
 * export/route.ts: Excel-arket. En kolumn som ska summeras eller
 * multipliceras med en timpeng kan inte stå i tim:min, och arket finns just
 * för att räkna vidare i. Det är det enda stället där decimaltimmar är rätt
 * svar, och arket har tim:min i kolumnen bredvid.
 *
 * Den som lägger till en rad här får skriva varför talet ska räknas och inte
 * läsas. Är det svårt att formulera ska det stå i tim:min.
 */
const MAY_USE_DECIMAL = ["lib/format.ts", "app/api/admin/export/route.ts"];

const DECIMAL = /\b(toDecimalHours|formatDecimalHours)\b/;

function filesIn(dir: string): string[] {
  const found: string[] = [];

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const next = path.join(current, entry);
      if (statSync(next).isDirectory()) walk(next);
      else if (/\.tsx?$/.test(entry)) found.push(next);
    }
  };

  walk(dir);
  return found;
}

function relative(file: string): string {
  return path.relative(SRC, file).split(path.sep).join("/");
}

describe("tim:min", () => {
  it("skriver timmar och minuter", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(510)).toBe("8:30");
    expect(formatDuration(2025)).toBe("33:45");
  });

  it("räknar timmar över dygnet, inte klockslag", () => {
    // 44:30 och inte 20:30. En period är en längd, inte en tid på dygnet.
    expect(formatDuration(2670)).toBe("44:30");
  });

  it("avrundar till närmaste minut", () => {
    expect(formatDuration(89.6)).toBe("1:30");
    expect(formatDuration(89.4)).toBe("1:29");
  });
});

describe("saldon", () => {
  it("skriver alltid ut tecknet", () => {
    expect(formatSignedDuration(135)).toBe("+2:15");
    expect(formatSignedDuration(-45)).toBe("−0:45");
  });

  it("noll är noll, varken plus eller minus", () => {
    // Ett "+0:00" påstår att personen ligger över, vilket hen inte gör.
    expect(formatSignedDuration(0)).toBe("0:00");
    expect(formatSignedDuration(0.4)).toBe("0:00");
  });

  it("minustecknet är det typografiska, inte ett bindestreck", () => {
    // Skärmen ska ha riktigt minustecken. PDF-filerna byter till bindestreck
    // själva, eftersom pdfkits Helvetica inte kan rita U+2212.
    expect(formatSignedDuration(-60)).toContain("−");
  });
});

describe("decimaltimmar", () => {
  it("är två decimaler", () => {
    expect(toDecimalHours(119)).toBe(1.98);
    expect(toDecimalHours(120)).toBe(2);
    expect(toDecimalHours(2025)).toBe(33.75);
  });

  it("1,99 och 1:59 är inte samma tal", () => {
    // Hela skälet till att formaten hålls isär. 1,99 timmar är 119,4 minuter,
    // 1:59 är 119. Den som läser det ena som det andra räknar fel.
    expect(toDecimalHours(119)).toBe(1.98);
    expect(formatDuration(119)).toBe("1:59");
  });
});

describe("ingen skärm visar decimaltimmar", () => {
  const files = filesIn(SRC);

  it("hittar filer att granska", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("decimaltimmar används bara där de ska räknas", () => {
    const offenders = files
      .filter((file) => DECIMAL.test(readFileSync(file, "utf8")))
      .map(relative)
      .filter((file) => !MAY_USE_DECIMAL.includes(file));

    expect(
      offenders,
      "Dessa filer räknar i decimaltimmar. Tid som någon ska LÄSA skrivs " +
        "tim:min med formatDuration eller formatSignedDuration. " +
        "Decimaltimmar hör hemma i Excel-arket, som är till för att räkna " +
        "vidare i."
    ).toEqual([]);
  });

  it("varje undantag används faktiskt", () => {
    // Ett undantag som ingen längre behöver är ett hål som står kvar och
    // väntar på nästa fil med samma behov.
    for (const file of MAY_USE_DECIMAL) {
      expect(
        DECIMAL.test(readFileSync(path.join(SRC, file), "utf8")),
        `Undantaget ${file} räknar inte längre i decimaltimmar`
      ).toBe(true);
    }
  });
});
