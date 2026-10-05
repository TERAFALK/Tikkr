import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * SPRÅKET I GRÄNSSNITTET — DEN MEKANISKA DELEN.
 *
 * CLAUDE.md § 7.1 punkt 4: inga tankstreck som lägger till en eftertanke.
 * Regeln stod i filen och höll i tre dagar. Nästa bygge la in
 *
 *   "Tidrapport från Tikkr. Löneunderlag — skickas inte till kund."
 *
 * i foten på tidrapporten, och det var kunden som fick upptäcka det.
 *
 * Kodbasens princip är att en gräns som bara finns i huvudet på den som skrev
 * koden inte håller ett år — det är skälet till tenant-coverage,
 * support-coverage och payroll-boundary. Det här testet gör samma sak för den
 * del av språkregeln som går att mäta.
 *
 * VAD TESTET INTE GÖR. Det fångar inte "beskriv inte det som redan syns" och
 * inte "motivera inte systemets val". Det är omdöme, och omdöme går inte att
 * mäta med ett reguljärt uttryck. De reglerna står kvar som text att läsa.
 * Testet tar det som ÄR mekaniskt, och låter bli att låtsas om resten.
 *
 * Behöver ingen databas.
 */

const ROOT = path.resolve(__dirname, "..");

/** Mapparna vars texter användaren ser. */
const UI_DIRS = [
  "src/app/admin",
  "src/components/admin",
  "src/components/kiosk",
];

/** Dokumenten som lämnar huset. */
const DOCUMENT_FILES = [
  "src/lib/pdf.ts",
  "src/lib/calc-pdf.ts",
  "src/lib/report-pdf.ts",
  "src/lib/timesheet-pdf.ts",
];

/**
 * Tillåtna tankstreck, var och en med sitt skäl.
 *
 * LISTAN ÄR TOM, och det är ett bra tecken. Den innehöll länge bandet på
 * efterkalkylen, "INTERNT UNDERLAG — INNEHÅLLER SJÄLVKOSTNAD", där strecket
 * skilde två jämbördiga led åt. Bandet säger numera bara "INTERNT UNDERLAG":
 * resten sa vad den som håller i pappret ändå ser på nästa rad.
 *
 * Den som lägger till en rad här får skriva varför strecket inte är en
 * eftertanke. Är det svårt att formulera är det förmodligen en eftertanke.
 *
 * Platshållaren "—" i en tom tabellcell står INTE här, och behöver inte göra
 * det: den är inte en hint, description eller utskriven mening och plockas
 * därför aldrig upp av kontrollen nedan.
 */
const ALLOWED: string[] = [];

function filesIn(dir: string): string[] {
  const full = path.join(ROOT, dir);
  const found: string[] = [];

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const next = path.join(current, entry);
      if (statSync(next).isDirectory()) walk(next);
      else if (/\.(tsx|ts)$/.test(entry)) found.push(next);
    }
  };

  walk(full);
  return found;
}

/**
 * Texterna i en fil som användaren ser.
 *
 * Plockar `hint="…"` och `description="…"` samt — i PDF-filerna — strängarna
 * som ritas ut. KODKOMMENTARER LÄSES INTE: de är för utvecklaren och får
 * gärna vara utförliga, vilket § 7.1 säger uttryckligen.
 */
/**
 * Platshållaren för tomt värde i en tabellcell.
 *
 * Skrivs antingen som strängen "—" eller som ett ensamt streck mellan två
 * taggar. Den är inte en mening och har ingen eftertanke att lägga till — den
 * säger bara att rutan är tom.
 */
const PLACEHOLDER = /"—"|>—</g;

/**
 * Raderna i en fil som innehåller ett tankstreck i löpande text.
 *
 * Läser HELA filen och inte bara hint och description. Första versionen av det
 * här testet tittade bara på attributen, och missade därför
 *
 *   "För dig som kör två maskiner — det pågående fortsätter"
 *
 * som står som ren JSX-text i en knapp i kiosken. Ett skydd som bara täcker
 * halva ytan är värre än inget, eftersom man slutar titta själv.
 *
 * KODKOMMENTARER LÄSES INTE. De är för utvecklaren och får gärna vara
 * utförliga, vilket § 7.1 säger uttryckligen.
 */
function prosaDashesIn(file: string): string[] {
  const source = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    // Även HTML-kommentarer. Mejlen i emails.ts är skrivna som markup, och
    // förklaringarna där står i <!-- --> i stället för i /* */. De är lika
    // mycket kommentarer och renderas lika lite.
    .replace(/<!--[\s\S]*?-->/g, "");

  return source
    .split("\n")
    .map((line) => line.replace(PLACEHOLDER, "").trim())
    .filter((line) => line.includes("—") && !ALLOWED.some((a) => line.includes(a)));
}

