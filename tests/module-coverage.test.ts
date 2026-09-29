import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * SKYDDSNÄT FÖR MODULGRINDEN.
 *
 * Löneunderlaget är ett tillval kunden betalar extra för. Varje sida, åtgärd
 * och rutt som hör dit ska därför fråga om företaget har modulen — annars kan
 * någon som inte betalar nå den genom att skriva in adressen.
 *
 * ATT DÖLJA MENYPUNKTEN RÄCKER INTE, och det är hela skälet att testet finns.
 * Prenumerationslåset lärde oss det en gång redan: det ligger som en gren i
 * panelens layout, och exportrutterna under /api renderas aldrig genom den
 * layouten. En modul som bara gömdes i menyn hade haft samma hål.
 *
 * Regeln:
 *
 *   VARJE fil under src/app eller src/components som rör löneunderlaget —
 *   genom att importera dess bibliotek eller genom att röra dess tabeller —
 *   ska ha en modulvakt.
 *
 * Det viktiga är att listan inte är handskriven. Sista kontrollen HÄRLEDER
 * vilka filer som rör modulen och jämför mot listan. En ny lönesida som någon
 * lägger till om ett halvår fälls alltså av testet även om ingen kommer ihåg
 * att den här filen finns.
 *
 * Samma teknik som support-coverage.test.ts och payroll-boundary.test.ts:
 * läser källtext, behöver ingen databas.
 */

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

/** Biblioteken som räknar löneunderlag. Speglar payroll-boundary.test.ts. */
const PAYROLL_MODULES = [
  "payroll",
  "schedule",
  "absence",
  "breaks",
  "timesheet-pdf",
];

/**
 * Tabellerna som bara finns för löneunderlaget.
 *
 * Läses som `db.breakType`, `session.db.absence` och så vidare. Punkten före
 * namnet är med i mönstret, annars träffar "absence" också ordet i en
 * kommentar.
 */
const PAYROLL_MODELS = [
  "breakType",
  "breakEntry",
  "absence",
  "compAdjustment",
  "workSchedule",
  "scheduleDay",
  "scheduleBreak",
];

/**
 * Filerna som rör lönemodulen och därför ska ha en vakt.
 *
 * Listan är en FÖRVÄNTAN, inte en sanning. Den sista kontrollen räknar fram
 * den riktiga uppsättningen ur koden och jämför.
 */
const PAYROLL_SURFACE = [
  "app/admin/(panel)/tidrapport/page.tsx",
  "app/admin/(panel)/tidrapport/actions.ts",
  "app/admin/(panel)/installningar/schema/page.tsx",
  "app/admin/(panel)/installningar/schema/actions.ts",
  "app/api/admin/export/timesheet/route.ts",
  "app/api/kiosk/punch/route.ts",
  "app/api/kiosk/state/route.ts",
  "app/kiosk/page.tsx",
];

/**
 * Filer där BARA EN DEL rör lönemodulen.
 *
 * De har en vakt, men inte överst: resten av filen hör till basen och måste
 * fungera för varje kund.
 *
 * anstallda/page.tsx och anstallda/actions.ts: listan över anställda, deras
 * namn, nummer, bild och timkostnad är basen. Arbetstiderna i ändra-rutan är
 * lönemodulen, och bara de raderna ligger bakom `hasModule`. Att svara 404 på
 * hela anställdlistan för den som inte köpt löneunderlaget vore fel sorts
 * spärr — den skulle ta bort något de betalar för.
 *
 * Kontrolleras hårdare än NO_GUARD_NEEDED nedan: filen MÅSTE innehålla en
 * vakt. Det enda som lättas är kravet att varje åtgärd i filen har en.
 */
const PARTIAL_GUARD = [
  "app/admin/(panel)/anstallda/page.tsx",
  "app/admin/(panel)/anstallda/actions.ts",
];

