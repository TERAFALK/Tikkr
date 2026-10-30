/**
 * PLANERINGSLÄGENA (tillagt 2026-10-14, issue #21).
 *
 * Planeringen byggdes för verkstäder: ordrar läggs på stationer, och en
 * station är en maskin som kör ett arbetsmoment. En elfirma har inga
 * stationer. Den planerar människor på jobb, och tavlan hade inget att visa
 * för den.
 *
 * Läget väljs per företag under Inställningar, Planering, och är EN modul och
 * inte två. Det kunden betalar för är samma sak — att lägga ordrarnas
 * beräknade tid ut i veckan — och skillnaden är vilken resurs tiden läggs på.
 *
 * ── TVÅ FRÅGOR SOM LÄGET SVARAR PÅ ───────────────────────────────────────
 *
 *  1. VILKA VYER TAVLAN HAR. Den första i listan är den man kommer till.
 *
 *  2. VEM SOM RÄKNAR AV BERÄKNINGEN. Summan av en orders planerade tid plus
 *     dess oplacerade tid är alltid den beräknade tiden (CLAUDE.md § 3 regel
 *     8). Räknade både stationen och personen av samma timme vore den
 *     planerad två gånger, och Oplacerat skulle visa för lite. Därför gör
 *     exakt EN resurs det.
 *
 *     I en verkstad är det stationen. Maskinens körtid och operatörens
 *     arbetstid skiljer sig: en CNC-maskin kör sex timmar obemannad på en
 *     timmes ställtid. Personalen är då bemanning på stationens rutor, och
 *     dess pass räknas inte mot beräkningen.
 *
 * ── PRODUKTION HAR INGEN PERSONALFLIK (ändrat 2026-10-17) ────────────────
 *
 * Produktion hade både Stationer och Personal. I Personal-vyn gick det inte
 * att planera något, bara att se och flytta den bemanning som lagts med
 * Bemanna i en stationsruta, och fliken togs bort på produktägarens beslut.
 * Bemanningen finns kvar i stationsrutans dialog (`staffsStations`).
 *
 * ── EN NY VERKSAMHETSTYP ─────────────────────────────────────────────────
 *
 * Ett värde i enumen `PlanningMode` i schemat och en rad här. Vyerna och
 * resursen väljs bland dem som redan finns.
 *
 * FILEN HAR INGA IMPORTER, OCH SKA INTE FÅ NÅGRA, av samma skäl som
 * modules.ts: den läses av inställningarna, tavlan och ändringsloggen, och
 * ska gå att läsa i webbläsaren lika gärna som på servern.
 */

/** En vy på tavlan, och därmed en sorts resurs att planera på. */
export type PlanningView = "stations" | "staff";

export interface PlanningViewDefinition {
  /** Fliken på tavlan. Substantiv, se CLAUDE.md § 7.1. */
  label: string;
  /** Värdet i adressfältet, `?vy=personal`. Svenska, som resten av adresserna. */
  slug: string;
}

export const PLANNING_VIEWS: Record<PlanningView, PlanningViewDefinition> = {
  stations: { label: "Stationer", slug: "stationer" },
  staff: { label: "Personal", slug: "personal" },
};

export interface PlanningModeDefinition {
  key: string;
  /** Namnet kunden ser i valet. */
  name: string;
  /** En rad under namnet. Vad läget planerar, inte varför. */
  summary: string;
  /** Tavlans vyer. Den första är den man kommer till. */
  views: readonly PlanningView[];
  /** Resursen vars pass räknar av orderns beräknade tid. Se toppkommentaren. */
  countsBudget: PlanningView;
  /** Om stationsrutans dialog har Bemanna, där en anställd läggs på körningen. */
  staffsStations: boolean;
}

export const PLANNING_MODES = {
  PRODUCTION: {
    key: "PRODUCTION",
    name: "Produktion",
    summary: "Ordrar på stationer",
    views: ["stations"],
    countsBudget: "stations",
    staffsStations: true,
  },

  SERVICE: {
    key: "SERVICE",
    name: "Tjänst",
    summary: "Personal på jobb, utan stationer",
    views: ["staff"],
    countsBudget: "staff",
    staffsStations: false,
  },
} as const satisfies Record<string, PlanningModeDefinition>;

export type PlanningModeKey = keyof typeof PLANNING_MODES;

export const PLANNING_MODE_KEYS = Object.keys(
  PLANNING_MODES
) as PlanningModeKey[];

/**
 * Läget ett företag har innan någon valt. Samma som databasens förval, så att
 * varje befintlig kund har kvar det planeringen alltid varit.
 */
export const DEFAULT_PLANNING_MODE: PlanningModeKey = "PRODUCTION";

/**
 * true när strängen är ett läge vi känner igen. För data utifrån.
 *
 * Egna nycklar och inte `in`: "toString" finns på varje objekt, och ett
 * formulär som skickade det hade annars godtagits som ett läge.
 */
export function isPlanningMode(value: unknown): value is PlanningModeKey {
  return typeof value === "string" && Object.hasOwn(PLANNING_MODES, value);
}

export function planningModeName(key: PlanningModeKey): string {
  return PLANNING_MODES[key].name;
}

/** Tavlans vyer i läget, i den ordning flikarna står. */
export function viewsFor(mode: PlanningModeKey): readonly PlanningView[] {
  return PLANNING_MODES[mode].views;
}

/**
 * Vyn tavlan ska visa, ur värdet i adressfältet.
 *
 * Ett värde läget inte har ger lägets första vy och inte ett fel. Ett bokmärke
 * till Stationer hos ett företag som bytt till Tjänst ska leda till tavlan,
 * inte till en sida som säger att adressen är fel. Samma hållning som veckan i
 * adressfältet har.
 */
export function pickView(
  mode: PlanningModeKey,
  slug: string | null | undefined
): PlanningView {
  const views = viewsFor(mode);

  return views.find((view) => PLANNING_VIEWS[view].slug === slug) ?? views[0];
}
