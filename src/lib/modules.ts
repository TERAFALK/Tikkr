/**
 * REGISTRET ÖVER TILLVAL.
 *
 * Basen i Tikkr är stämpling mot order: kioskskärmen, rapporterna och
 * fakturaunderlaget. Den är alltid på och står inte här. Registret innehåller
 * bara det kunden köper till.
 *
 * Skälet att modulisera alls: löneunderlaget är ungefär en tredjedel av
 * systemet och ingick från början gratis, byggt för att en pilotkund behövde
 * det. Kunden som bara vill fakturera rätt fick då en panel full av
 * menypunkter hen aldrig öppnar. Läggs planeringsdelen också i basen blir
 * Tikkr ett affärssystem till priset av en stämpelklocka, och prislappen går
 * inte längre att förklara.
 *
 * FILEN HAR INGA IMPORTER, OCH SKA INTE FÅ NÅGRA. Två skäl:
 *
 *  1. Både fakturasidan och lönesidan läser den. Drog den in något från
 *     endera hållet skulle `tests/payroll-boundary.test.ts` falla — med rätta,
 *     eftersom de två underlagen aldrig får dela kod.
 *  2. Den ska gå att läsa i webbläsaren lika gärna som på servern.
 *
 * Att lägga till en modul: en nyckel här, ett värde i enumen
 * `CompanyModuleKey` i schemat, och en artikel hos Stripe. Ingenting annat i
 * arkitekturen behöver röras.
 */

export interface ModuleDefinition {
  key: string;
  /** Namnet kunden ser. Substantiv, se CLAUDE.md § 7.1. */
  name: string;
  /** En rad på prenumerationssidan. Vad modulen innehåller, inte varför. */
  summary: string;

  /**
   * Reservpriser i kronor per månad respektive år, exklusive moms.
   *
   * De styr ingenting så länge Stripe svarar — priset sätts på artikeln där
   * och läses därifrån, precis som skärmpriset. Reservvärdena används i
   * labbet och hos kunder som betalar mot faktura, och ska hållas i takt med
   * artikeln.
   *
   * VILKEN artikel det är står inte här utan i price-book.ts, som slår upp
   * den i databasen med miljön som reserv. Nyckeln nedan är allt som behövs:
   * variabelnamnen bildas ur den.
   */
  fallbackMonthly: number;
  fallbackYearly: number;
}

export const MODULES = {
  PAYROLL: {
    key: "PAYROLL",
    name: "Löneunderlag",
    summary: "Schema, raster, flex, komp och frånvaro.",

    // Fast pris per företag, inte per skärm och inte per anställd.
    //
    // Per anställd valdes bort av samma skäl som basen gjorde det 2026-08-11:
    // kostar varje anställd pengar får kunden ett skäl att inte lägga upp
    // alla, och just den tiden blir oregistrerad. Per skärm valdes bort för
    // att löneunderlaget inte har med skärmar att göra — en fråga kunden
    // ställer första gången de ser fakturan.
    fallbackMonthly: 499,
    fallbackYearly: 4990,
  },

  PLANNING: {
    key: "PLANNING",
    name: "Planering",
    summary: "Stationer, veckovis tidslinje och planerade jobb mot stämpling.",

    // Dyrare än löneunderlaget, och fast per företag av samma skäl.
    //
    // Planeringen är en egen arbetsyta: ett stationsregister, en tidslinje att
    // arbeta i varje morgon, och det levande utfallet mot planen. Löneunderlaget
    // är en beräkning och ett par sidor; det här är ett verktyg man står i.
    //
    // Per skärm valdes bort av samma skäl som löneunderlaget valde bort det:
    // planeringen har ingenting med antalet skärmar att göra, och det är första
    // frågan kunden ställer när de ser fakturan.
    fallbackMonthly: 699,
    fallbackYearly: 6990,
  },
} as const satisfies Record<string, ModuleDefinition>;

export type ModuleKey = keyof typeof MODULES;

export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

/** true när strängen är en nyckel vi känner igen. För data utifrån. */
export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && value in MODULES;
}

export function moduleName(key: ModuleKey): string {
  return MODULES[key].name;
}
