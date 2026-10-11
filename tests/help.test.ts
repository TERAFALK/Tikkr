import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { HELP_AREAS } from "@/lib/help/areas";
import { GUIDES, guideBySlug, type Guide } from "@/lib/help/guides";
import { HELP_FAQ } from "@/lib/help/faq";
import { normalize, searchGuides } from "@/lib/help/search";
import { middleware } from "@/middleware";

/**
 * HJÄLPCENTRET.
 *
 * Tre saker som annars går sönder i tysthet:
 *
 * 1. **En länk till en guide som inte finns.** Panelens hjälplänkar är
 *    typade, men en adress skriven som "/hjalp/..." i en vanlig sträng är det
 *    inte. Kunden trycker, får en 404 och slutar trycka.
 * 2. **Sökningen.** Den som skriver "stampla" på en surfplatta utan å ska
 *    hitta samma sak som den som skriver "stämpla".
 * 3. **Adressen.** Med SUPPORT_HOST satt ska varje guide ha en adress och
 *    inte tre, och systemets sidor ska aldrig hamna på hjälpadressen.
 *
 * Behöver ingen databas.
 */

const ROOT = path.resolve(__dirname, "..");
const guides = GUIDES as readonly Guide[];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const next = path.join(current, entry);
      if (statSync(next).isDirectory()) walk(next);
      else if (/\.tsx?$/.test(entry)) found.push(next);
    }
  };
  walk(path.join(ROOT, dir));
  return found;
}

describe("guiderna", () => {
  it("har unika adresser i gemener med bindestreck", () => {
    const slugs = guides.map((guide) => guide.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("har minst ett steg, en sammanfattning och ett känt område", () => {
    for (const guide of guides) {
      expect(guide.steps.length, guide.slug).toBeGreaterThan(0);
      expect(guide.summary.length, guide.slug).toBeGreaterThan(0);
      expect(HELP_AREAS[guide.area], guide.slug).toBeDefined();
    }
  });

  it("pekar bara ut relaterade guider som finns", () => {
    for (const guide of guides) {
      for (const slug of guide.related ?? []) {
        expect(guideBySlug(slug), `${guide.slug} → ${slug}`).toBeDefined();
        expect(slug, `${guide.slug} pekar på sig själv`).not.toBe(guide.slug);
      }
    }
  });

  it("vanliga frågor pekar på guider som finns", () => {
    for (const item of HELP_FAQ) {
      expect(guideBySlug(item.guide), item.q).toBeDefined();
    }
  });
});

describe("länkarna till hjälpcentret", () => {
  // Varje ställe i koden som nämner en guide: help="…", guide="…" och
  // adresser skrivna som "/hjalp/…". Kommentarer räknas inte.
  const references = sourceFiles("src").flatMap((file) => {
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    const found: { file: string; slug: string }[] = [];
    const patterns = [
      /\b(?:help|guide)="([a-z0-9-]+)"/g,
      /["'`]\/hjalp\/([a-z0-9-]+)["'`]/g,
    ];
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        found.push({ file: path.relative(ROOT, file), slug: match[1] });
      }
    }
    return found;
  });

  it("hittar länkar att granska", () => {
    // Ett tomt urval hade gett ett grönt test som inte kontrollerar något.
    expect(references.length).toBeGreaterThan(15);
  });

  it("varje länk leder till en guide som finns", () => {
    const broken = references.filter(({ slug }) => !guideBySlug(slug));
    expect(
      broken,
      "En hjälplänk pekar på en guide som inte finns i src/lib/help/guides.ts."
    ).toEqual([]);
  });
});

describe("sökningen", () => {
  it("jämför å, ä och ö som a och o", () => {
    expect(normalize("Stämpla Ut Frånvaro")).toBe("stampla ut franvaro");
  });

  it("tom fråga ger inga träffar", () => {
    expect(searchGuides("")).toEqual([]);
    expect(searchGuides("   ")).toEqual([]);
  });

  it("hittar samma guide med och utan svenska tecken", () => {
    const withDiacritics = searchGuides("stämpla in");
    const without = searchGuides("stampla in");
    expect(withDiacritics[0]?.slug).toBe("stampla-in-och-ut");
    expect(without.map((hit) => hit.slug)).toEqual(
      withDiacritics.map((hit) => hit.slug)
    );
  });

  it("rubriken går före en träff längre ner i texten", () => {
    expect(searchGuides("koppla skärm")[0]?.slug).toBe("koppla-skarm");
    expect(searchGuides("efterkalkyl")[0]?.slug).toBe("efterkalkyl");
  });

  it("hittar på kundens egna ord, inte bara produktens", () => {
    expect(searchGuides("kiosk").map((hit) => hit.slug)).toContain("koppla-skarm");
    expect(searchGuides("sjuk")[0]?.slug).toBe("franvaro");
    expect(searchGuides("glömt stämpla ut").map((hit) => hit.slug)).toContain(
      "granskning"
    );
  });

  it("matchar början av ett ord", () => {
    expect(searchGuides("planer")[0]?.slug).toBe("planering");
  });

  it("alla sökord måste träffa", () => {
    expect(searchGuides("stämpla xyzzy")).toEqual([]);
  });
});

describe("hjälpcentrets adress", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  function configure() {
    process.env.MARKETING_HOST = "www.tikkr.se";
    process.env.PORTAL_HOST = "portal.tikkr.se";
    process.env.SUPPORT_HOST = "support.tikkr.se";
  }

  // Host-huvudet sätts för hand. En webbläsare skickar det alltid, men en
  // NextRequest som byggs ur en adress gör det inte, och middleware läser
  // värden ur huvudet och inte ur adressen.
  function visit(url: string) {
    const response = middleware(
      new NextRequest(url, { headers: { host: new URL(url).host } })
    );
    return response.headers.get("location");
  }

  it("startsidan på hjälpadressen leder till /hjalp", () => {
    configure();
    expect(visit("https://support.tikkr.se/")).toBe(
      "https://support.tikkr.se/hjalp"
    );
  });

  it("en guide på hjälpadressen visas där den är", () => {
    configure();
    expect(visit("https://support.tikkr.se/hjalp/koppla-skarm")).toBeNull();
  });

  it("en guide på säljsidan eller portalen leder till hjälpadressen", () => {
    configure();
    expect(visit("https://www.tikkr.se/hjalp/koppla-skarm")).toBe(
      "https://support.tikkr.se/hjalp/koppla-skarm"
    );
    expect(visit("https://portal.tikkr.se/hjalp")).toBe(
      "https://support.tikkr.se/hjalp"
    );
  });

  it("systemets sidor på hjälpadressen leder till portalen", () => {
    configure();
    expect(visit("https://support.tikkr.se/admin/login")).toBe(
      "https://portal.tikkr.se/admin/login"
    );
  });

  it("säljsidans sidor på hjälpadressen leder till säljsidan", () => {
    configure();
    expect(visit("https://support.tikkr.se/villkor")).toBe(
      "https://www.tikkr.se/villkor"
    );
  });

  it("utan SUPPORT_HOST ligger hjälpcentret kvar där det är", () => {
    configure();
    delete process.env.SUPPORT_HOST;
    expect(visit("https://www.tikkr.se/hjalp/koppla-skarm")).toBeNull();
  });
});
