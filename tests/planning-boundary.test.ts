import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * GRÄNSERNA RUNT PLANERINGEN.
 *
 * Tikkr lämnar nu tre sorters uppgifter om samma timme, till tre mottagare:
 *
 *   FAKTURAUNDERLAG   vad kundens kund ska betala
 *   TIDRAPPORT        hur mycket personen arbetat
 *   PLANEN            vad som var TÄNKT att hända
 *
 * Den tredje är den som lätt läcker, eftersom den ser ut som de andra två: ett
 * arbetsmoment, en order, ett antal minuter. Skillnaden är att ingenting i den
 * har hänt.
 *
 * TRE REGLER, och var och en skulle kosta pengar att bryta:
 *
 *  1. FAKTURASIDAN LÄSER INTE PLANEN. Gjorde den det vore det en tidsfråga
 *     innan någon fakturerade en order på vad den var tänkt att ta.
 *
 *  2. PLANERINGEN SKRIVER INTE STÄMPLINGAR. En stämplad timme är underlag för
 *     både faktura och lön. Planeringen får läsa den och ingenting annat.
 *
 *  3. PLANERINGEN OCH LÖNEUNDERLAGET DELAR INGEN KOD. De säljs var för sig, och
 *     en kund kan ha den ena utan den andra. Importerade planeringen en lönefil
 *     skulle module-coverage.test.ts härleda varje planeringssida som en
 *     lönesida och kräva en PAYROLL-vakt på den — vilket vore ett riktigt fel,
 *     inte en teknikalitet.
 *
 * Samma sorts skyddsnät som payroll-boundary.test.ts, och av samma skäl. Läser
 * källtext, behöver ingen databas.
 */

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

/** Planeringens bibliotek. */
const PLANNING_MODULES = ["planning", "plan-calendar", "plan-live"];

/** Lönemodulens. Speglar payroll-boundary.test.ts. */
const PAYROLL_MODULES = [
  "payroll",
  "schedule",
  "absence",
  "breaks",
  "break-close",
  "timesheet-pdf",
];

/** Filerna som bygger underlag till kundens kund. */
const INVOICE_FILES = [
  "lib/order-export.ts",
  "lib/order-calc.ts",
  "lib/order-price.ts",
  "lib/pdf.ts",
  "lib/calc-pdf.ts",
  "lib/report.ts",
  "lib/report-pdf.ts",
  "app/api/admin/export/route.ts",
  "app/api/admin/export/orders/route.ts",
];

function read(file: string): string {
  return readFileSync(path.join(SRC, file), "utf8");
}

function exists(file: string): boolean {
  try {
    read(file);
    return true;
  } catch {
    return false;
  }
}