/**
 * Filer som rör lönetabellerna men INTE ska ha en vakt.
 *
 * Varje rad är ett hål i skyddet och måste ha ett skäl som håller.
 *
 * installningar/actions.ts: GDPR-anonymiseringen raderar frånvaro, raster och
 * komprader. Den måste fungera ÄVEN när modulen är avstängd — annars blir en
 * avstängd modul ett sätt att göra personuppgifter oåtkomliga för rätten att
 * bli glömd. Se CLAUDE.md § 4 punkt 8 och 9.
 *
 * api/cron/auto-close: stänger glömda raster för alla företag. Den ska
 * fortsätta göra det även för en kund som just stängt av modulen — annars
 * blir en rast som råkade vara öppen i det ögonblicket öppen för alltid.
 * Rutten skapar ingenting, den stänger bara det som redan finns.
 *
 * Komponenterna: ren presentation. De renderas bara av sidor som redan har en
 * vakt, och kan inte nås på egen hand.
 */
const NO_GUARD_NEEDED = [
  "app/admin/(panel)/installningar/actions.ts",
  "app/api/cron/auto-close/route.ts",
  "components/admin/ScheduleDays.tsx",
  "components/admin/AbsenceDialog.tsx",
  "components/admin/TimesheetTable.tsx",
];

