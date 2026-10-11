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
 * ett par centimeter, och den lägger en hårfin accentlinje i mitten där
 * övergången är. Linjen är ljusast i mitten och försvinner mot sidorna, så att
 * den läses som ett ljus längs kanten och inte som en ram runt avsnittet.
 *
 * LIGGER SOM EN EGEN RAD MELLAN AVSNITTEN och inte som en pseudoelement på
 * dem. Två avsnitt som båda ritar sin egen halva av skarven måste hållas i
 * takt med varandra, och de hinner alltid sluta vara det — samma skäl som att
 * orderns beräknade tid aldrig lagras på två ställen.
 *
 * `from`/`to` är avsiktligt de två avsnittens FAKTISKA färger och inte en
 * generisk grå. En skarv som inte möter ytan den sitter mellan är en synlig
 * remsa, alltså precis det den ska dölja.
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

const SEAMS: Record<SeamTone, { gradient: string; line: string }> = {
  // Fjord ned i Snö. Hero in i problemavsnittet.
  darkToLight: {
    gradient: "bg-linear-to-b from-neutral-900 to-neutral-50",
    line: "via-tick/35",
  },
  lightToDark: {
    gradient: "bg-linear-to-b from-neutral-50 to-neutral-900",
    line: "via-tick/30",
  },
  lightToWhite: {
    gradient: "bg-linear-to-b from-neutral-50 to-white",
    line: "via-tick-deep/20",
  },
  whiteToLight: {
    gradient: "bg-linear-to-b from-white to-neutral-50",
    line: "via-tick-deep/20",
  },
  whiteToDark: {
    gradient: "bg-linear-to-b from-white to-neutral-900",
    line: "via-tick/30",
  },
  darkToWhite: {
    gradient: "bg-linear-to-b from-neutral-900 to-white",
    line: "via-tick/35",
  },
  // Snö ned i Tick. Den enda skarven mot en grön yta, alltså den sista.
  lightToTick: {
    gradient: "bg-linear-to-b from-neutral-50 to-tick",
    line: "via-white/40",
  },
  /*
    Tick ned i Fjord, alltså det gröna blocket in i sidfoten.

    Den skarpaste övergången på sidan, eftersom det är de två färger som ligger
    längst från varandra i guiden. Att den ändå tonas har ett skäl: en rak kant
    mellan Tick och Fjord läses som att sidan tar slut och en annan sida börjar,
    och foten hör till sidan.

    Linjen är Fjord och inte vit eller grön. Mot en övergång som redan går från
    ljust till mörkt skulle en ljus linje bli ett tredje ljus och en grön skulle
    försvinna i ytan ovanför.
  */
  tickToDark: {
    gradient: "bg-linear-to-b from-tick to-neutral-900",
    line: "via-neutral-900/25",
  },
};

export function Seam({ tone }: { tone: SeamTone }) {
  const { gradient, line } = SEAMS[tone];

  return (
    <div aria-hidden="true" className={`relative h-20 sm:h-28 ${gradient}`}>
      <div
        className={`absolute inset-x-0 top-1/2 h-px bg-linear-to-r from-transparent to-transparent ${line}`}
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
