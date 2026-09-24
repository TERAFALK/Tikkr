import { describe, it, expect } from "vitest";
import { mergedMinutes, summedMinutes, parallelMinutes } from "@/lib/spans";

/**
 * Sammanslagen tid.
 *
 * Två maskiner som går samtidigt är två maskintimmar men en arbetstimme.
 * Rapporterna räknar det första, översikten och veckovyn det andra, och den
 * här filen är gränsen mellan svaren. Går den sönder börjar de två vyerna säga
 * olika saker om samma dag utan att någon förstår varför.
 */

const HOUR = 60 * 60 * 1000;

/** Klockslag samma dygn, som millisekunder. Gör passen läsbara. */
function at(hour: number): number {
  return hour * HOUR;
}

function span(from: number, to: number) {
  return { from: at(from), to: at(to) };
}

describe("ett pass i taget", () => {
  it("ger noll när inget registrerats", () => {
    expect(mergedMinutes([])).toBe(0);
    expect(summedMinutes([])).toBe(0);
    expect(parallelMinutes([])).toBe(0);
  });

  it("räknar ett ensamt pass rakt av", () => {
    const spans = [span(8, 12)];

    expect(mergedMinutes(spans)).toBe(240);
    expect(summedMinutes(spans)).toBe(240);
    expect(parallelMinutes(spans)).toBe(0);
  });

  it("lägger ihop pass som inte rör varandra", () => {
    const spans = [span(8, 12), span(13, 17)];

    expect(mergedMinutes(spans)).toBe(480);
    expect(parallelMinutes(spans)).toBe(0);
  });

  it("bryr sig inte om vilken ordning passen kommer i", () => {
    expect(mergedMinutes([span(13, 17), span(8, 12)])).toBe(480);
  });

  it("räknar inte ett pass utan längd", () => {
    // En instämpling som ångrats i samma sekund. Finns i databasen, men är
    // ingen tid.
    expect(mergedMinutes([span(8, 8)])).toBe(0);
  });
});

describe("pass som överlappar", () => {
  it("räknar den gemensamma timmen en gång", () => {
    // Svets 08–12 och fräs 11–15, fyra timmar var: åtta maskintimmar men sju
    // arbetstimmar, eftersom timmen mellan elva och tolv är samma timme.
    const spans = [span(8, 12), span(11, 15)];

    expect(summedMinutes(spans)).toBe(480);
    expect(mergedMinutes(spans)).toBe(420);
    expect(parallelMinutes(spans)).toBe(60);
  });

  it("räknar ett pass som ryms helt inuti ett annat en gång", () => {
    const spans = [span(8, 16), span(10, 12)];

    expect(mergedMinutes(spans)).toBe(480);
    expect(parallelMinutes(spans)).toBe(120);
  });

  it("slår ihop pass som gränsar till varandra utan glapp", () => {
    // Utstämpling och instämpling i samma ögonblick vid ett jobbyte. Det är
    // en sammanhängande period, inte överlapp.
    const spans = [span(8, 12), span(12, 16)];

    expect(mergedMinutes(spans)).toBe(480);
    expect(parallelMinutes(spans)).toBe(0);
  });

  it("håller ihop en kedja av pass som överlappar i tur och ordning", () => {
    const spans = [span(8, 10), span(9, 11), span(10.5, 13)];

    expect(mergedMinutes(spans)).toBe(300);
    expect(summedMinutes(spans)).toBe(390);
    expect(parallelMinutes(spans)).toBe(90);
  });

  it("börjar om efter ett glapp mitt i", () => {
    const spans = [span(8, 12), span(11, 13), span(15, 17)];

    expect(mergedMinutes(spans)).toBe(420);
    expect(parallelMinutes(spans)).toBe(60);
  });

  it("räknar tre pass ovanpå varandra en gång", () => {
    // Aldrig meningen att hända, men en glömd utstämpling räcker för att det
    // ska bli så. Talet ska ändå vara rimligt.
    const spans = [span(8, 12), span(8, 12), span(8, 12)];

    expect(mergedMinutes(spans)).toBe(240);
    expect(summedMinutes(spans)).toBe(720);
    expect(parallelMinutes(spans)).toBe(480);
  });
});
