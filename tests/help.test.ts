import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { HELP_AREAS, areaForPath } from "@/lib/help/areas";
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
 *    typade, men en adress skriven som "/support/..." i en vanlig sträng är det
 *    inte. Kunden trycker, får en 404 och slutar trycka.
 * 2. **Sökningen.** Den som skriver "stampla" på en surfplatta utan å ska
 *    hitta samma sak som den som skriver "stämpla".
 * 3. **Adressen.** En hjälplänk i portalen ska landa på samma guide på
 *    säljsidan, där Tikkr-märket leder till startsidan och inte till panelen.
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
  // adresser skrivna som "/support/…". Kommentarer räknas inte.
  const references = sourceFiles("src").flatMap((file) => {
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    const found: { file: string; slug: string }[] = [];
    const patterns = [
      /\b(?:help|guide)="([a-z0-9-]+)"/g,
      /["'`]\/support\/([a-z0-9-]+)["'`]/g,
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

describe("området för en sida i panelen", () => {
  it("förväljer rätt område, även på en undersida", () => {
    expect(areaForPath("/admin/planering")).toBe("PLANNING");
    expect(areaForPath("/admin/planering/stationer")).toBe("PLANNING");
    expect(areaForPath("/admin/installningar/franvaro")).toBe("PAYROLL");
    expect(areaForPath("/admin/installningar/prenumeration")).toBe("ACCOUNT");
  });

  it("ingen gissning där sidan inte hör till ett område", () => {
    expect(areaForPath("/admin")).toBeNull();
    expect(areaForPath("/admin/installningar")).toBeNull();
    expect(areaForPath("/admin/planeringar")).toBeNull();
    expect(areaForPath(null)).toBeNull();
  });
});

describe("hjälpcentrets adress", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  function configure() {
    process.env.MARKETING_HOST = "www.tikkr.se,tikkr.se";
    process.env.PORTAL_HOST = "portal.tikkr.se";
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

  it("en hjälplänk i portalen leder till samma guide på säljsidan", () => {
    configure();
    expect(visit("https://portal.tikkr.se/support/koppla-skarm")).toBe(
      "https://www.tikkr.se/support/koppla-skarm"
    );
    expect(visit("https://portal.tikkr.se/support")).toBe(
      "https://www.tikkr.se/support"
    );
  });

  it("hjälpcentret på säljsidan visas där det är", () => {
    configure();
    expect(visit("https://www.tikkr.se/support")).toBeNull();
    expect(visit("https://tikkr.se/support/koppla-skarm")).toBeNull();
  });

  it("bara /support och inget som börjar likadant", () => {
    configure();
    expect(visit("https://portal.tikkr.se/supportsida")).toBeNull();
  });

  it("utan egna adresser ligger allt kvar där det är", () => {
    delete process.env.MARKETING_HOST;
    delete process.env.PORTAL_HOST;
    expect(visit("https://www.tikkr.se/support/koppla-skarm")).toBeNull();
  });
});
