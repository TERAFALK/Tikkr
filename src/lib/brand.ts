/**
 * TIKKRS FÄRGER OCH FORM, SOM KOD.
 *
 * Hämtat ur Tikkr brand guidelines v1.0 (oktober 2026). Originalet ligger i
 * `brand/Tikkr-brand-guidelines.pdf` och hela materialet under `brand/`.
 *
 * FILEN HAR INGA IMPORTER OCH SKA INTE FÅ NÅGRA. Både fakturasidan
 * (`pdf.ts`, `calc-pdf.ts`, `report-pdf.ts`) och lönesidan (`timesheet-pdf.ts`)
 * läser den, precis som `modules.ts`. Drog den in något från endera hållet
 * skulle `tests/payroll-boundary.test.ts` falla — och den gränsen är inte
 * förhandlingsbar, se CLAUDE.md överst.
 *
 * Gränssnittets färger kommer INTE härifrån utan ur Tailwind-tokens i
 * `src/app/globals.css`, som är byggda ur samma sex färger. Skälet är att
 * Tailwind måste kunna läsa klassnamnen som text i filerna; ett värde som
 * räknas fram i JavaScript finns inte när stilmallen byggs. Ändras en färg
 * ändras den alltså på TVÅ ställen, och det är avsiktligt — alternativet vore
 * att generera CSS vid bygget, vilket är en byggkedja till att underhålla för
 * sex hexkoder som ändras en gång per varumärkesgenomgång.
 *
 * DOKUMENTEN (PDF) läser härifrån. De ritas av pdfkit, som inte vet vad
 * Tailwind är.
 */

/* -------------------------------------------------------------------------- */
/* De sex färgerna                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Grundpaletten, med varumärkets egna namn.
 *
 * Fjord och Snö bär de flesta ytorna. Grönt är accent och aldrig huvudfärg —
 * det är den enda regeln i hela guiden som står utskriven som ett förbud.
 */
export const BRAND = {
  /** Primär. Text, logotyp, mörka ytor. */
  fjord: "#0E1A2B",
  /** Accent på mörkt. Markeringar, knappar på mörk yta. */
  tick: "#2ED196",
  /** Accent på ljusa bakgrunder. */
  tickDeep: "#0F9E68",
  /** Ljus bakgrund. */
  sno: "#F5F6F2",
  /** Sekundär text. */
  skiffer: "#5B6573",
  /** Linjer, ramar, tysta ytor. */
  lav: "#D9DDD6",
} as const;

/* -------------------------------------------------------------------------- */
/* Dokumentens palett                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Färgerna som används när ett underlag ritas som PDF.
 *
 * Namnen säger vad färgen GÖR och inte vilken den är. En rubrikrad ska vara
 * "band", inte "#0E1A2B" — då går det att se på anropsstället om raden är rätt
 * sorts rad, och en färgändring träffar alla rubrikrader på en gång.
 *
 * Varningsgult har ingen motsvarighet i varumärket. Guiden ger sex färger och
 * ingen av dem betyder "det här saknar underlag", vilket är precis vad gult
 * säger i en efterkalkyl. Att tolka Fjord eller grönt som en varning hade varit
 * att göra pappret svårare att läsa för att en palett skulle stämma.
 *
 * VARJE FÄLT ÄR `string`, och typen står utskriven nedan i stället för att
 * härledas. Utan den blir fälten sin egen hexkod som typ — dels för att
 * `BRAND` är `as const`, dels för att en bokstavlig sträng smalnar av på vägen
 * — och då smittar det vidare: en ritfunktion med `color = DOC.body` som
 * standardvärde får parametertypen `"#35404F"` och vägrar ta emot `DOC.warn`
 * när en rad saknar underlag. Det fällde bygget en gång.
 *
 * Färgerna här ÄR utbytbara med varandra. Det är hela poängen med att de har
 * roller i stället för hexkoder, och typen ska säga samma sak.
 */
