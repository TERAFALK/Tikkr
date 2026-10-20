import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  formatDuration,
  formatSignedDuration,
  toDecimalHours,
} from "@/lib/format";

/**
 * ETT FORMAT: DECIMALTIMMAR.
 *
 * Tid skrivs "8,5" överallt kunden ser den — panelen, kiosken, varje PDF,
 * Excel-arket och säljsidans produktbilder. Se CLAUDE.md § 7.1 punkt 8.
 *
 * Till 2026-10-14 gällde det omvända: tim:min på skärmen, decimaltimmar bara i
 * arket. Den regeln kom ur en bugg, och buggen var inte att decimaltimmar är
 * svårlästa — den var att TVÅ format stod på samma sida om samma dag, och
 * "1,99" lästes som 1:59. Ett enda format har inget att läsa fel.
 *
 * Kontrollerna längst ner är de viktiga. De läser källkoden och fäller en ny
 * yta som visar tim:min, även om ingen kommer ihåg att den här filen finns.
 * Samma teknik som ui-text.test.ts och module-coverage.test.ts.
 */

const SRC = path.resolve(__dirname, "..", "src");

describe("decimaltimmar", () => {
  it("skriver timmar som ett tal", () => {
    expect(formatDuration(0)).toBe("0");
    expect(formatDuration(90)).toBe("1,5");
    expect(formatDuration(510)).toBe("8,5");
    expect(formatDuration(2025)).toBe("33,75");
  });

  it("tar bort nollor i slutet", () => {
    // Kundens val. "8" läses som åtta timmar utan att man räknar decimaler.
    expect(formatDuration(60)).toBe("1");
    expect(formatDuration(120)).toBe("2");
    expect(formatDuration(630)).toBe("10,5");
  });

  it("skriver komma och aldrig punkt", () => {
    // Svensk text, samma decimaltecken som beloppen har.
    expect(formatDuration(510)).not.toContain(".");
    expect(formatDuration(510)).toContain(",");
  });

  it("räknar timmar över dygnet, inte klockslag", () => {
    // 44,5 och inte 20,5. En period är en längd, inte en tid på dygnet.
    expect(formatDuration(2670)).toBe("44,5");
    expect(formatDuration(60 * 312 + 45)).toBe("312,75");
  });

  it("avrundar först till hela minuter, sedan till två decimaler", () => {
    // Ordningen är inte likgiltig. En stämpling bär sekunder, och
    // löneunderlaget räknar i hela minuter (CLAUDE.md § 3 regel 7).
    expect(formatDuration(89.6)).toBe("1,5");
    expect(formatDuration(89.4)).toBe("1,48");
    expect(formatDuration(0.4)).toBe("0");
  });

  it("två decimaler är finare än en minut och tappar därför inget", () => {
    // 0,01 timme är 36 sekunder. En minut är 0,0167.
    expect(formatDuration(1)).toBe("0,02");
    expect(formatDuration(2)).toBe("0,03");
  });
});

describe("saldon", () => {
  it("skriver alltid ut tecknet", () => {
    expect(formatSignedDuration(135)).toBe("+2,25");
    expect(formatSignedDuration(-45)).toBe("−0,75");
  });

  it("noll är noll, varken plus eller minus", () => {
    // Ett "+0" påstår att personen ligger över, vilket hen inte gör.
    expect(formatSignedDuration(0)).toBe("0");
    expect(formatSignedDuration(0.4)).toBe("0");
  });

  it("minustecknet är det typografiska, inte ett bindestreck", () => {
    // Skärmen ska ha riktigt minustecken. PDF-filerna byter till bindestreck
    // själva, eftersom pdfkits Helvetica inte kan rita U+2212.
    expect(formatSignedDuration(-60)).toContain("−");
  });
});

describe("tal att räkna med", () => {
  it("toDecimalHours ger två decimaler som tal", () => {
    // Excel-arkets kolumn är ett TAL och inte en text: arket finns för att
    // summeras i, och en textcell går inte att summera.
    expect(toDecimalHours(119)).toBe(1.98);
    expect(toDecimalHours(120)).toBe(2);
    expect(toDecimalHours(2025)).toBe(33.75);
  });
});

