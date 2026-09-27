import { describe, it, expect } from "vitest";
import { maskTimeInput, normalizeTimeOfDay } from "@/lib/time-input";
import { parseMinuteOfDay } from "@/lib/schedule";

/**
 * KOLONET SOM SKRIVS ÅT ANVÄNDAREN.
 *
 * Ett veckoschema är fjorton klockslag plus rasterna. Skriver man kolonet
 * själv är det trettio extra tangenttryck i ett formulär som fylls i en gång
 * och sedan sällan — alltså precis den sortens friktion man inte hinner vänja
 * sig vid.
 *
 * Testet skriver siffra för siffra, som en människa gör, och kontrollerar vad
 * som står i fältet efter varje tryck.
 */

/** Trycker siffrorna en i taget, med masken emellan. */
function type(digits: string): string {
  let value = "";
  for (const digit of digits) value = maskTimeInput(value + digit);
  return value;
}

/** Ett backsteg: sista tecknet bort, och masken vet att det var en radering. */
function backspace(value: string): string {
  return maskTimeInput(value.slice(0, -1), true);
}

describe("skriva ett klockslag", () => {
  it("0630 blir 06:30", () => {
    expect(type("0")).toBe("0");
    expect(type("06")).toBe("06:");
    expect(type("063")).toBe("06:3");
    expect(type("0630")).toBe("06:30");
  });

  it("1800 blir 18:00", () => {
    expect(type("1")).toBe("1");
    expect(type("18")).toBe("18:");
    expect(type("1800")).toBe("18:00");
  });

  it("en siffra över 2 kan bara vara en hel timme, och fylls på direkt", () => {
    expect(type("9")).toBe("09:");
    expect(type("930")).toBe("09:30");
    expect(type("7")).toBe("07:");
  });

  it("den som ändå skriver kolon får inte två", () => {
    expect(maskTimeInput("06:")).toBe("06:");
    expect(maskTimeInput("06:3")).toBe("06:3");
    expect(maskTimeInput("06:30")).toBe("06:30");
  });

  it("femte siffran faller bort", () => {
    expect(maskTimeInput("06:305")).toBe("06:30");
  });

  it("backsteg tar bort kolonet istället för att sätta tillbaka det", () => {
    expect(backspace("06:")).toBe("06");
    expect(backspace("06")).toBe("0");
    expect(backspace("0")).toBe("");
  });

  it("inklistrat värde tolkas som det ser ut", () => {
    expect(maskTimeInput("6:30")).toBe("6:30");
    expect(maskTimeInput("630")).toBe("6:30");
    expect(maskTimeInput("6.30")).toBe("6:30");
    expect(maskTimeInput("kl 0630")).toBe("06:30");
  });
});

describe("städa ett skrivet klockslag", () => {
  it("fyller i kolon och nollor", () => {
    expect(normalizeTimeOfDay("630")).toBe("06:30");
    expect(normalizeTimeOfDay("0630")).toBe("06:30");
    expect(normalizeTimeOfDay("6:30")).toBe("06:30");
    expect(normalizeTimeOfDay("6.30")).toBe("06:30");
    expect(normalizeTimeOfDay(" 1800 ")).toBe("18:00");
  });

  it("enbart timme är hel timme", () => {
    expect(normalizeTimeOfDay("7")).toBe("07:00");
    expect(normalizeTimeOfDay("18")).toBe("18:00");
  });

  it("kolonet masken satte dit räknas inte som en halv inmatning", () => {
    // Skriver man bara "9" står det "09:" i fältet. Sparas det ska det bli
    // klockan nio, inte avvisas för att minuterna saknas.
    expect(normalizeTimeOfDay(maskTimeInput("9"))).toBe("09:00");
    expect(normalizeTimeOfDay("18:")).toBe("18:00");
    expect(normalizeTimeOfDay("6.")).toBe("06:00");
  });

  it("vägrar det som inte är ett klockslag", () => {
    expect(normalizeTimeOfDay("")).toBeNull();
    expect(normalizeTimeOfDay("24:00")).toBeNull();
    expect(normalizeTimeOfDay("12:60")).toBeNull();
    expect(normalizeTimeOfDay("halv sju")).toBeNull();
    expect(normalizeTimeOfDay("12345")).toBeNull();
  });
});

describe("schemat tolkar samma siffror som fältet", () => {
  it("siffror utan kolon går fram även om skriptet inte hunnit köra", () => {
    expect(parseMinuteOfDay("0630")).toBe(390);
    expect(parseMinuteOfDay("630")).toBe(390);
    expect(parseMinuteOfDay("06:30")).toBe(390);
    expect(parseMinuteOfDay("16")).toBe(960);
  });

  it("skräp är fortfarande skräp", () => {
    expect(parseMinuteOfDay("25:00")).toBeNull();
    expect(parseMinuteOfDay("")).toBeNull();
  });

  it("en ensam timme blir hel timme hela vägen", () => {
    expect(parseMinuteOfDay("9")).toBe(540);
    expect(parseMinuteOfDay("09:")).toBe(540);
  });
});
