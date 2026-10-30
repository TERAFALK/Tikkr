import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { BRAND } from "@/lib/brand";

/**
 * TEXT SOM SKA LÄSAS NÅR 4,5:1 (WCAG 1.4.3).
 *
 * Tick Deep på vitt ger 3,44:1 och `neutral-400` 3,37:1, och båda användes på
 * länkar och hjälptext över hela panelen. Tailwind har tjugotvå färgskalor ett
 * klassnamn bort, så det här är samma sorts skyddsnät som brand.test.ts.
 *
 * Tick Deep står kvar på ikoner och ytor. Där är kravet 3:1. Säljsidan och
 * inloggningens mörka yta ligger utanför: där står texten på Fjord.
 */
const SRC = path.resolve(__dirname, "..", "src");

const PANEL_DIRS = [
  "app/admin",
  "app/plattform",
  "app/kiosk",
  "components/admin",
  "components/platform",
  "components/kiosk",
  "components/help",
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

const panel = PANEL_DIRS.flatMap((dir) => files(path.join(SRC, dir)));

function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe("läsbar text i panelerna", () => {
  it("hittar filer att granska", () => {
    expect(panel.length).toBeGreaterThan(80);
  });

  it("länkad text använder text-link och inte Tick Deep", () => {
    const offenders = panel.filter((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .some((line) => /text-tick-deep/.test(line) && /underline/.test(line))
    );

    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("länkfärgen når kravet mot vitt och mot Snö", () => {
    // Samma värde som --color-emerald-700 i globals.css.
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    const link = css.match(/--color-emerald-700: (#[0-9a-f]{6})/i)?.[1];

    expect(link).toBeTruthy();
    expect(css).toContain("--color-link: var(--color-emerald-700)");
    expect(contrast(link!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(link!, BRAND.sno)).toBeGreaterThanOrEqual(4.5);
  });

  it("gul text är tillräckligt mörk", () => {
    const offenders = panel.filter((file) =>
      /(?<![:\w-])text-amber-[3-6]00/.test(readFileSync(file, "utf8"))
    );

    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });
});