/** Vakterna som räknas. Båda leder till 404 när modulen är av. */
const GUARD = /await (requireModule|hasModule)\(/;

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

/** true när filen läser eller skriver något som hör till lönemodulen. */
function touchesPayroll(source: string): boolean {
  const importsLib = PAYROLL_MODULES.some((name) =>
    new RegExp(
      `from\\s+["'](@/lib/${name}|\\./${name}|\\.\\./lib/${name})["']`
    ).test(source)
  );

  if (importsLib) return true;

  return PAYROLL_MODELS.some((model) =>
    new RegExp(`\\bdb\\.${model}\\b`).test(source)
  );
}

const surfaceSources = PAYROLL_SURFACE.filter(exists).map((file) => ({
  file,
  source: read(file),
}));

describe("lönemodulen är grindad", () => {
  it("varje fil i listan finns kvar", () => {
    // En lista som pekar på flyttade filer ser ut som ett skydd men är ett
    // hål. Samma kontroll som INVOICE_FILES i payroll-boundary.test.ts.
    const missing = PAYROLL_SURFACE.filter((file) => !exists(file));

    expect(
      missing,
      "Dessa filer står i PAYROLL_SURFACE men finns inte. Har de flyttats " +
        "står listan kvar och skyddar ingenting — rätta sökvägarna."
    ).toEqual([]);

    expect(PAYROLL_SURFACE.length).toBeGreaterThan(5);
  });

  it("varje fil i listan har en modulvakt", () => {
    const unguarded = surfaceSources
      .filter(({ source }) => !GUARD.test(source))
      .map(({ file }) => file);

    expect(
      unguarded,
      "Dessa filer rör lönemodulen utan att fråga om företaget har den. " +
        "Lägg till requireModule(session, PAYROLL) i sidor och åtgärder, " +
        "eller hasModule(companyId, PAYROLL) i API-rutter. ORDET await " +
        "KONTROLLERAS: vakten är async, och utan await kastas 404 inuti ett " +
        "löfte ingen väntar på — koden fortsätter och svarar med data."
    ).toEqual([]);
  });

  it("varje åtgärd i lönemodulen har en vakt i samma funktion", () => {
    // Lika många anrop som vakter kan i teorin stämma medan de sitter i fel
    // funktioner. Här kontrolleras varje funktion för sig, som i
    // support-coverage.test.ts.
    const unguarded: string[] = [];

    for (const { file, source } of surfaceSources) {
      if (!file.endsWith("actions.ts")) continue;

      for (const block of source.split(/^export async function /m).slice(1)) {
        const name = block.slice(0, block.indexOf("(")).trim();

        if (!/await requireAdmin\(\)/.test(block)) continue;
        if (/await requireModule\(session, "PAYROLL"\)/.test(block)) continue;

        unguarded.push(`${file}: ${name}`);
      }
    }

    expect(
      unguarded,
      "Dessa åtgärder kallar requireAdmin() utan requireModule() i samma " +
        "funktion. De skulle gå att köra för ett företag som inte har " +
        "lönemodulen."
    ).toEqual([]);
  });

  it("varje delvis grindad fil har en vakt", () => {
    for (const file of PARTIAL_GUARD) {
      expect(exists(file), `${file} finns inte i src/`).toBe(true);

      expect(
        GUARD.test(read(file)),
        `${file} står i PARTIAL_GUARD men har ingen vakt alls. Delen som rör ` +
          "lönemodulen ska ligga bakom hasModule()."
      ).toBe(true);
    }
  });

  it("ingen fil rör löneunderlaget utan att stå i listan", () => {
    // DEN VIKTIGASTE KONTROLLEN. De tre ovan litar på en handskriven lista;
    // den här räknar fram vilka filer som faktiskt rör modulen och fäller en
    // ny lönesida ingen kommit ihåg att lägga till.
    const known = new Set([
      ...PAYROLL_SURFACE,
      ...PARTIAL_GUARD,
      ...NO_GUARD_NEEDED,
    ]);

    const missed = [
      ...walk(path.join(SRC, "app")),
      ...walk(path.join(SRC, "components")),
    ]
      .map((full) => ({
        file: relative(full),
        source: readFileSync(full, "utf8"),
      }))
      .filter(({ source }) => touchesPayroll(source))
      .filter(({ file }) => !known.has(file))
      .map(({ file }) => file);

    expect(
      missed,
      "Dessa filer rör löneunderlaget men står i ingen av listorna. Lägg " +
        "till en modulvakt och skriv in filen i PAYROLL_SURFACE, i " +
        "PARTIAL_GUARD om bara en del av filen hör till modulen — eller, om " +
        "den bevisligen inte behöver någon vakt, i NO_GUARD_NEEDED med ett " +
        "skäl."
    ).toEqual([]);
  });

  it("undantagslistan är kort och pekar på filer som finns", () => {
    for (const file of NO_GUARD_NEEDED) {
      expect(exists(file), `${file} finns inte i src/`).toBe(true);
    }

    // Inte ett funktionskrav, utan en påminnelse: växer listan har någon
    // lagt till ett hål, och då ska det ha krävt att de läste kommentaren.
    expect(NO_GUARD_NEEDED.length).toBeLessThanOrEqual(8);
  });
});

describe("registret och schemat säger samma sak", () => {
  it("varje nyckel i MODULES finns som värde i CompanyModuleKey", async () => {
    const { MODULE_KEYS } = await import("@/lib/modules");

    const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");

    const start = schema.indexOf("enum CompanyModuleKey {");
    expect(start, "CompanyModuleKey saknas i schemat").toBeGreaterThan(-1);

    const body = schema.slice(start, schema.indexOf("\n}", start));

    for (const key of MODULE_KEYS) {
      expect(
        body,
        `${key} finns i src/lib/modules.ts men inte i enumen CompanyModuleKey.`
      ).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });

  it("registret drar inte in något annat", () => {
    // modules.ts läses av både fakturasidan och lönesidan. Drog den in något
    // från endera hållet skulle payroll-boundary.test.ts falla — med rätta.
    const source = readFileSync(path.join(SRC, "lib/modules.ts"), "utf8");
    const imports = [...source.matchAll(/^import\s/gm)];

    expect(
      imports.length,
      "src/lib/modules.ts har fått en import. Filen måste förbli beroendefri."
    ).toBe(0);
  });

  it("CompanyModule är tenant-filtrerad", async () => {
    // Raden bär company_id och hör till kunden. Utan registrering i
    // tenant.ts skulle kund A kunna läsa kund B:s modulläge.
    const { TENANT_SCOPED_MODELS } = await import("@/lib/tenant");

    expect(TENANT_SCOPED_MODELS).toContain("CompanyModule" as never);
  });
});
