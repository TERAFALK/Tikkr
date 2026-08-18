import { describe, it, expect } from "vitest";
import { initialsOf } from "@/components/ui/EmployeeAvatar";

/**
 * Initialerna som visas när ett porträtt saknas.
 *
 * De ska skilja personer åt. En generisk siluett för alla utan foto hade gjort
 * halva rutnätet identiskt, vilket är sämre än inget alls — namnet står ju
 * bredvid.
 */
describe("initialer ur ett namn", () => {
  it("tar förnamnets och efternamnets första bokstav", () => {
    expect(initialsOf("Anna Andersson")).toBe("AA");
    expect(initialsOf("Björn Bergqvist")).toBe("BB");
  });

  it("ett ensamt namn ger en bokstav", () => {
    expect(initialsOf("Kalle")).toBe("K");
  });

  it("mellannamn hoppas över", () => {
    expect(initialsOf("Anna Maria Andersson")).toBe("AA");
  });

  it("extra mellanslag stör inte", () => {
    expect(initialsOf("  Erik   Ek  ")).toBe("EE");
  });

  it("svenska tecken versaliseras rätt", () => {
    expect(initialsOf("Åke Öberg")).toBe("ÅÖ");
  });

  it("tomt namn ger ett frågetecken i stället för en tom ruta", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});
