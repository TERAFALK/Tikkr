import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { OG_IMAGE, pageMetadata } from "@/lib/seo";
import { LEGAL_UPDATED, LEGAL_UPDATED_AT } from "@/lib/legal";

/**
 * METADATAN SOM BARA GÅR SÖNDER I PRODUKTION.
 *
 * Next slår samman metadata GRUNT. Sätter en sida sin egen `openGraph` ersätts
 * rot-layoutens i sin helhet, och `images` ärvs inte in. Säljsidan gjorde
 * precis det och tappade sin delningsbild.
 *
 * Felet var osynligt i labbet, av två skäl. Sidans `openGraph` låg inne i ett
 * villkor på MARKETING_HOST, så utan variabeln gällde layoutens kompletta
 * objekt med bild. Och eftersom sidan aldrig satte `twitter` fortsatte det
 * kortet fungera — en kontroll i X gav grönt ljus på en trasig sida.
 *
 * Ett fel som bara finns i produktion går inte att upptäcka genom att titta.
 * Det här testet tittar i stället på källkoden, precis som brand.test.ts och
 * ui-text.test.ts gör för sina regler.
 *
 * Behöver ingen databas.
 */

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "src/app");

/**
 * Filen som FÅR skriva en egen `openGraph`, med sitt skäl.
 *
 * Rot-layouten är sista utvägen: den gäller för varje sida som inte säger något
 * annat, inklusive panelen och kiosken, och den är inte en sida med egen adress
 * att skicka till `pageMetadata`.
 *
 * Den som lägger till en rad här får skriva varför sidan inte kan gå genom
 * `pageMetadata`. Är det svårt att formulera kan den förmodligen det.
 */
const ALLOWED = ["layout.tsx"];

function filesIn(dir: string): string[] {
  const found: string[] = [];

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const next = path.join(current, entry);
      if (statSync(next).isDirectory()) walk(next);
      else if (/\.tsx?$/.test(entry)) found.push(next);
    }
  };

  walk(dir);
  return found;
}

describe("sidornas metadata byggs på ett ställe", () => {
  const files = filesIn(APP);

  it("hittar filer att granska", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("ingen sida bygger sin egen openGraph", () => {
    const offenders = files
      .filter((file) => !ALLOWED.includes(path.basename(file)))
      .filter((file) => /openGraph\s*:/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(ROOT, file));

    expect(
      offenders,
      "Metadata går genom pageMetadata() i src/lib/seo.ts. Next slår samman " +
        "grunt, så en egen openGraph utan images raderar delningsbilden — och " +
        "det syns bara i produktion."
    ).toEqual([]);
  });

  it("varje publik sida går genom pageMetadata", () => {
    // De fyra sidor som är publika och ligger i sitemap.
    const pages = [
      "page.tsx",
      "villkor/page.tsx",
      "integritetspolicy/page.tsx",
      "personuppgiftsbitradesavtal/page.tsx",
    ];

    const missing = pages.filter(
      (file) => !readFileSync(path.join(APP, file), "utf8").includes("pageMetadata(")
    );

    expect(missing).toEqual([]);
  });
});

describe("pageMetadata ger alltid det som delningen behöver", () => {
  const meta = pageMetadata({
    path: "/villkor",
    title: "Rubrik",
    description: "Beskrivning.",
  });

  it("en delningsbild med mått", () => {
    expect(meta.openGraph?.images).toEqual([OG_IMAGE]);
    expect(OG_IMAGE.width).toBe(1200);
    expect(OG_IMAGE.height).toBe(627);
  });

  it("ett twitterkort, så att de två aldrig säger olika saker", () => {
    // Det var skillnaden mellan dem som dolde felet förra gången.
    expect(meta.twitter).toBeDefined();
    expect(meta.openGraph?.title).toBe(meta.title);
  });

  it("rubriken och beskrivningen följer med", () => {
    expect(meta.title).toBe("Rubrik");
    expect(meta.openGraph?.description).toBe("Beskrivning.");
  });

  it("delningstexten kan skilja sig från sökresultatets", () => {
    const egen = pageMetadata({
      path: "/",
      title: "Rubrik",
      description: "Lång beskrivning för sökresultatet.",
      shareDescription: "Kort för ett kort.",
    });

    expect(egen.description).toBe("Lång beskrivning för sökresultatet.");
    expect(egen.openGraph?.description).toBe("Kort för ett kort.");
  });
});

describe("de rättsliga sidornas datum", () => {
  it("texten och datumet säger samma dag", () => {
    /*
      Två uppgifter om samma sak: `LEGAL_UPDATED` står i dokumenten och
      `LEGAL_UPDATED_AT` i sitemap. Månadens namn går inte att jämföra utan
      språkdata, som den här servern inte garanterat har — dag och år räcker
      för att fånga den som ändrar den ena och glömmer den andra.
    */
    expect(LEGAL_UPDATED).toContain(String(LEGAL_UPDATED_AT.getUTCDate()));
    expect(LEGAL_UPDATED).toContain(String(LEGAL_UPDATED_AT.getUTCFullYear()));
  });
});
