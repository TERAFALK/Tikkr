import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * EN RUTA STÄNGER PÅ VARJE LYCKAT SVAR, INTE BARA PÅ DET FÖRSTA.
 *
 * Åtgärderna svarar med samma mening varje gång ("Stämplingen är inlagd.").
 * En effekt som lyssnar på texten, `[state.ok]`, körs därför bara första
 * gången: andra sparandet i samma sidladdning ger samma sträng, rutan stannar
 * öppen med tömda fält, och det ser ut som att ingenting sparades fast posten
 * finns. Pilotkunden fastnade på det i Ny stämpling 2026-10-21, och samma fel
 * var redan rättat i ActionDialog.
 *
 * Jämför svaret som objekt, som ActionDialog gör, eller låt åtgärden svara
 * med `savedAt: Date.now()`.
 *
 * Behöver ingen databas.
 */

const ROOT = path.resolve(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("rutor som stänger när åtgärden lyckats", () => {
  it("lyssnar inte på svarets text", () => {
    const offenders = tsxFiles(path.join(ROOT, "src"))
      .filter((file) => /\[\s*state\.ok\s*\]/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