function userTextsIn(file: string, includePlainStrings: boolean): string[] {
  const source = readFileSync(file, "utf8")
    // Bort med kommentarerna först, annars flaggas varje förklaring i koden.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const texts: string[] = [];

  for (const match of source.matchAll(/(?:hint|description|empty|label)="([^"]*)"/g)) {
    texts.push(match[1]);
  }

  if (includePlainStrings) {
    for (const match of source.matchAll(/"([^"\n]{4,})"/g)) {
      texts.push(match[1]);
    }
  }

  return texts;
}

function offendersIn(file: string, includePlainStrings: boolean): string[] {
  return userTextsIn(file, includePlainStrings).filter(
    (text) => text.includes("—") && !ALLOWED.includes(text.trim())
  );
}

describe("inga tankstreck i texten användaren ser", () => {
  const uiFiles = UI_DIRS.flatMap(filesIn);

  it("hittar filer att granska", () => {
    // Ett tomt urval hade gett ett grönt test som inte kontrollerar något.
    expect(uiFiles.length).toBeGreaterThan(20);
  });

  it("panelen och kiosken är fria från tankstreck", () => {
    const found: string[] = [];

    for (const file of uiFiles) {
      for (const line of prosaDashesIn(file)) {
        found.push(`${path.relative(ROOT, file)}: ${line}`);
      }
    }

    expect(
      found,
      "CLAUDE.md § 7.1 punkt 4: inget tankstreck som lägger till en " +
        "eftertanke. Skriv om till en egen mening, eller stryk eftertanken."
    ).toEqual([]);
  });

  for (const file of DOCUMENT_FILES) {
    it(`${path.basename(file)} är fri från tankstreck`, () => {
      const found = offendersIn(path.join(ROOT, file), true);

      expect(
        found,
        `${file} skriver ett dokument som lämnar huset. Samma regel gäller ` +
          "där, och hårdare: mottagaren är någon annans kund."
      ).toEqual([]);
    });
  }

  it("varje undantag används faktiskt", () => {
    // Ett undantag som ingen längre behöver är ett hål som står kvar och
    // väntar på nästa text med samma formulering.
    const all = [
      ...uiFiles.flatMap((file) => userTextsIn(file, false)),
      ...DOCUMENT_FILES.flatMap((file) =>
        userTextsIn(path.join(ROOT, file), true)
      ),
    ].map((text) => text.trim());

    for (const allowed of ALLOWED) {
      expect(all, `Undantaget "${allowed}" används inte längre`).toContain(
        allowed
      );
    }
  });
});

/**
 * TEXTERNA SOM INTE LIGGER I EN SIDA.
 *
 * Kontrollen ovan tittar på panelen, kiosken och de fyra PDF-filerna. Det är
 * inte hela ytan, och gapet kostade: Excel-arket skrev
 *
 *   "Pågår — ej avslutad"
 *
 * i anmärkningskolumnen, och arket är ett av de dokument som går vidare till
 * kundens faktura. Felet låg i en exportrutt, alltså utanför varje mapp listan
 * nämner, och stod kvar tills någon läste filen för hand.
 *
 * Här står resten av de filer som skriver text en människa läser utan att den
 * texten bor i en komponent: exportrutterna, granskningsnoterna som `clock.ts`
 * och `breaks.ts` skriver till databasen, felmeddelandena i
 * plattformspanelens åtgärder, och mejlen.
 *
 * SAMMA REGEL, SAMMA SKÄL. Ett tankstreck som lägger till en eftertanke är
 * lika fel i en Excel-cell som i en knapp, och värre i ett mejl — det går
 * inte att rätta efter att det skickats.
 */
const PROSE_FILES = [
  "src/app/api/admin/export/route.ts",
  "src/app/api/admin/export/orders/route.ts",
  "src/app/api/admin/export/timesheet/route.ts",
  "src/lib/clock.ts",
  "src/lib/breaks.ts",
  "src/lib/break-close.ts",
  "src/lib/notices.ts",
  "src/lib/platform-admin.ts",
  "src/lib/emails.ts",
  // Noten när skärmens klocka rättats, och ändringsloggens rubriker.
  "src/lib/punch-time.ts",
  "src/lib/audit-view.ts",
];

describe("texterna utanför sidorna", () => {
  for (const file of PROSE_FILES) {
    it(`${path.basename(file)} är fri från tankstreck`, () => {
      const found = prosaDashesIn(path.join(ROOT, file));

      expect(
        found,
        `${file} skriver text som en människa läser. Samma regel som i ` +
          "panelen: skriv om till en egen mening, eller stryk eftertanken."
      ).toEqual([]);
    });
  }
});
