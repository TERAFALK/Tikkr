import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { BRAND } from "@/lib/brand";

/**
 * SEX FÄRGER, OCH INGA FLER.
 *
 * Tikkr brand guidelines v1.0 ger sex färger. Originalet ligger i
 * `brand/Tikkr-brand-guidelines.pdf`.
 *
 * Varför ett test och inte bara en rad i CLAUDE.md: gränssnittet växer en sida
 * i taget, och Tailwind levererar tjugotvå färgskalor som alla är ett klassnamn
 * bort. `bg-sky-600` är lika lätt att skriva som `bg-blue-600` och ser lika
 * rimlig ut i en kodgranskning. Det var precis så rasten blev ljusblå på
 * stämplingsskärmen, och violett, rosa och cyan hamnade bland porträtten.
 *
 * Samma sorts skyddsnät som format.test.ts, ui-text.test.ts och
 * module-coverage.test.ts: regeln står som text att läsa, och mäts där den går
 * att mäta.
 *
 * Behöver ingen databas.
 */

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

/* -------------------------------------------------------------------------- */
/* Paletten                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Hexkoderna, avskrivna ur guiden för hand.
 *
 * Avsiktligt INTE importerade från `brand.ts` — det är den filen som ska
 * kontrolleras. Ett test som läser samma värde det jämför med påstår bara att
 * en variabel är lika med sig själv.
 */
const GUIDELINES = {
  fjord: "#0E1A2B",
  tick: "#2ED196",
  tickDeep: "#0F9E68",
  sno: "#F5F6F2",
  skiffer: "#5B6573",
  lav: "#D9DDD6",
} as const;

/**
 * Skalorna som får användas, och vad de betyder.
 *
 * `neutral`, `blue` och `emerald` har fått varumärkets värden i
 * `src/app/globals.css` — gråskalan Snö→Fjord, Fjord, respektive Tick. Namnen
 * är Tailwinds och beskriver därför inte längre en färg; se kommentaren i
 * globals.css om varför de skrivs över i stället för att döpas om.
 *
 * `amber` och `red` är funktionella och har ingen motsvarighet i guiden. Gult
 * säger "kräver din uppmärksamhet", rött "går inte att ångra". Att tolka Fjord
 * eller grönt som en varning hade gjort gränssnittet svårare att läsa för att
 * en palett skulle stämma, och en varning som ser ut som allt annat är ingen
 * varning.
 */
const ALLOWED_SCALES = ["neutral", "blue", "emerald", "amber", "red"];

/** Skalorna Tailwind levererar och som alltså går att råka skriva. */
const TAILWIND_SCALES = [
  "slate",
  "gray",
  "zinc",
  "stone",
  "orange",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "sky",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

const OFF_PALETTE = new RegExp(
  `\\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|` +
    `shadow|accent|caret|placeholder)-(?:${TAILWIND_SCALES.join("|")})-\\d{2,3}\\b`,
  "g"
);

function filesIn(dir: string, pattern: RegExp): string[] {
  const found: string[] = [];

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const next = path.join(current, entry);
      if (statSync(next).isDirectory()) walk(next);
      else if (pattern.test(entry)) found.push(next);
    }
  };

  walk(dir);
  return found;
}

/* -------------------------------------------------------------------------- */
/* Kontrollerna                                                                */
/* -------------------------------------------------------------------------- */

