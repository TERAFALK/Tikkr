import { BRAND, SYMBOL, WORDMARK } from "@/lib/brand";

/**
 * LOGOTYPEN SOM REACT-KOMPONENT I STÄLLET FÖR EN BILDFIL.
 *
 * Skälet: den ska kunna byta storlek och färg efter var den sitter — app-ikonen
 * i sidomenyn, det vågräta märket på säljsidan, omvänt på mörk yta — utan att
 * vi underhåller sex filer som glider isär. Banorna kommer ur
 * `src/lib/brand.ts` och är varumärkesmaterialets egna, oförändrade.
 *
 * Symbolen är en cirkel delad i två halvor. Vänstra halvan är ögonblicket man
 * stämplar in, den högra ögonblicket man stämplar ut, satt en aning senare.
 * Tillsammans blir de en hel arbetsdag — märket säger alltså vad produkten gör.
 *
 * Ordmärket är KONTURER och inte text. Guiden säger att det inte får sättas om
 * i ett annat typsnitt, och vanlig text blir just det så fort Geist inte hunnit
 * laddas — vilket är varje första sidvisning och varje kioskskärm utan nät.
 */

/* -------------------------------------------------------------------------- */
/* Färgsättningarna                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Vilken yta märket sitter på, inte vilken färg det ska ha.
 *
 * `color` är ljus bakgrund: Fjord och Tick Deep. `reversed` är mörk bakgrund:
 * Snö och Tick. Namnen är guidens egna, så att den som jämför med pappret
 * hittar rätt rad.
 */
type LogoTone = "color" | "reversed";

/*
  Hexkoderna och inte Tailwinds CSS-variabler.

  En `fill="var(--color-sno)"` som inte löses ut blir svart, inte ofärgad — och
  svart på Fjord är en osynlig logotyp. Att den sortens fel skulle bero på om en
  stilmall råkar innehålla en variabel är en risk märket inte behöver ta, och
  värdena kommer ändå från samma ställe som gränssnittets.
*/
const HALVES: Record<LogoTone, { left: string; right: string }> = {
  color: { left: BRAND.fjord, right: BRAND.tickDeep },
  reversed: { left: BRAND.sno, right: BRAND.tick },
};

/**
 * Ordmärket kan också ta färg av texten runt omkring, genom `tone="current"`.
 *
 * Finns för de nedtonade platserna: sidomenyns fot, kioskens hörn,
 * plattformspanelens topp. Där är märket medvetet dämpat — panelen tillhör
 * kunden, och vår logotyp står i marginalen. Utan det här hade varje sådan
 * plats behövt en egen färg skriven för hand, och de hade glidit isär.
 */
type WordTone = LogoTone | "current";

const WORD_FILL: Record<WordTone, string> = {
  color: BRAND.fjord,
  reversed: BRAND.sno,
  current: "currentColor",
};

/* -------------------------------------------------------------------------- */
/* Symbolen                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Bara symbolen, utan ruta omkring.
 *
 * Används där varumärket redan är tydligt: bredvid ordmärket, som avatar, i en
 * sidfot. Minsta storlek enligt guiden är 16 px, och under 32 px är favikonen
 * (`/favicon.svg`) ritad för att hålla ihop bättre än den här.
 *
 * Heter LogoSymbol och inte Symbol: det senare är JavaScripts egen inbyggda
 * Symbol, och en komponent som skuggar den är en felsökning ingen ska behöva
 * göra.
 */
export function LogoSymbol({
  size = 24,
  tone = "color",
}: {
  size?: number;
  tone?: LogoTone;
}) {
  const half = HALVES[tone];

  return (
    <svg
      viewBox={SYMBOL.viewBox}
      width={size}
      height={size}
      aria-hidden="true"
      className="block shrink-0"
    >
      <path d={SYMBOL.left} fill={half.left} />
      <path d={SYMBOL.right} fill={half.right} />
    </svg>
  );
}

/**
 * APP-IKONEN: symbolen i en rundad Fjord-ruta.
 *
 * Det här är märket i sidomenyn, på inloggningssidan och på kioskens
 * kopplingssida. Formen är densamma som favikonen och app-ikonen, vilket är
 * hela poängen — den som ser fliken i webbläsaren och den som ser menyn ska se
 * samma sak.
 *
 * MÅTTEN ÄR APP-IKONFILENS, inte påhittade. Ur `tikkr-app-icon-dark.svg`:
 * rundningen är 245.76 av 1024, alltså 24 % av sidan, och symbolen spänner
 * 204.8–819.2, alltså 60 % av bredden med 20 % fritt på varje sida. Det är mer
 * än det fria utrymme guiden kräver, och det är skälet att måtten härleds i
 * stället för att väljas: fliken i webbläsaren och märket i menyn ska se
 * likadana ut, annars läses de som två logotyper.
 */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        backgroundColor: BRAND.fjord,
      }}
      aria-hidden="true"
    >
      <LogoSymbol size={Math.round(size * 0.6)} tone="reversed" />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Ordmärket                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * "tikkr" som konturer. Alltid gement, aldrig satt som text.
 *
 * `height` och inte `size`: ordmärket är brett och lågt, och det är höjden man
 * vill styra när det ska stå i linje med något annat. Bredden räknas ut ur
 * förhållandet i varumärkesfilen.
 */
export function WordmarkOnly({
  height = 22,
  tone = "color",
}: {
  height?: number;
  tone?: WordTone;
}) {
  return (
    <svg
      viewBox={WORDMARK.viewBox}
      height={height}
      width={Math.round(height * WORDMARK.ratio)}
      role="img"
      aria-label="tikkr"
      className="block shrink-0"
    >
      <g transform={WORDMARK.transform}>
        <path d={WORDMARK.path} fill={WORD_FILL[tone]} />
      </g>
    </svg>
  );
}

/**
 * DET VÅGRÄTA MÄRKET: symbol till vänster om ordmärket.
 *
 * Guidens standardval för webbplatser, sidhuvuden och dokument, och därmed det
 * som står i säljsidans topp och fot.
 *
 * `size` är symbolens storlek och styr resten. Måtten är räknade ur
 * `tikkr-logo-horizontal-color.svg`, som är 441.55 × 120:
 *
 *   symbolen     120 enheter          →  size
 *   ordmärket    103.2 enheter        →  0.86 × size
 *   mellanrummet 40.8 enheter         →  0.34 × size
 *
 * Mellanrummet är alltså bredare än halva symbolhalvan, vilket är det fria
 * utrymme guiden kräver. Att räkna fram proportionerna i stället för att välja
 * dem gör att märket här och SVG-filen i `public/brand/` är samma logotyp —
 * en handplockad siffra hade gett en logotyp som nästan stämmer, vilket är
 * svårare att upptäcka än en som är uppenbart fel.
 */
export function Wordmark({
  size = 28,
  tone = "color",
}: {
  size?: number;
  tone?: LogoTone;
}) {
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: Math.round(size * 0.34) }}
    >
      <LogoSymbol size={size} tone={tone} />
      <WordmarkOnly height={Math.round(size * 0.86)} tone={tone} />
    </span>
  );
}
