import Motif from "./Motif";

/**
 * SÄLJSIDANS YTOR.
 *
 * Varje avsnitt på sidan ligger på en av sex färger, och det är allt en platta
 * yta kan göra. Det här är lagren som läggs OVANPÅ färgen: ljuset, rutnätet,
 * hårlinjen och skarven mellan två avsnitt.
 *
 * VARFÖR DE LIGGER SAMLADE HÄR OCH INTE I VARJE AVSNITT. Sidan har nio
 * avsnitt. Skrevs ljuset på plats i varje skulle det bli nio uppsättningar
 * gradienter som alla är ungefär likadana, och efter tredje ändringen är de
 * inte det längre. En sida som upprepar samma handgrepp ser ut att komma
 * någonstans ifrån; en sida med nio varianter av samma effekt ser hopplockad
 * ut. Samma skäl som `Motif.tsx` har för att vara en komponent.
 *
 * ALLT HÄR ÄR `aria-hidden` OCH `pointer-events-none`. Det är ytor, inte
 * innehåll. Den som lyssnar på sidan ska inte få höra att det finns ett ljus i
 * bakgrunden sju gånger, och den som försöker markera en rubrik ska inte träffa
 * en gradient.
 *
 * FÄRGERNA LIGGER I `globals.css`. Klasserna `brand-aurora`, `brand-grid` och
 * de andra är definierade där, av guidens sex hexkoder. Att de står som
 * hexkoder och inte som tokens har ett skäl som står på plats i den filen.
 */

/* -------------------------------------------------------------------------- */
/* Ljuset                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * LJUSET BAKOM INNEHÅLLET.
 *
 * Tre gradienter i Tick, Tick Deep och Snö som driver långsamt i sidled. Det
 * är sidans enda effekt som pågår utan att någon gjort något, och den är
 * medvetet så svag att den inte går att se medan man tittar på den — bara när
 * man tittar bort och tillbaka.
 *
 * `scale-125` på det drivande lagret är inte en smaksak. Driften flyttar
 * lagret ett par procent, och ett lager som ligger kant i kant med ytan skulle
 * då lämna en tom remsa vid kanten halva varvet. Det större lagret har alltid
 * täckning kvar.
 */
