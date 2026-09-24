import { describe, it, expect } from "vitest";
import { mainMinutes } from "@/lib/spans";

/**
 * Huvudstämplingen.
 *
 * Rapporterna summerar rakt av: två maskiner en timme är två maskintimmar, och
 * båda ordrarna betalar sin. Översikten och veckovyn räknar i stället bara det
 * jobb personen faktiskt började på, och hoppar över sidojobben helt.
 *
 * Regeln: en stämpling räknas bara om ingenting annat pågick när den började.
 *
 * Går den här filen sönder börjar de två vyerna säga olika saker om samma dag
 * utan att någon förstår varför.
 */

const HOUR = 60 * 60 * 1000;

/** Klockslag samma dygn, som millisekunder. Gör passen läsbara. */
function span(fromHour: number, toHour: number) {
  return { from: fromHour * HOUR, to: toHour * HOUR };
}

describe("ett jobb i taget", () => {
  it("ger noll när inget registrerats", () => {
    expect(mainMinutes([])).toBe(0);
  });

  it("räknar ett ensamt pass rakt av", () => {
    expect(mainMinutes([span(8, 12)])).toBe(240);
  });

  it("lägger ihop pass som inte rör varandra", () => {
    expect(mainMinutes([span(8, 12), span(13, 17)])).toBe(480);
  });

  it("bryr sig inte om vilken ordning passen kommer i", () => {
    expect(mainMinutes([span(13, 17), span(8, 12)])).toBe(480);
  });

  it("räknar inte ett pass utan längd", () => {
    // En instämpling som ångrats i samma sekund. Finns i databasen, men är
    // ingen tid.
    expect(mainMinutes([span(8, 8)])).toBe(0);
  });

  it("kant i kant är två huvudjobb", () => {
    // Utstämpling och instämpling i samma ögonblick vid ett jobbyte. Det andra
    // jobbet började inte medan något pågick, alltså är det ett huvudjobb.
    expect(mainMinutes([span(8, 12), span(12, 16)])).toBe(480);
  });
});

describe("sidojobb räknas inte", () => {
  it("fräsen som startas mitt i svetsningen räknas inte alls", () => {
    // Svets 08–12 och fräs 11–15. Dagen är fyra timmar, inte sju och inte
    // åtta: varken den överlappande timmen eller 12–15 räknas, eftersom fräsen
    // aldrig blev huvudjobbet.
    expect(mainMinutes([span(8, 12), span(11, 15)])).toBe(240);
  });

  it("ett jobb helt inuti ett annat lägger ingenting till", () => {
    expect(mainMinutes([span(8, 16), span(10, 12)])).toBe(480);
  });

  it("tre pass ovanpå varandra räknas som ett", () => {
    expect(mainMinutes([span(8, 12), span(8, 12), span(8, 12)])).toBe(240);
  });

  it("två jobb som startar i exakt samma ögonblick ger ett", () => {
    expect(mainMinutes([span(8, 12), span(8, 16)])).toBe(240);
  });

  it("ett jobb som börjar medan ett SIDOJOBB pågår är också ett sidojobb", () => {
    // Svets 08–12 (huvud), fräs 11–18 (sido), borr 13–14. Borren startade
    // medan fräsen gick — personen stod redan vid en maskin. Bara svetsen.
    expect(mainMinutes([span(8, 12), span(11, 18), span(13, 14)])).toBe(240);
  });

  it("ett jobb efter att allt tagit slut är ett nytt huvudjobb", () => {
    // Svets 08–12 (huvud), fräs 11–15 (sido), montering 16–18. Ingenting
    // pågick klockan 16, alltså räknas monteringen: 4 + 2 timmar.
    expect(mainMinutes([span(8, 12), span(11, 15), span(16, 18)])).toBe(360);
  });
});