function importsOf(file: string): string[] {
  return [...read(file).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

/** true när specifikationen pekar på ett av de uppräknade biblioteken. */
function pointsAt(specifier: string, modules: string[]): boolean {
  return modules.some(
    (name) =>
      specifier === `./${name}` ||
      specifier === `@/lib/${name}` ||
      specifier.endsWith(`/lib/${name}`)
  );
}

function walk(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }

  return found;
}

function relative(file: string): string {
  return path.relative(SRC, file).split(path.sep).join("/");
}

/** Varje fil under src som rör planeringen, härlett ur importerna. */
function planningFiles(): { file: string; source: string }[] {
  const libs = PLANNING_MODULES.map((name) => `lib/${name}.ts`);

  const rest = walk(SRC)
    .map(relative)
    .filter((file) => !libs.includes(file))
    .filter((file) =>
      importsOf(file).some((specifier) =>
        pointsAt(specifier, PLANNING_MODULES)
      )
    );

  return [...libs, ...rest]
    .filter(exists)
    .map((file) => ({ file, source: read(file) }));
}

describe("fakturaunderlaget känner inte till planen", () => {
  for (const file of INVOICE_FILES.filter(exists)) {
    it(`${file} importerar ingen planeringsfil`, () => {
      const forbidden = importsOf(file).filter((specifier) =>
        pointsAt(specifier, PLANNING_MODULES)
      );

      expect(
        forbidden,
        `${file} bygger underlag till kundens kund och får inte läsa planen. ` +
          "Planerad tid är en avsikt, inte utfört arbete — se kommentaren " +
          "överst i den här filen."
      ).toEqual([]);
    });
  }

  it("listan över fakturafiler pekar på filer som finns", () => {
    // En rad som pekar på en borttagen fil är ett hål som står kvar och ser ut
    // som ett skydd.
    expect(INVOICE_FILES.filter((file) => !exists(file))).toEqual([]);
  });
});

describe("planeringen och löneunderlaget delar ingen kod", () => {
  for (const name of PLANNING_MODULES) {
    const file = `lib/${name}.ts`;

    it(`${file} importerar ingen lönemodul`, () => {
      expect(exists(file), `${file} finns inte i src/`).toBe(true);

      const forbidden = importsOf(file).filter((specifier) =>
        pointsAt(specifier, PAYROLL_MODULES)
      );

      expect(
        forbidden,
        `${file} hör till planeringen, som säljs skilt från löneunderlaget. ` +
          "Den gemensamma formulärdelen ligger i lib/weekly-hours.ts, som är " +
          "neutral — importera därifrån i stället."
      ).toEqual([]);
    });
  }

  it("lönemodulerna importerar ingen planeringsfil", () => {
    // Åt andra hållet också. En tidrapport som läste planen skulle göra
    // löneunderlaget beroende av ett tillval kunden kanske inte har.
    const offenders: string[] = [];

    for (const name of PAYROLL_MODULES) {
      const file = `lib/${name}.ts`;
      if (!exists(file)) continue;

      if (importsOf(file).some((s) => pointsAt(s, PLANNING_MODULES))) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("weekly-hours.ts är neutral och känner ingen av modulerna", () => {
    // Filen läses från båda hållen. Drog den in något från endera skulle den
    // sluta vara en gemensam grund och i stället bli en bro mellan två
    // moduler som inte får röra varandra. Samma hållning som modules.ts har.
    const file = "lib/weekly-hours.ts";
    expect(exists(file)).toBe(true);

    const forbidden = importsOf(file).filter(
      (specifier) =>
        pointsAt(specifier, PAYROLL_MODULES) ||
        pointsAt(specifier, PLANNING_MODULES)
    );

    expect(
      forbidden,
      "src/lib/weekly-hours.ts måste förbli neutral. Den läses av både " +
        "lönemodulen och planeringen."
    ).toEqual([]);
  });
});

describe("planeringen skriver aldrig en stämpling", () => {
  /** Skrivande Prisma-anrop mot time_entries. */
  const WRITES =
    /\btimeEntry\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;

  it("ingen fil som rör planeringen ändrar time_entries", () => {
    const offenders = planningFiles()
      .filter(({ source }) => WRITES.test(source))
      .map(({ file }) => file);

    expect(
      offenders,
      "Dessa filer rör planeringen OCH skriver till time_entries. En " +
        "stämplad timme är underlag för både faktura och lön, och planen får " +
        "läsa den men aldrig ändra den. Behöver en stämpling rättas sker det " +
        "i Stämplingar, genom clock.ts."
    ).toEqual([]);
  });

  it("planeringens bibliotek kallar inte clock.ts", () => {
    // Samma regel, andra vägen in. clock.ts är enda vägen till en stämpling,
    // och därför det enda som behöver vaktas utöver Prisma-anropen.
    //
    // Gäller biblioteken och inte varje sida: tavlan ligger i adminpanelen,
    // där en sida mycket väl kan göra både en planering och något annat. Det
    // är biblioteken som inte får kunna stämpla.
    const offenders = PLANNING_MODULES.map((name) => `lib/${name}.ts`)
      .filter(exists)
      .filter((file) =>
        importsOf(file).some((specifier) => pointsAt(specifier, ["clock"]))
      );

    expect(
      offenders,
      "Dessa planeringsbibliotek importerar clock.ts. Planen läser " +
        "stämplingen, aldrig tvärtom."
    ).toEqual([]);
  });

  it("hittar filer att granska alls", () => {
    // Flyttas biblioteken ska testet säga det, inte tystna och se grönt ut
    // för att listan blev tom.
    expect(planningFiles().length).toBeGreaterThanOrEqual(
      PLANNING_MODULES.length
    );
  });
});