export function Aurora({
  tone = "onDark",
  className = "",
}: {
  tone?: "onDark" | "onLight";
  /** Placering. Alltid absolut; förvalet täcker hela avsnittet. */
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute overflow-hidden ${
        className || "inset-0"
      }`}
    >
      <div
        className={`animate-aurora h-full w-full scale-125 ${
          tone === "onDark" ? "brand-aurora" : "brand-aurora-light"
        }`}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rutnätet                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * RITNINGSRUTNÄTET.
 *
 * 64 pixlars rutor i en ton knappt skild från ytan. Greppet hör hemma i den
 * här produkten och inte i en generisk programvarusida: en verkstad läser
 * ritningar, och ritningar har rutnät.
 *
 * Tonas ut mot kanterna av en mask i `globals.css`, annars slutar linjerna i
 * en rak skarv mitt på ytan.
 */
export function Grid({
  tone = "onDark",
  className = "",
}: {
  tone?: "onDark" | "onLight";
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute ${className || "inset-0"} ${
        tone === "onDark" ? "brand-grid" : "brand-grid-light"
      }`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Skarven mellan två avsnitt                                                  */
/* -------------------------------------------------------------------------- */

/**
 * ÖVERGÅNGEN MELLAN TVÅ YTOR.
 *
 * Sidan växlar mellan Fjord, Snö, vitt och grönt nio gånger på vägen ned.
 * Varje växling var tidigare en rak kant, och nio raka kanter läses som nio
 * sidor staplade på varandra i stället för som en sida med en rytm.
 *
 * Skarven gör två saker. Den tonar den föregående ytans färg in i den nya över
 * ett par centimeter, och den lägger en hårfin accentlinje i överkanten, där
 * ytan ovanför tar slut. Linjen är ljusast i mitten och försvinner mot sidorna,
 * så att den läses som ett ljus längs kanten och inte som en ram runt avsnittet.
 *
 * LIGGER SOM EN EGEN RAD MELLAN AVSNITTEN och inte som en pseudoelement på
 * dem. Två avsnitt som båda ritar sin egen halva av skarven måste hållas i
 * takt med varandra, och de hinner alltid sluta vara det — samma skäl som att
 * orderns beräknade tid aldrig lagras på två ställen.
 *
 * Färgerna är avsiktligt de två avsnittens FAKTISKA och inte en generisk grå.
 * En skarv som inte möter ytan den sitter mellan är en synlig remsa, alltså
 * precis det den ska dölja.
 */
export type SeamTone =
  | "darkToLight"
  | "lightToDark"
  | "lightToWhite"
  | "whiteToLight"
  | "whiteToDark"
  | "darkToWhite"
  | "lightToTick"
  | "tickToDark";

/**
 * Vilken av de åtta skarvarna, och var linjen sitter.
 *
 * SJÄLVA ÖVERGÅNGEN LIGGER I `globals.css`, som `.seam-*`. Skälet står där:
 * en rak gradient mellan Fjord och Snö går genom död gråska och ändrar sig
 * lika mycket hela vägen, vilket ger ett grått band med en kant mitt i. Åtta
 * skarvar delar därför EN kurva, och här står bara vilka två färger var och en
 * går mellan.
 *
 * LINJENS FÄRG STÅR KVAR HÄR, eftersom den är en accent och inte en yta. Den
 * väljs numera mot den ÖVRE ytan och inte mot mitten, eftersom linjen flyttat
 * dit: Tick på Fjord, Tick Deep på Snö och vitt, Fjord på Tick. Vitt på Snö,
 * som stod här förut, syntes inte alls när linjen hamnade där.
 */
const SEAMS: Record<SeamTone, { surface: string; line: string }> = {
  // Fjord ned i Snö. Hero in i problemavsnittet.
  darkToLight: { surface: "seam-dark-light", line: "via-tick/30" },
  lightToDark: { surface: "seam-light-dark", line: "via-tick-deep/25" },
  lightToWhite: { surface: "seam-light-white", line: "via-tick-deep/20" },
  whiteToLight: { surface: "seam-white-light", line: "via-tick-deep/20" },
  whiteToDark: { surface: "seam-white-dark", line: "via-tick-deep/25" },
  darkToWhite: { surface: "seam-dark-white", line: "via-tick/30" },
  // Snö ned i Tick. Den enda skarven mot en grön yta, alltså den sista.
  lightToTick: { surface: "seam-light-tick", line: "via-tick-deep/25" },
  /*
    Tick ned i Fjord, alltså det gröna blocket in i sidfoten.

    Linjen är Fjord och inte vit eller grön. Mot en övergång som redan går
    från ljust till mörkt skulle en ljus linje bli ett tredje ljus och en grön
    försvinna i ytan ovanför.
  */
  tickToDark: { surface: "seam-tick-dark", line: "via-neutral-900/20" },
};

/**
 * LINJEN SITTER I ÖVERKANTEN OCH INTE PÅ MITTEN.
 *
 * På mitten låg den i den ljusaste delen av övergången, alltså i det som
 * tidigare var ett grått band, och lästes där som ett streck någon glömt. I
 * överkanten ligger den där ytan ovanför tar slut och läses som en kant som
 * fångar ljus — samma grepp som ljusningen överst på produktbildernas ram.
 *
 * HÖJDEN ÄR TILLTAGEN MED FLIT, och det är hälften av rättningen. Skarven var
 * 112 pixlar och är 176. En övergång från Fjord till Snö spelar ut åttiosex
 * punkter ljushet oavsett hur lång den är; på halva sträckan blir varje pixel
 * dubbelt så stort steg, och då syns stegen. Kurvan och höjden tillsammans gör
 * att även den brantaste punkten är flackare än den raka ramp som satt här.
 */
export function Seam({ tone }: { tone: SeamTone }) {
  const { surface, line } = SEAMS[tone];

  return (
    <div
      aria-hidden="true"
      className={`seam ${surface} relative h-28 sm:h-44`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent ${line}`}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Etiketten med den pulserande punkten                                        */
/* -------------------------------------------------------------------------- */

/**
 * ETIKETT MED EN PUNKT SOM PULSERAR.
 *
 * Grönt betyder "pågår just nu" i hela produkten — en instämplad person, ett
 * sparat värde, ett positivt saldo. Här betyder det att skärmen man tittar på
 * är levande och inte en bild.
 *
 * Punkten är två cirklar: en fast och en som växer och tonar ut. Att bara låta
 * den fasta blinka hade gjort den till en varningslampa, och den säger inte
 * att något är fel.
 */
export function LiveBadge({
  children,
  tone = "onDark",
}: {
  children: string;
  tone?: "onDark" | "onLight";
}) {
  const dark = tone === "onDark";

  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-full border py-1.5 pl-3 pr-4 text-[11px] font-medium uppercase tracking-wider ${
        dark
          ? "border-white/10 bg-white/5 text-neutral-300"
          : "border-neutral-200 bg-white/70 text-neutral-600"
      }`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="animate-ping-soft absolute inset-0 rounded-full bg-tick" />
        <span
          className={`relative h-1.5 w-1.5 rounded-full ${
            dark ? "bg-tick" : "bg-tick-deep"
          }`}
        />
      </span>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Ljuset under en produktbild                                                 */
/* -------------------------------------------------------------------------- */

/**
 * GLÖDEN UNDER EN PRODUKTBILD.
 *
 * En grön ellips bakom bilden, kraftigt utsmetad. Den gör att bilden läses som
 * ett föremål som ligger framför en yta med ljus bakom, i stället för ett kort
 * klistrat på en färg.
 *
 * Ritas som gradient och inte med `blur()`. Skälet står i globals.css: en
 * oskärpa över en yta i den här storleken kostar en renderingsbuffert i varje
 * bildruta, och gradienten ser likadan ut.
 */
export function PlateGlow({
  className = "",
  tone = "onDark",
}: {
  className?: string;
  tone?: "onDark" | "onLight";
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute ${className}`}
      style={{
        backgroundImage:
          tone === "onDark"
            ? "radial-gradient(closest-side, rgba(46,209,150,0.26), rgba(46,209,150,0.07) 55%, transparent 78%)"
            : "radial-gradient(closest-side, rgba(15,158,104,0.16), rgba(15,158,104,0.04) 55%, transparent 78%)",
      }}
    />
  );
}

/**
 * Motivet exporteras vidare härifrån.
 *
 * Det hör till samma uppgift som resten av filen — en yta ovanpå en färg — och
 * den som bygger ett avsnitt ska inte behöva veta att just den ena ligger i en
 * egen fil sedan tidigare. Filen är kvar där den är, eftersom hjälpcentret
 * importerar den direkt.
 */
export { Motif };
