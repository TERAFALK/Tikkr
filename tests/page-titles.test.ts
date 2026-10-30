import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * VARJE SIDA HAR EN EGEN TITEL.
 *
 * Fliken hette Tikkr på nästan hela panelen. Flera öppna flikar gick inte att
 * skilja åt, och en skärmläsare fick inget besked om vilken sida man kommit
 * till (WCAG 2.4.2). Kontrollen härleder sidorna ur mappen, så att en ny sida
 * fälls även om ingen kommer ihåg den här filen.
 */
const APP = path.resolve(__dirname, "..", "src", "app");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return pages(full);
    return name === "page.tsx" ? [full] : [];
  });
}

const panel = [
  ...pages(path.join(APP, "admin")),
  ...pages(path.join(APP, "plattform")),
  ...pages(path.join(APP, "kiosk")),
];

describe("sidtitlar", () => {
  it("hittar sidorna", () => {
    expect(panel.length).toBeGreaterThan(50);
  });

  it("varje sida namnger sig själv", () => {
    const missing = panel.filter((file) => {
      const source = readFileSync(file, "utf8");
      return !/export const metadata = \{ title: "[^"]+ · Tikkr" \}/.test(source);
    });

    expect(missing.map((file) => path.relative(APP, file))).toEqual([]);
  });
});