export interface DocPalette {
  /** Rubrikband och summarader: Fjord med vit text. */
  readonly band: string;
  /** Texten på ett band. */
  readonly onBand: string;
  /** Rubriker och belopp. */
  readonly heading: string;
  /** Löptext och tabellceller. */
  readonly body: string;
  /** Ledtexter, kolumnrubriker, fotnoter. */
  readonly muted: string;
  /** Sidfoten, det finstilta. */
  readonly faint: string;
  /** Tysta ytor: delsummor, infoblock. */
  readonly tint: string;
  /** Linjer mellan rader. */
  readonly rule: string;
  /** Hårfina linjer inuti en tabell. */
  readonly hairline: string;
  /** Accent: staplar i ett diagram, markerad tid. */
  readonly accent: string;
  /** Kräver uppmärksamhet: saknad timkostnad, överskriden beräkning. */
  readonly warn: string;
}

export const DOC: DocPalette = {
  band: BRAND.fjord,
  onBand: "#FFFFFF",
  heading: BRAND.fjord,
  body: "#35404F",
  muted: BRAND.skiffer,
  faint: "#858D94",
  tint: BRAND.sno,
  rule: BRAND.lav,
  hairline: "#ECEEE7",
  accent: BRAND.tickDeep,
  warn: "#A16207",
};

/* -------------------------------------------------------------------------- */
/* Symbolen                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * SYMBOLEN SOM TVÅ BANOR.
 *
 * En cirkel delad i två. Vänstra halvan är ögonblicket man stämplar in, den
 * högra ögonblicket man stämplar ut, satt en aning senare. Tillsammans blir de
 * en hel arbetsdag.
 *
 * Geometrin står i guiden: två halvcirklar med radie 26, åtta enheter isär, och
 * den högra åtta enheter lägre. Banorna nedan är samma siffror flyttade till en
 * egen ruta om 60×60, så att de går att rita utan omräkning.
 *
 * Varför banor och inte en bildfil: märket ska byta färg efter vad det sitter
 * på — Fjord och grönt på ljust, Snö och grönt på mörkt — och en SVG-fil per
 * kombination är fyra filer som glider isär.
 */
export const SYMBOL = {
  /** Rutan banorna är ritade i. */
  viewBox: "0 0 60 60",
  /** Vänstra halvan. Instämplingen. */
  left: "M26 0A26 26 0 0 0 26 52Z",
  /** Högra halvan. Utstämplingen, åtta enheter senare. */
  right: "M34 8A26 26 0 0 1 34 60Z",
} as const;

/**
 * ORDMÄRKET SOM KONTURER.
 *
 * "tikkr", gement, i Geist Semibold med −5 % knipning — omvandlat till
 * konturer precis som i varumärkesmaterialet.
 *
 * Guiden säger uttryckligen att ordmärket inte får sättas om i ett annat
 * typsnitt. Skrev vi det som vanlig text skulle det bli just det så fort Geist
 * inte hunnit laddas, vilket är varje första sidvisning och varje kioskskärm
 * utan nät. Konturerna ser likadana ut överallt och kräver inget typsnitt alls.
 *
 * Banan är hämtad ur `brand/01-logo/svg/tikkr-wordmark-navy.svg` utan
 * ändringar. Rör den inte för hand.
 */
export const WORDMARK = {
  /** Rutan banan är ritad i, inklusive den transform som hör till. */
  viewBox: "0 0 272.045 100",
  /** Transformen ur originalfilen. Flyttar konturerna in i rutan ovan. */
  transform: "translate(-6.259 100.000) scale(0.139082)",
  /** Bredd delat med höjd, för att räkna ut en bredd ur en given höjd. */
  ratio: 272.045 / 100,
  path:
    "M284 0Q204 0 166.5 -36.5Q129 -73 129 -153V-435H45V-534H129V-659H257V-534" +
    "H398V-435H257V-165Q257 -127 273.5 -113.0Q290 -99 323 -99H398V0ZM434.0 0V" +
    "-534H562.0V0ZM432.0 -605V-719H565.0V-605ZM637.0 0V-710H765.0V-293L984.0 " +
    "-534H1142.0L933.0 -312L1149.0 0H1005.0L849.0 -236L765.0 -147V0ZM1165.0 0" +
    "V-710H1293.0V-293L1512.0 -534H1670.0L1461.0 -312L1677.0 0H1533.0L1377.0 " +
    "-236L1293.0 -147V0ZM1701.0 0V-534H1821.0L1824.0 -430Q1840.0 -484 1871.0 " +
    "-509.0Q1902.0 -534 1952.0 -534H2001.0V-424H1951.0Q1890.0 -424 1859.5 " +
    "-396.5Q1829.0 -369 1829.0 -308V0Z",
} as const;
