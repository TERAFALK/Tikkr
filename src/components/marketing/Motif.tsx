import { SYMBOL } from "@/lib/brand";

/**
 * SYMBOLEN UPPFÖRSTORAD, SOM BAKGRUNDSGEOMETRI.
 *
 * Greppet kommer från varumärkesmaterialets banners: de två halvcirklarna
 * blåsta till flera hundra pixlar, blödande utanför kanten, i en ton knappt
 * skild från ytan de ligger på. Se `brand/03-social/`.
 *
 * Det är avsiktligt samma form i varje avsnitt och inte en ny dekoration per
 * sektion. En sida med sju olika utsmyckningar ser hopplockad ut; en sida som
 * upprepar ett motiv ser ut att komma någonstans ifrån.
 *
 * TONEN ÄR ALLTID SVAG. Halvorna skiljer sig dessutom en aning från varandra,
 * precis som i bannerna — annars läses de som en enda cirkel med ett hack i,
 * och hela poängen med märket är att det är två.
 *
 * SKILLNADEN MELLAN HALVORNA ÄR HALVERAD (2026-10-11). Den var fem punkter
 * mot tio, alltså dubbla tonen, och den skarven står lodrätt mitt i cirkeln.
 * Där motivet går ut genom en kant — och det gör det alltid — såg man därför
 * inte en cirkel utan två rektanglar i olika grå, med raka kanter mot
 * varandra och mot ytan. Det läses som ett fel i renderingen och inte som ett
 * motiv. Nu ligger halvorna så nära varandra att skarven bara anas, vilket är
 * precis vad bannerna gör.
 *
 * `aria-hidden`: det här är en yta, inte en bild med innehåll. Den som lyssnar
 * på sidan ska inte få höra att det finns en logotyp i bakgrunden sju gånger.
 */

/** Vilken yta motivet ligger på. Bestämmer om det ljusnar eller mörknar. */
export type MotifTone = "onDark" | "onLight" | "onTick";

const FILLS: Record<MotifTone, [string, string]> = {
  // Snö över Fjord. Samma lyft som i den mörka LinkedIn-bannern.
  onDark: ["fill-neutral-50/4", "fill-neutral-50/6"],
  // Fjord över Snö, svagare: ett mörkt motiv syns mer än ett ljust.
  onLight: ["fill-neutral-900/4", "fill-neutral-900/6"],
  // Snö över Tick. Tål mer, eftersom grönt är ljusare än både Fjord och Snö.
  onTick: ["fill-neutral-50/10", "fill-neutral-50/14"],
};

export default function Motif({
  tone,
  className,
}: {
  tone: MotifTone;
  /** Placering och storlek. Alltid absolut, alltid utanför minst en kant. */
  className: string;
}) {
  const [left, right] = FILLS[tone];

  return (
    <svg
      viewBox={SYMBOL.viewBox}
      aria-hidden="true"
      className={`pointer-events-none absolute ${className}`}
    >
      <path d={SYMBOL.left} className={left} />
      <path d={SYMBOL.right} className={right} />
    </svg>
  );
}