describe("ingen yta visar tim:min", () => {
  /**
   * INGEN LÄNGD SKRIVS MED KOLON.
   *
   * `formatDuration` och `formatSignedDuration` är enda vägen till en tid
   * kunden läser, så det räcker att visa att de aldrig lämnar ett kolon.
   *
   * Hela spannet prövas och inte tre värden: felet som fanns att göra var en
   * återstod som råkade bli tvåsiffrig, och den syns bara i en lång serie.
   */
  it("formateringen lämnar aldrig ett kolon", () => {
    for (let minutes = 0; minutes <= 60 * 400; minutes += 7) {
      expect(formatDuration(minutes)).not.toContain(":");
      expect(formatSignedDuration(-minutes)).not.toContain(":");
    }
  });

  /**
   * SAMMA REGEL FÖR TID SOM ÄR SKRIVEN FÖR HAND.
   *
   * Kontrollen ovanför gäller kod som räknar. Säljsidans produktbilder räknar
   * inte: de skriver tiden som en sträng, och därför stod två av dem i ett
   * annat format än produkten i ett halvår. En säljsida som visar en äldre
   * version är en besvikelse som kommer fram först efter köpet.
   *
   * KLOCKSLAG ÄR UNDANTAGNA, och bara de. Ett pass börjar "07:00" och en rast
   * slutar "12:15" — det är vad produkten skriver, och de bär sina egna fält
   * (`from`, `to`). Bara LÄNGDER är decimala, och de bär fälten nedan.
   */
  it("säljsidans produktbilder skriver längder som decimaltimmar", () => {
    const file = path.join(SRC, "components/marketing/Mockups.tsx");
    const text = readFileSync(file, "utf8");

    // Fälten som bär en LÄNGD i bildernas data. `from` och `to` är klockslag
    // och står med flit utanför.
    const found = [...text.matchAll(/\b(time|sum|hours):\s*"([^"]*)"/g)]
      .filter(([, , value]) => value.includes(":"))
      .map(([, field, value]) => `${field}: "${value}"`);

    expect(
      found,
      "Längderna i produktbilderna ska stå som decimaltimmar, inte som " +
        "tim:min. Samma format som i panelen, kiosken och varje PDF."
    ).toEqual([]);
  });

  /**
   * NYCKELTALEN I SÄLJSIDANS BILDER, OCH DERAS ENHET (tillagt 2026-10-20).
   *
   * Testet ovan läser bildernas datafält. Talen i korten skrivs i stället
   * som `value="…"` direkt i koden, och "Fakturerbar tid 84:30" i hjälten
   * och "Total tid 84,5 tim:min" i rapportbilden gick därför igenom. Ett
   * nyckeltal är aldrig ett klockslag, så inget `value` får ha kolon.
   */
  it("säljsidans nyckeltal har varken kolon eller enheten tim:min", () => {
    const found = ["components/marketing/Mockups.tsx", "components/marketing/Sections.tsx"]
      .flatMap((name) => {
        const text = readFileSync(path.join(SRC, name), "utf8");

        return [
          ...[...text.matchAll(/\bvalue="(\d+:\d{2})"/g)].map(
            ([match]) => `${name}: ${match}`
          ),
          ...[...text.matchAll(/\bhint="tim:min"/g)].map(
            ([match]) => `${name}: ${match}`
          ),
        ];
      });

    expect(
      found,
      "Nyckeltalen i säljsidans bilder ska stå som decimaltimmar, med " +
        "enheten timmar."
    ).toEqual([]);
  });

  /**
   * ENHETEN I KOLUMNRUBRIKEN SÄGER TIMMAR.
   *
   * Rubriken "Tid (tim:min)" stod på nitton ställen innan formatet byttes, och
   * en som står kvar är värre än ingen rubrik alls: den påstår ett format som
   * talet under den inte har.
   */
  it("ingen kolumnrubrik lovar tim:min", () => {
    // Bara rubriken, alltså "(tim:min)" med parenteser. Ordet får stå i en
    // kommentar: filernas historik förklarar varför formatet är som det är,
    // och en kontroll som fäller sin egen förklaring är en kontroll någon
    // stänger av.
    const offenders = sourceFiles().filter((file) =>
      /\(tim:min\)/.test(readFileSync(file, "utf8"))
    );

    expect(
      offenders.map(relative),
      'Rubriken ska bära enheten "(timmar)". Talet under den är decimalt.'
    ).toEqual([]);
  });

  it("hittar filer att granska", () => {
    // Går sökningen sönder ska den falla, inte tiga.
    expect(sourceFiles().length).toBeGreaterThan(50);
  });
});

/** Alla .ts och .tsx under src/. */
function sourceFiles(): string[] {
  const found: string[] = [];

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const next = path.join(current, entry);
      if (statSync(next).isDirectory()) walk(next);
      else if (/\.tsx?$/.test(entry)) found.push(next);
    }
  };

  walk(SRC);
  return found;
}

function relative(file: string): string {
  return path.relative(SRC, file).split(path.sep).join("/");
}