describe("paletten är varumärkets", () => {
  it("brand.ts har guidens sex hexkoder", () => {
    expect(BRAND).toEqual(GUIDELINES);
  });

  it("globals.css definierar de sex färgerna som tokens", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");

    const tokens = {
      "--color-fjord": GUIDELINES.fjord,
      "--color-tick": GUIDELINES.tick,
      "--color-tick-deep": GUIDELINES.tickDeep,
      "--color-sno": GUIDELINES.sno,
      "--color-skiffer": GUIDELINES.skiffer,
      "--color-lav": GUIDELINES.lav,
    };

    for (const [token, hex] of Object.entries(tokens)) {
      const match = css.match(
        new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`)
      );

      expect(match, `${token} saknas i globals.css`).not.toBeNull();
      expect(
        match![1].toLowerCase(),
        `${token} ska vara ${hex} enligt guiden`
      ).toBe(hex.toLowerCase());
    }
  });

  it("de omskrivna skalorna landar på varumärkets färger", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");

    /*
      Stegen som BÄR en varumärkesfärg, och som därför inte får glida.

      Gråskalans ändpunkter är de som syns mest: 50 är varje sidas bakgrund,
      200 varje ram, 500 all sekundär text, 900 all brödtext. Går ett av dem
      sönder ser hela produkten fel ut, och det är den sortens fel som är lätt
      att vänja sig vid i stället för att upptäcka.
    */
    const anchors: Array<[string, string]> = [
      ["--color-neutral-50", GUIDELINES.sno],
      ["--color-neutral-200", GUIDELINES.lav],
      ["--color-neutral-500", GUIDELINES.skiffer],
      ["--color-neutral-900", GUIDELINES.fjord],
      ["--color-blue-600", GUIDELINES.fjord],
      ["--color-emerald-400", GUIDELINES.tick],
      ["--color-emerald-600", GUIDELINES.tickDeep],
    ];

    for (const [token, hex] of anchors) {
      const match = css.match(
        new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`)
      );

      expect(match, `${token} saknas i globals.css`).not.toBeNull();
      expect(match![1].toLowerCase(), `${token} ska vara ${hex}`).toBe(
        hex.toLowerCase()
      );
    }
  });
});

describe("inga färger utanför paletten", () => {
  const files = filesIn(SRC, /\.(tsx|ts|css)$/);

  it("hittar filer att granska", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("ingen fil använder en Tailwind-skala utanför paletten", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const found = [...new Set(source.match(OFF_PALETTE) ?? [])];

      if (found.length > 0) {
        offenders.push(`${path.relative(ROOT, file)}: ${found.join(", ")}`);
      }
    }

    expect(
      offenders,
      `Tikkr har sex färger, och Tailwinds övriga skalor är inte en av dem.\n` +
        `Gråskala: neutral-*. Något som går att göra: blue-* (Fjord).\n` +
        `Pågår just nu: emerald-* (Tick). Uppmärksamhet: amber-*.\n` +
        `Går inte att ångra: red-*. Se src/app/globals.css.`
    ).toEqual([]);
  });

  it("listan över tillåtna skalor och Tailwinds överlappar inte", () => {
    // En skala som står i båda listorna skulle göra kontrollen ovan till en
    // regel som motsäger sig själv, och den som läste felmeddelandet skulle
    // inte förstå varför.
    const both = ALLOWED_SCALES.filter((scale) =>
      TAILWIND_SCALES.includes(scale)
    );

    expect(both).toEqual([]);
  });
});

describe("logotypen är varumärkesmaterialets egen", () => {
  it("ordmärket ritas som konturer och inte som text", () => {
    const logo = readFileSync(
      path.join(SRC, "components/ui/Logo.tsx"),
      "utf8"
    );

    /*
      Guiden: "Do not retype the wordmark in another font."

      Konturerna ligger i brand.ts och ritas med en path. Står ordet som text
      blir det satt i vad webbläsaren nu har, vilket är något annat än Geist
      varje gång typsnittet inte hunnit laddas — alltså första sidvisningen och
      varje kioskskärm utan nät.
    */
    expect(logo).toContain("WORDMARK.path");
    expect(logo).not.toMatch(/>\s*[Tt]ikkr\s*</);
  });

  it("ingen yta skriver ordmärket som text bredvid märket", () => {
    const offenders: string[] = [];

    for (const file of filesIn(SRC, /\.tsx$/)) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      // Ordet mellan två taggar, alltså utskrivet för ögat. Att nämna Tikkr i
      // en mening är något annat och fullt tillåtet.
      if (/>\s*[Tt]ikkr\s*</.test(source)) {
        offenders.push(path.relative(ROOT, file));
      }
    }

    expect(
      offenders,
      "Ordmärket ritas med WordmarkOnly ur components/ui/Logo.tsx."
    ).toEqual([]);
  });
});
