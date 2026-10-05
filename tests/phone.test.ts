import { describe, it, expect } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";

/**
 * Telefonnummer till den som registrerar en arbetsyta.
 *
 * Samma nummer skrivs på många sätt, och ska sparas på ett. Det testerna
 * skyddar: de vanliga svenska skrivsätten blir samma E.164-nummer, utländska
 * nummer med landsnummer godtas, och det som uppenbart inte är ett nummer
 * avvisas.
 */

describe("normalizePhone", () => {
  it.each([
    "070-123 45 67",
    "0701234567",
    "070 123 45 67",
    "+46 70 123 45 67",
    "+46701234567",
    "0046701234567",
    "+46 (0)70 123 45 67",
    "+46 070 123 45 67",
    "(070) 123-45-67",
  ])("%s blir +46701234567", (raw) => {
    expect(normalizePhone(raw)).toBe("+46701234567");
  });

  it("ett fast nummer i Stockholm", () => {
    expect(normalizePhone("08-123 456 78")).toBe("+46812345678");
  });

  it("ett utländskt nummer med landsnummer", () => {
    expect(normalizePhone("+47 912 34 567")).toBe("+4791234567");
  });

  it.each([
    "",
    "   ",
    "070-123",
    "telefon",
    "070-123 45 67 ankn 12",
    "701234567",
    "+46 70 123 45 67 89 10",
    "+0 123 456 789",
  ])("%j avvisas", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("svenska mobilnummer grupperas som de brukar skrivas", () => {
    expect(formatPhone("+46701234567")).toBe("+46 70 123 45 67");
  });

  it("övriga svenska nummer får landsnumret avskilt", () => {
    expect(formatPhone("+46812345678")).toBe("+46 812345678");
  });

  it("utländska nummer visas som de lagrats", () => {
    expect(formatPhone("+4791234567")).toBe("+4791234567");
  });
});
