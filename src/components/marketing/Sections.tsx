import Link from "next/link";
import {
  AdminMockup,
  CalcMockup,
  ExportMockup,
  Frame,
  OrderNumberMockup,
  OrderPickMockup,
  ReportMockup,
  ReviewMockup,
  RunningMockup,
  TimesheetMockup,
} from "./Mockups";
import LiveKiosk from "./LiveKiosk";
import { SLOGAN } from "@/lib/brand";
import ContactLine from "./ContactLine";
import { Aurora, Grid, LiveBadge, Motif, PlateGlow } from "./Atmosphere";
import Parallax from "./Parallax";
import { Plate, SatelliteCard, SurfaceStrip } from "./Showcase";
import PriceCalculator from "./PriceCalculator";
import { faqQuestions } from "./faq-data";
import type { ModulePricing, ScreenPricing } from "@/lib/stripe";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import Reveal from "./Reveal";

/**
 * SÄLJSIDANS AVSNITT.
 *
 * FORMGIVNINGEN ÄR ETT SPECIFIKATIONSBLAD SOM ÖPPNAR HÖGT. Läsaren är en
 * verkstadschef som köper verktyg efter vad de gör, och sidans stomme är satt
 * därefter: numrerade avsnitt, hårfina linjer och siffror i tabellsiffror.
 * Ovanpå den stommen ligger varumärkets eget formspråk, hämtat ur bannerna i
 * `brand/03-social/`: stora staplade påståenden, Fjord och Snö som bärande
 * ytor, och symbolen uppförstorad som bakgrundsgeometri — se `Motif.tsx`.
 *
 * YTORNA OCH LJUSET LIGGER I `Atmosphere.tsx`, presentationen av
 * produktbilderna i `Showcase.tsx`, och rörelsen i `globals.css`. Den här
 * filen avgör VAD som står var; den ritar inte längre sina egna gradienter.
 * Skälet står i Atmosphere: nio avsnitt som var och en skriver sitt eget ljus
 * blir efter tredje ändringen nio olika ljus.
 *
 * YTORNAS ORDNING ÄR MEDVETEN. Fjord, Snö, vit, Fjord, Snö, vit, Fjord, vit,
 * Snö, Tick. Grönt som hel yta exakt en gång, sist: grönt är accent och aldrig
 * huvudfärg, och ett enda grönt block i slutet är vad varumärkets egen
 * delningsbild gör.
 *
 * DEN TREDJE MÖRKA YTAN ÄR BANDET, och den är kort med flit. Sidan är delad i
 * två halvor — det som sker i verkstaden och det som sker på kontoret — och
 * bandet är gångjärnet mellan dem. Ett fullbrett mörkt band som drar förbi med
 * samtliga ytor svarar på frågan en köpare har efter två avsnitt och som ingen
 * text svarar på: hur mycket är det här? Därför är det ett band och inte ett
 * numrerat avsnitt. Numren är sidans innehållsförteckning, och en bild av
 * omfattningen är inte ett kapitel.
 *
 * SKARVARNA MELLAN AVSNITTEN sätts i `src/app/page.tsx` och inte här. Ett
 * avsnitt som ritar sin egen halva av övergången till nästa måste hållas i takt
 * med det avsnittet, och de hinner alltid sluta vara det.
 *
 * SPRÅKET FÖLJER CLAUDE.md § 7.1, och det gäller här lika hårt som i panelen:
 *
 *  - Formell svenska. "Internetanslutningen bryts", inte "nätet försvinner".
 *  - Vad systemet GÖR, aldrig varför det är byggt som det är. Att två
 *    dokument inte delar kod är sant och viktigt, men det är en uppgift för
 *    den som underhåller systemet och inte för den som köper det.
 *  - Inga eftertankar efter tankstreck, och ingen text som säger det bilden
 *    redan visar.
 *
 * PRISET STÅR BARA I PRISAVSNITTET. Den som vill veta vad det kostar hittar
 * dit; den som läser uppifrån ska först få veta vad de får.
 */

/* -------------------------------------------------------------------------- */
/* Gemensamma byggstenar                                                       */
/* -------------------------------------------------------------------------- */

/** Belopp i svensk form. Samma formatering som i produkten. */
function kr(amount: number): string {
  return amount.toLocaleString("sv-SE");
}

/** Innehållets bredd och luft. Samma i varje avsnitt, så sidan står i spalt. */
const SHELL = "mx-auto max-w-6xl px-6 py-24 sm:py-32";

/**
 * Knappen som leder vidare.
 *
 * Fjord på ljus yta, Tick på mörk. Det är guidens egen uppdelning: grönt är
 * accent på mörkt, och på en ljus yta bär primärfärgen knappen.
 *
 * TRE SAKER SKER NÄR PEKAREN VILAR PÅ DEN, och alla tre är samma besked från
 * olika håll: knappen lyfter en pixel, skuggan under den växer, och pilen
 * flyttar sig ett steg åt höger. En knapp som bara byter ton känns som en bild
 * av en knapp.
 *
 * GLANSEN LIGGER BARA PÅ DEN MÖRKA VARIANTEN. Den gröna knappen är sidans
 * starkaste yta och den enda som tål ett ljus som vandrar över den; samma band
 * över Fjord blir ett grått streck.
 */
function Cta({
  href,
  children,
  onDark,
  className = "",
}: {
  href: string;
  children: string;
  onDark?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-6 py-3.5 text-[15px] font-semibold transition-all duration-300 hover:-translate-y-0.5 ${
        onDark
          ? "bg-tick text-neutral-900 shadow-[0_8px_24px_-8px_rgba(46,209,150,0.5)] hover:bg-emerald-300 hover:shadow-[0_14px_32px_-10px_rgba(46,209,150,0.65)]"
          : "bg-neutral-900 text-white shadow-[0_8px_24px_-10px_rgba(14,26,43,0.5)] hover:bg-neutral-800 hover:shadow-[0_14px_32px_-12px_rgba(14,26,43,0.6)]"
      } ${className}`}
    >
      {onDark && (
        <span
          aria-hidden="true"
          className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent via-white/45 to-transparent"
        />
      )}

      <span className="relative">{children}</span>

      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="relative h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </Link>
  );
}

/**
 * Den andra knappen, den som leder längre ned på sidan.
 *
 * Ram och ingen fyllning. Den ska finnas för den som inte är redo att
 * registrera sig, och inte konkurrera med den som är det.
 */
function GhostCta({
  href,
  children,
  onDark,
}: {
  href: string;
  children: string;
  onDark?: boolean;
}) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-2 rounded-lg border px-6 py-3.5 text-[15px] font-semibold transition-all duration-300 ${
        onDark
          ? "border-white/15 bg-white/5 text-neutral-200 hover:border-white/30 hover:bg-white/10"
          : "border-neutral-300 text-neutral-900 hover:border-neutral-900 hover:bg-neutral-50"
      }`}
    >
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-y-0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 3v10M4 9l4 4 4-4" />
      </svg>
    </a>
  );
}

/**
 * Avsnittets huvud.
 *
 * Nummer, linje, etikett. Sedan rubriken och högst ett par rader text. Samma
 * uppbyggnad hela vägen ned, så att sidan läses som ett dokument och inte som
 * en trave olika sidor staplade på varandra.
 *
 * Numret står i grönt. Det är sidans minsta accent och den enda färg som följer
 * med hela vägen ned — ögat hittar nästa avsnitt på färgen i stället för att
 * leta efter en linje.
 *
 * RUBRIKEN HAR EN GRADIENT I SIG, och den går från brödtextens färg till en
 * ljusare ton av samma. Det är inte en färgeffekt utan ett djup: en rubrik i
 * fyrtiofyra punkter på en platt färg ser tryckt ut, och samma rubrik med ett
 * fall i tonen ser ut att ligga i ljus. Ingen ny färg kommer in.
 */
function SectionHead({
  index,
  eyebrow,
  title,
  intro,
  onDark,
  centered,
}: {
  index: string;
  eyebrow: string;
  title: string;
  intro?: string;
  onDark?: boolean;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p
        className={`flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider ${
          centered ? "justify-center" : ""
        }`}
      >
        <span className={onDark ? "text-tick" : "text-tick-deep"}>{index}</span>
        <span
          aria-hidden="true"
          className={`h-px w-8 bg-linear-to-r to-transparent ${
            onDark ? "from-neutral-600" : "from-neutral-300"
          }`}
        />
        <span className={onDark ? "text-neutral-400" : "text-neutral-500"}>
          {eyebrow}
        </span>
      </p>

      <h2
        className={`sheen-text mt-6 text-[32px] font-semibold leading-[1.08] tracking-tight sm:text-[44px] ${
          onDark
            ? "bg-linear-to-b from-white via-white to-neutral-200"
            : "bg-linear-to-b from-neutral-900 via-neutral-900 to-neutral-600"
        }`}
      >
        {title}
      </h2>

      {intro && (
        <p
          className={`mt-5 text-[16px] leading-relaxed ${
            centered ? "mx-auto max-w-xl" : "max-w-xl"
          } ${onDark ? "text-neutral-400" : "text-neutral-600"}`}
        >
          {intro}
        </p>
      )}
    </div>
  );
}

/**
 * Rad i en uppräkning.
 *
 * En linje över varje rad i stället för en bock framför den. Bockar läses som
 * reklam; linjer läses som en specifikation.
 *
 * MARKÖREN VID VÄNSTERKANTEN VÄXER NÄR PEKAREN VILAR PÅ RADEN. Den är noll
 * pixlar bred i vila, så raden ser ut precis som förut för den som bara läser.
 * Hela listan läses som ett datablad, men den enskilda raden går att peka på.
 */
function SpecRow({ term, children }: { term: string; children: string }) {
  return (
    <div className="group relative grid gap-1 border-t border-neutral-200 py-4 transition-colors duration-300 sm:grid-cols-[13rem_1fr] sm:gap-6">
      <span
        aria-hidden="true"
        className="absolute -left-4 top-0 h-px w-0 bg-tick-deep transition-all duration-500 group-hover:w-4"
      />
      <dt className="text-[14px] font-medium text-neutral-900">{term}</dt>
      <dd className="text-[14px] leading-relaxed text-neutral-600 transition-colors duration-300 group-hover:text-neutral-900">
        {children}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * SIDANS FÖRSTA YTA ÄR FJORD.
 *
 * Rubriken säger vad produkten gör och inte vad varumärket heter: den som
 * landar här från en sökning har ännu inte hört talas om Tikkr, och "Rätt tid
 * på rätt order" är det enda som svarar på varför de ska läsa vidare.
 * Varumärkets egen rad står kvar som etikett ovanför, numera i en ram med en
 * punkt som pulserar — skärmen bredvid är levande, och etiketten säger det.
 *
 * YTAN HAR FYRA LAGER PÅ DJUPET. Bakifrån: ljuset, ritningsrutnätet, symbolen
 * uppförstorad, och innehållet. Inget av de tre första bär information, och
 * alla tre är `aria-hidden`.
 *
 * STAPELN TILL HÖGER ÄR SIDANS ENDA STÄLLE MED POINTERPARALLAX. Stämplings-
 * skärmen ligger i mitten av djupet och de två korten framför den, med olika
 * `--parallax-depth`. Rör man musen flyttar de sig olika mycket, och en platt
 * skärm läses som ett rum. Skälen till att rörelsen saknas på en telefon, utan
 * JavaScript och vid minskad rörelse står i `Parallax.tsx`.
 *
 * KORTEN ÄR PANELENS OCH INTE KIOSKENS. Det är hela produktens löfte i en
 * bild: ett tryck på skärmen i verkstaden blir ett tal på kontoret. Korten bär
 * därför talen ur panelens egen översikt och visar inga belopp, eftersom
 * kiosken aldrig gör det.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-neutral-900">
      <Aurora tone="onDark" />
      <Grid tone="onDark" />
      <Motif tone="onDark" className="-right-56 -top-40 h-[52rem] w-[52rem]" />

      <Parallax className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 pb-24 pt-20 sm:pb-28 sm:pt-24 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="animate-rise">
            <LiveBadge>{SLOGAN}</LiveBadge>
          </div>

          {/* Gradienten faller från vitt till Snö i botten av bokstäverna.
              En rubrik i sextioåtta punkter på en platt vit färg ser tryckt
              ut; samma rubrik med ett fall i tonen ser ut att stå i ljus.
              Ingen ny färg kommer in, och grönt rör den inte — guiden säger
              uttryckligen att grönt är accent och aldrig huvudfärg. */}
          <h1
            className="animate-rise sheen-text mt-7 bg-linear-to-b from-white via-white to-neutral-200 text-[46px] font-semibold leading-none tracking-tight sm:text-[68px]"
            style={{ animationDelay: "60ms" }}
          >
            Rätt tid
            <br />
            på rätt order.
          </h1>

          <p
            className="animate-rise mt-7 max-w-lg text-[17px] leading-relaxed text-neutral-400"
            style={{ animationDelay: "120ms" }}
          >
            En pekskärm i verkstaden och en panel på kontoret. Personalen
            registrerar tiden med ett tryck, den hamnar på rätt order och
            arbetsmoment, och underlaget kan skickas samma dag.
          </p>

          <div
            className="animate-rise mt-10 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Cta href="/registrera" onDark>
              Prova i 30 dagar
            </Cta>
            <GhostCta href="#sa-funkar-det" onDark>
              Se hur det fungerar
            </GhostCta>
          </div>

          <p
            className="animate-rise mt-7 text-[13px] text-neutral-400"
            style={{ animationDelay: "240ms" }}
          >
            Inget betalkort. Ingen bindningstid.
          </p>
        </div>

        {/* Stämplingsskärmen, levande. Den som tittar i tio sekunder ser
            någon stämpla in utan att läsa en rad text.

            Låg en period i en tecknad skärm på stativ. Den togs bort: en
            ritad hårdvara blir en teckning av en skärm, och det är
            gränssnittet som ska synas.

            Lagret nedan sätter DJUP och inget annat. Skuggan sitter på
            `Frame` via `lift="onDark"`, eftersom `Frame` redan äger sin egen
            skugga: två `shadow-[...]` på samma element är två lika starka
            regler, och vilken som vinner avgörs av i vilken ordning Tailwind
            råkar skriva ut dem. */}
        <div
          className="animate-rise-soft relative"
          style={{ animationDelay: "300ms" }}
        >
          <PlateGlow className="-inset-x-16 -inset-y-12" />

          <div
            className="parallax-layer relative lg:[transform:perspective(2000px)_rotateY(-6deg)_rotateX(2deg)]"
            style={{ "--parallax-depth": 0.6 } as React.CSSProperties}
          >
            <Frame label="Stämplingsskärmen" lift="onDark">
              <LiveKiosk />
            </Frame>
          </div>

          {/* KORTEN LIGGER UTANFÖR SKÄRMENS KANT med flit. Ett kort innanför
              kanten läses som en del av gränssnittet, alltså som något
              produkten visar; ett kort som sticker ut läses som ett lager
              framför den. Det senare är sant: de kommer från panelen.

              Döljs under `sm`. En telefon är 375 pixlar bred, och tre lager
              på den bredden blir tre kort som ligger ovanpå varandra. */}
          <div
            className="parallax-layer animate-float absolute -bottom-6 -left-2 hidden sm:block lg:-left-14"
            style={{ "--parallax-depth": 1.8 } as React.CSSProperties}
          >
            <SatelliteCard
              label="Fakturerbar tid"
              value="84:30"
              foot="Vecka 16, samtliga ordrar"
              tone="tick"
            />
          </div>

          <div
            className="parallax-layer animate-float-slow absolute -right-4 -top-8 hidden sm:block xl:-right-10"
            style={{ "--parallax-depth": 2.4 } as React.CSSProperties}
          >
            <SatelliteCard
              label="Arbetar just nu"
              value="5"
              foot="Av nio anställda"
            />
          </div>
        </div>
      </Parallax>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Siffrorna direkt under hero                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fyra fakta, satta som en datarad.
 *
 * Står där andra sidor har en rad kundlogotyper. Vi har en pilotkund och inga
 * logotyper att visa.
 *
 * Ligger kvar på Fjord och blir därmed hero:s fot i stället för en egen remsa.
 * Siffrorna hör till löftet ovanför, inte till avsnittet under.
 */
export function Facts() {
  const facts = [
    { value: "30 dagar", label: "provperiod utan betalkort" },
    { value: "0 kr", label: "i uppstart och installation" },
    { value: "Obegränsat", label: "antal anställda och ordrar" },
    { value: "Sverige", label: "servrar och support" },
  ];

  return (
    <section className="relative border-t border-white/10 bg-neutral-900">
      {/* Rännilen och linjerna gäller från den smalaste skärmen och inte först
          vid lg. I 2x2-läget stod de fyra fakta kant i kant utan vare sig
          mellanrum eller avgränsare, och lästes som ett enda textblock.

          Linjen sitter till VÄNSTER om varje ruta utom den första i sin rad.
          I två kolumner är det var annan ruta, i fyra är det alla utom en —
          därav de två villkoren. */}
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 px-6 sm:gap-x-10 lg:grid-cols-4">
        {facts.map((fact, index) => (
          <div
            key={fact.label}
            className={`group py-8 ${
              index % 2 === 1 ? "border-l border-white/10 pl-6 sm:pl-10" : ""
            } ${index > 0 ? "lg:border-l lg:border-white/10 lg:pl-10" : ""}`}
          >
            <dt className="text-[24px] font-semibold tracking-tight text-white">
              {fact.value}
            </dt>
            <dd className="mt-1.5 text-[13px] leading-relaxed text-neutral-400 transition-colors duration-300 group-hover:text-neutral-300">
              {fact.label}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 01 Problemet                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Perspektivbytet: det enda avsnittet som beskriver ett problem.
 *
 * Låg tidigare på Fjord, som sidans enda mörka yta. Hero bär den rollen nu, och
 * ännu en mörk yta direkt efter hade läst som att sidan inte kommit igång.
 * Brytningen görs i stället med Snö och ett stort motiv, så att läsaren
 * registrerar att perspektivet bytts utan att ytan skriker om det.
 *
 * DE TRE PUNKTERNA ÄR KORT NU OCH INTE SPALTER. Skillnaden är att ett kort
 * reagerar: det lyfter en pixel och får en grön linje överst när pekaren vilar
 * på det. Linjen är noll pixlar bred i vila, så uppställningen ser ut som den
 * specifikation den var — tills man pekar på en rad.
 */
export function Problem() {
  const points = [
    {
      title: "Tiden skrivs upp i efterhand",
      body: "På fredagen ska någon minnas vad som utfördes på tisdagen. Uppskattningen blir underlag för en faktura.",
    },
    {
      title: "Timmar som aldrig faktureras",
      body: "Arbete som inte hinner rapporteras faktureras inte. Bortfallet syns aldrig, eftersom ingen vet vad som saknas.",
    },
    {
      title: "Ingen vet vad ordern kostade",
      body: "Utan tid per order saknas underlag för att bedöma lönsamheten. Nästa offert bygger på en uppskattning.",
    },
  ];

  return (
    <section className="relative overflow-hidden bg-neutral-50">
      <Grid tone="onLight" />
      <Motif
        tone="onLight"
        className="-bottom-80 -left-64 h-[46rem] w-[46rem]"
      />

      <div className={`relative ${SHELL}`}>
        <SectionHead
          index="01"
          eyebrow="Problemet"
          title="Tid som inte registreras när arbetet utförs blir en uppskattning"
        />

        <div className="mt-16 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {points.map((point, index) => (
            <Reveal key={point.title} delay={index * 90} className="h-full">
              <div className="group relative h-full overflow-hidden rounded-xl border border-neutral-200 bg-white/70 p-7 transition-all duration-500 hover:-translate-y-1 hover:border-neutral-300 hover:bg-white hover:shadow-[0_18px_40px_-20px_rgba(14,26,43,0.22)]">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-px w-0 bg-linear-to-r from-tick-deep to-transparent transition-all duration-700 group-hover:w-full"
                />

                <p className="text-[11px] font-semibold tracking-wider text-tick-deep">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-4 text-[18px] font-semibold tracking-tight text-neutral-900">
                  {point.title}
                </h3>
                <p className="mt-3 text-[14px] leading-relaxed text-neutral-600">
                  {point.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 02 I verkstaden                                                             */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    number: "1",
    title: "Namn, order, arbetsmoment",
    body: "Tre tryck, med knappar anpassade för arbetshandskar. Ordernumret slås in på en knappsats, och knappen som bekräftar bär kundens namn. Listan med öppna ordrar ligger ett tryck bort. Saknas ordern läggs den upp vid skärmen och markeras för komplettering på kontoret.",
    mockup: <OrderNumberMockup />,
  },
  {
    number: "2",
    title: "Tiden räknas medan arbetet pågår",
    body: "Skärmen visar vem som är instämplad och på vilket jobb. En operatör som kör två maskiner stämplar in på båda, och tiden räknas på var och en av ordrarna. Vid avbrott i internetanslutningen sparas registreringarna i skärmen och skickas när anslutningen återupprättats.",
    mockup: <RunningMockup />,
  },
  {
    number: "3",
    title: "Avvikelser märks före fakturering",
    body: "En glömd utstämpling stängs vid ett klockslag ni anger och hamnar i granskningen. Beräknade sluttider är märkta som beräknade, både i panelen och i underlaget.",
    mockup: <ReviewMockup />,
  },
];

/**
 * De tre stegen i verkstaden.
 *
 * STEGNUMRET STÅR TVÅ GÅNGER, och det är inte ett förbiseende. Det lilla står
 * i etikettraden där man läser det; det stora står bakom rubriken som en vattnad
 * siffra, och det är det man ser när man skrollar förbi utan att läsa. Den som
 * skummar sidan ska kunna se att det är tre steg och var hen är i dem.
 *
 * Vartannat avsnitt speglas, så att blicken flyttas i sidled på vägen ned i
 * stället för att falla rakt igenom. Bilden lutar åt det håll den ligger: en
 * bild i höger spalt vrids bort från mitten, så att den bortre kanten pekar ut
 * ur sidan och den närmaste mot texten den hör till.
 */
export function HowItWorks() {
  return (
    <section
      id="sa-funkar-det"
      className="relative scroll-mt-16 overflow-hidden bg-white"
    >
      <div className={SHELL}>
        <SectionHead
          index="02"
          eyebrow="I verkstaden"
          title="Från tryck på skärmen till färdigt underlag"
          intro="De två första stegen sker vid maskinen och kräver ingen inloggning."
        />

        <div className="mt-20 space-y-24 sm:space-y-32">
          {STEPS.map((step, index) => (
            <Reveal key={step.number} variant="soft">
              <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                <div
                  className={`relative ${index % 2 === 1 ? "lg:order-2" : ""}`}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-2 -top-14 select-none text-[120px] font-semibold leading-none tracking-tight text-neutral-100 sm:-top-16 sm:text-[160px]"
                  >
                    {step.number}
                  </span>

                  <div className="relative">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-tick-deep">
                      Steg {step.number}
                    </p>
                    <h3 className="mt-4 text-[24px] font-semibold tracking-tight text-neutral-900 sm:text-[28px]">
                      {step.title}
                    </h3>
                    <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-600">
                      {step.body}
                    </p>
                  </div>
                </div>

                <div className={index % 2 === 1 ? "lg:order-1" : ""}>
                  <Plate tilt={index % 2 === 1 ? "left" : "right"}>
                    {step.mockup}
                  </Plate>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Bandet med samtliga ytor                                                    */
/* -------------------------------------------------------------------------- */

/**
 * GÅNGJÄRNET MELLAN VERKSTADEN OCH KONTORET.
 *
 * Avsnitten ovanför visar tre ytor, ett åt gången, vid texten som förklarar
 * dem. Det är rätt för den som läser uppifrån och ned. Det svarar bara inte på
 * frågan en köpare har efter två avsnitt: hur mycket är det här?
 *
 * Bandet svarar på den utan ett ord. Åtta ytor ur produkten drar förbi i jämn
 * takt, och den som tittar i fem sekunder har sett omfattningen. Rörelsen och
 * varför spåret innehåller samma bilder två gånger står i `Showcase.tsx`.
 *
 * INGET NUMMER OCH INGEN RUBRIK I AVSNITTSFORM. Numren är sidans
 * innehållsförteckning, och en bild av omfattningen är inte ett kapitel.
 * Rubriken står därför centrerad och liten, utan spalt, och avsnittet är
 * kortare än de andra: det är en övergång och inte ett stopp.
 *
 * FULLBREDD MED FLIT. Bandet är det enda på sidan som går utanför spalten, och
 * det är hela greppet — produkten fortsätter utanför det man ser.
 */
export function Surfaces() {
  return (
    <section className="relative overflow-hidden bg-neutral-900 py-20 sm:py-24">
      <Aurora tone="onDark" />
      <Grid tone="onDark" />

      <div className="relative">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-[11px] font-medium uppercase tracking-wider text-tick">
            Samtliga ytor
          </p>
          <h2 className="sheen-text mx-auto mt-4 max-w-xl bg-linear-to-b from-white via-white to-neutral-200 text-[26px] font-semibold leading-tight tracking-tight sm:text-[34px]">
            Stämplingsskärmen, panelen och underlagen
          </h2>
        </div>

        <div className="mt-14">
          <SurfaceStrip />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 03 På kontoret                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Panelen.
 *
 * DE TVÅ BILDERNA LIGGER PÅ VARANDRA och inte under varandra. Rapporten ligger
 * framför översikten, förskjuten nedåt och åt sidan, så att översiktens kant
 * sticker fram bakom den. Det är samma yta sedd två gånger, och staplingen
 * säger det: panelen är ett ställe med flera vyer, inte två produkter.
 *
 * Staplingen gäller från `lg`. Under den bredden står bilderna under varandra,
 * eftersom två överlappande bilder på en telefon är en bild och en skymd kant.
 */
export function AdminSection() {
  return (
    <section
      id="panelen"
      className="relative scroll-mt-16 overflow-hidden bg-neutral-50"
    >
      <Aurora tone="onLight" />

      <div className={`relative ${SHELL}`}>
        <SectionHead
          index="03"
          eyebrow="På kontoret"
          title="Överblick i realtid"
          intro="Ett tryck på skärmen i verkstaden syns i panelen i samma stund."
        />

        <div className="mt-16 grid items-start gap-12 lg:grid-cols-2 lg:gap-20">
          <dl>
            <SpecRow term="Rapporter">
              Filtrera på period, order, kund, anställd och arbetsmoment.
              Summeringar per order, kund, anställd och arbetsmoment. Ta ut som
              PDF eller Excel.
            </SpecRow>
            <SpecRow term="Granskning">
              Beräknade sluttider och ordrar som lagts upp vid skärmen samlas på
              ett ställe för komplettering.
            </SpecRow>
            <SpecRow term="Ordrar och kunder">
              Kunden bär påslag, rabatt och adressuppgifter till underlaget.
              Ordern kan ha eget påslag eller avtalat fast pris.
            </SpecRow>
            <SpecRow term="Beräknad tid">
              Anges per arbetsmoment och jämförs löpande med utfallet.
            </SpecRow>
            <SpecRow term="Rättelser">
              Tider kan ändras och registreras i efterhand. Ändringar märks och
              går att skilja från registreringar gjorda på skärmen.
            </SpecRow>
          </dl>

          {/* ÖVERLAPPET GÖRS MED EN NEGATIV MARGINAL OCH INTE MED ABSOLUT
              PLACERING. En absolut placerad bild tas ur flödet, och då måste
              behållaren få en höjd satt för hand — en höjd som stämmer tills
              någon lägger till en rad i tabellen, varefter nästa avsnitt
              lägger sig över kanten utan att något syns i koden.

              Med en negativ marginal styr bildernas egna höjder behållarens,
              precis som annars. Den undre bilden ritas sist och hamnar därmed
              överst, vilket är vad överlappet ska visa.

              `flex-col` med `gap` och inte `space-y`: under lg står bilderna
              under varandra, och vid lg byter behållaren till `block`, där en
              negativ marginal fungerar som den ska. */}
          <div className="flex flex-col gap-6 lg:block">
            <div className="lg:w-[88%]">
              <Plate tilt="none">
                <AdminMockup />
              </Plate>
            </div>

            <div className="lg:-mt-24 lg:ml-auto lg:w-[88%]">
              <Plate tilt="none">
                <ReportMockup />
              </Plate>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 04 Dokumenten                                                               */
/* -------------------------------------------------------------------------- */

export function Documents() {
  const docs = [
    {
      kicker: "Till kunden",
      title: "Underlag per order",
      body: "PDF med er logotyp, ordernummer och kund som rubrik, samtliga stämplingar och en summa sist. Skrivs ut direkt eller laddas ner. Belopp tas med när ni väljer det.",
      mockup: <ExportMockup className="h-full" />,
    },
    {
      kicker: "Internt",
      title: "Efterkalkyl",
      body: "Självkostnad, påslag, rabatt och pris per order. Kostnaden räknas ur de timkostnader som gällde när arbetet utfördes, och redovisas per arbetsmoment.",
      mockup: <CalcMockup className="h-full" />,
    },
    {
      kicker: "Till lönen",
      title: "Tidrapport per anställd",
      body: "Planerad tid mot närvaro, med flex, komp och frånvaro. Ingår i tillvalet Löneunderlag.",
      mockup: <TimesheetMockup className="h-full" />,
    },
  ];

  return (
    <section
      id="underlag"
      className="relative scroll-mt-16 overflow-hidden bg-white"
    >
      <div className={SHELL}>
        <SectionHead
          index="04"
          eyebrow="Dokumenten"
          title="Tre underlag, tre mottagare"
          intro="Tid som registrerats en gång blir underlag till kundens faktura, till er egen efterkalkyl och till lönen."
        />

        {/* TVÅ RADER SOM DE TRE KORTEN DELAR: papperen överst, texterna under.

            Korten var tidigare var sin kolumn med `h-full` och en platta som
            tog plats som blev över. Det höll så länge de tre dokumenten råkade
            bli ungefär lika höga; när underlaget fick kundens adress och
            tidrapporten fick sina pass blev papperen olika höga, och de tre
            rubrikerna hamnade på tre olika linjer med fyrtiofem pixlars
            förskjutning. Det syns direkt och ser ut som ett fel, eftersom
            avsnittet är tre jämbördiga mottagare och inte en trappa.

            `grid-rows-subgrid` låter varje kort ärva de två raderna i stället
            för att räkna ut sin egen höjd. Pappersraden blir så hög som det
            högsta pappret, alla tre sträcks till den, och textraden börjar på
            samma linje i alla tre. Att ett kortare dokument får vit yta
            nedtill är rätt: ett A4 är lika stort oavsett hur mycket som står
            på det.

            Under lg står korten under varandra, och då gäller varken raderna
            eller mellanrummet — därav `mt-10` på texten, som bara slår till
            där. */}
        <div className="mt-20 grid gap-14 lg:grid-cols-3 lg:grid-rows-[auto_auto] lg:gap-x-10 lg:gap-y-8">
          {docs.map((doc, index) => (
            /* `tilt="none"`: tre lutade papper bredvid varandra blir ett
               mönster, och de tre dokumenten är inte ett mönster utan tre
               mottagare. Lyftet vid beröring står kvar. */
            <Reveal
              key={doc.title}
              delay={index * 90}
              variant="soft"
              className="lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:gap-y-8"
            >
              <Plate tilt="none">{doc.mockup}</Plate>

              <div className="mt-10 border-t border-neutral-200 pt-5 lg:mt-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-tick-deep">
                  {doc.kicker}
                </p>
                <h3 className="mt-2.5 text-[18px] font-semibold tracking-tight text-neutral-900">
                  {doc.title}
                </h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-neutral-600">
                  {doc.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 05 Innehåll                                                                 */
/* -------------------------------------------------------------------------- */

interface Capability {
  term: string;
  body: string;
  /** Märks som tillval i listan. Priset står i prisavsnittet. */
  tillval?: boolean;
}

/**
 * Sidans sista mörka yta, och den enda som är en ren uppräkning.
 *
 * Fjord gör att listan läses som ett datablad i stället för som ännu ett ljust
 * avsnitt att skumma.
 *
 * RADERNA LYSER UPP EN ÅT GÅNGEN. En lista på sexton rader läses inte, den
 * skummas, och den som hittat raden hen letade efter ska kunna se att hen står
 * på den. Markören till vänster växer ur ingenting, så listan i vila är precis
 * den täta uppräkning den ska vara.
 */
export function Capabilities() {
  const groups: { title: string; rows: Capability[] }[] = [
    {
      title: "I verkstaden",
      rows: [
        {
          term: "Ett tryck",
          body: "Ingen inloggning och ingen kod. Namn, order och arbetsmoment.",
        },
        {
          term: "Flera maskiner",
          body: "En anställd kan ha ett pågående jobb per arbetsmoment.",
        },
        {
          term: "Automatisk utstämpling",
          body: "Vid byte av jobb på samma arbetsmoment, och vid ett klockslag ni anger.",
        },
        {
          term: "Fungerar vid avbrott",
          body: "Registreringarna sparas i skärmen och skickas när internetanslutningen återupprättats.",
        },
        {
          term: "Improduktiv tid",
          body: "Städning, möten och underhåll registreras skilt från ordrarna.",
        },
      ],
    },
    {
      title: "På kontoret",
      rows: [
        {
          term: "Rapporter och export",
          body: "Rapporten tas ut som PDF eller Excel. Underlag och efterkalkyl skrivs ut direkt eller laddas ner som PDF, och flera markerade ordrar ger en fil per order i ett zip-arkiv.",
        },
        {
          term: "Efterkalkyl",
          body: "Självkostnad, påslag, rabatt och pris per order.",
        },
        {
          term: "Kundregister",
          body: "Påslag och rabatt per kund, adressuppgifter till underlaget och all tid samlad per kund.",
        },
        {
          term: "Flera administratörer",
          body: "Inbjudan per e-post. Ändringar är spårbara till ett konto.",
        },
        {
          term: "Löneunderlag",
          body: "Arbetstidsschema, stämplade raster, flex, komp och frånvaro.",
          tillval: true,
        },
        {
          term: "Planering",
          body: "Veckovis tidslinje per station, med orderns arbetsmoment utplacerade och stämplingen synlig i tavlan.",
          tillval: true,
        },
      ],
    },
    {
      title: "Drift och säkerhet",
      rows: [
        {
          term: "Svensk drift",
          body: "Servrar i Sverige. Personuppgiftsbiträdesavtal ingår.",
        },
        {
          term: "Tvåstegsinloggning",
          body: "Krävs för varje konto i panelen. Kod ur en app, eller via e-post till en bekräftad adress.",
        },
        {
          term: "Spårbarhet",
          body: "Varje stämpling registrerar tidpunkt, skärm och IP-adress. Ändringar av tid, frånvaro, timkostnad och roller loggas med värdet före och efter.",
        },
        {
          term: "Dataskydd",
          body: "Export och radering av en enskild anställds uppgifter sker i panelen.",
        },
        {
          term: "Ingen installation",
          body: "Skärmen är en pekskärm med webbläsare. Panelen nås på samma sätt.",
        },
        {
          term: "Uppdateringar",
          body: "Nya versioner driftsätts löpande och kräver ingen åtgärd.",
        },
      ],
    },
  ];

  return (
    <section
      id="funktioner"
      className="relative scroll-mt-16 overflow-hidden bg-neutral-900"
    >
      <Aurora tone="onDark" />
      <Grid tone="onDark" />
      <Motif tone="onDark" className="-right-72 -top-56 h-[50rem] w-[50rem]" />

      <div className={`relative ${SHELL}`}>
        <SectionHead
          onDark
          index="05"
          eyebrow="Innehåll"
          title="Vad som ingår"
        />

        <div className="mt-16 grid gap-12 lg:grid-cols-3 lg:gap-10">
          {groups.map((group, index) => (
            <Reveal key={group.title} delay={index * 80}>
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-tick">
                  {group.title}
                </h3>

                <dl className="mt-5">
                  {group.rows.map((row) => (
                    <div
                      key={row.term}
                      className="group relative border-t border-white/10 py-4 transition-colors duration-300"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -left-4 top-0 h-px w-0 bg-tick transition-all duration-500 group-hover:w-4"
                      />
                      <dt className="flex items-center gap-2 text-[14px] font-medium text-white">
                        {row.term}
                        {row.tillval && (
                          <span className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-neutral-400">
                            Tillval
                          </span>
                        )}
                      </dt>
                      <dd className="mt-1.5 text-[13px] leading-relaxed text-neutral-400 transition-colors duration-300 group-hover:text-neutral-300">
                        {row.body}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 06 Pris                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Priset.
 *
 * Två rader: basen per skärm och tillvalet per företag. Ingen jämförelsetabell
 * med tre kolumner där den mittersta är förvald, eftersom det inte finns tre
 * varianter att välja mellan.
 *
 * Siffrorna kommer från prislistan hos betaltjänsten och inte från koden. En
 * prisändring syns här utan att något behöver byggas om.
 *
 * KORTETS KANT ÄR EN GRADIENT och inte en linje. Den går från Lav genom en
 * svag ton av Tick och tillbaka, alltså ljusast där basen står. Kortet är
 * sidans viktigaste yta efter hero, och en kant som fångar ljus i överkanten
 * är det minsta sätt att säga det. Grönt i kanten är accent i ordets egen
 * mening; som fyllning hade det varit huvudfärg, vilket guiden förbjuder.
 */
/**
 * Säljtexten för varje tillval.
 *
 * Står här och inte i src/lib/modules.ts. Registret läses av både fakturasidan
 * och lönesidan och är beroendefritt med flit; dess `summary` är en rad på
 * prenumerationssidan, inte en säljtext. Två olika behov, två olika texter.
 */
const MODULE_COPY: Record<ModuleKey, string> = {
  PAYROLL:
    "Arbetstidsschema, stämplade raster, flex, komp, frånvaro och tidrapport " +
    "per anställd. Priset gäller hela företaget oavsett antal skärmar och " +
    "anställda.",
  PLANNING:
    "Veckovis tidslinje med en rad per station. Dra ut orderns arbetsmoment " +
    "med sin beräknade tid, och se direkt i tavlan när någon stämplar in på " +
    "jobbet.",
};

export function Pricing({
  pricing,
  modules,
}: {
  pricing: ScreenPricing;
  modules: ModulePricing;
}) {
  // EN RAD PER TILLVAL, hämtad ur registret. Stod som en handskriven rad för
  // löneunderlaget fram till att planeringen kom, och då hade nästa modul
  // behövt en kopia av hela rutan. Beskrivningarna hör hemma här och inte i
  // modules.ts: registret läses av både fakturasidan och lönesidan och måste
  // förbli beroendefritt, och en säljtext är inte ett systemvillkor.
  const offers = MODULE_KEYS.map((key) => ({
    key,
    name: MODULES[key].name,
    price: modules[key],
    body: MODULE_COPY[key],
  }));

  return (
    <section id="pris" className="relative scroll-mt-16 overflow-hidden bg-white">
      <Aurora tone="onLight" className="inset-x-0 top-0 h-[40rem]" />

      <div className={`relative ${SHELL}`}>
        <SectionHead
          index="06"
          eyebrow="Pris"
          title="Per skärm, inte per anställd"
          intro="Antalet anställda, ordrar och stämplingar påverkar inte priset."
        />

        {/* Kanten som gradient: en pixel yttre ruta med gradienten som
            fyllning, och kortet innanför. Greppet gör att hörnradien stämmer
            hela vägen runt, vilket en ritad kant inte kan. */}
        <div className="mt-16 rounded-2xl bg-linear-to-b from-neutral-200 via-tick/40 to-neutral-200 p-px shadow-[0_28px_64px_-32px_rgba(14,26,43,0.28)]">
          <div className="overflow-hidden rounded-[15px] bg-white">
            {/* Basen. Den stora siffran till vänster och innehållet till
                höger, som en rad i en prislista snarare än ett paketkort. */}
            <div className="grid gap-8 border-b border-neutral-200 bg-white p-7 sm:p-10 lg:grid-cols-[20rem_1fr] lg:gap-12">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-tick-deep">
                  Bas
                </p>
                <p className="mt-5 flex items-baseline gap-2">
                  <span className="sheen-text bg-linear-to-b from-neutral-900 to-neutral-600 text-[56px] font-semibold leading-none tracking-tight tabular-nums">
                    {kr(pricing.month)}
                  </span>
                  <span className="text-[15px] text-neutral-500">
                    kr per skärm och månad
                  </span>
                </p>
                <p className="mt-3 text-[13px] text-neutral-500">
                  Exklusive moms. Ingen bindningstid.
                </p>

                {pricing.year !== null && (
                  <p className="mt-5 inline-flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[13px] text-neutral-700">
                    <span className="font-medium tabular-nums">
                      {kr(pricing.year)} kr per år
                    </span>
                    <span className="text-neutral-500">
                      tio månaders pris för tolv
                    </span>
                  </p>
                )}
              </div>

              <div>
                <p className="text-[14px] font-medium text-neutral-900">
                  Ingår i basen
                </p>
                <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                  {[
                    "Obegränsat antal anställda",
                    "Obegränsat antal ordrar och moment",
                    "Obegränsat antal stämplingar",
                    "Rapporter som PDF och Excel",
                    "Efterkalkyl och kundregister",
                    "Flera administratörer",
                    "Uppdateringar och drift",
                    "Support på svenska",
                  ].map((item) => (
                    <li
                      key={item}
                      className="group flex items-center gap-2 border-t border-neutral-100 py-1.5 text-[13px] text-neutral-600"
                    >
                      <span
                        aria-hidden="true"
                        className="h-1 w-1 shrink-0 rounded-full bg-neutral-300 transition-colors duration-300 group-hover:bg-tick-deep"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Tillvalen. En rad var med tonad botten, så att det syns att de
                är något annat än basen och inte paket till. */}
            {offers.map((offer) => (
              <div
                key={offer.key}
                className="group grid gap-6 border-b border-neutral-200 bg-neutral-50 p-7 transition-colors duration-300 last:border-b-0 hover:bg-neutral-100/70 sm:p-10 lg:grid-cols-[20rem_1fr] lg:gap-12"
              >
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                    Tillval
                  </p>
                  <p className="mt-5 flex items-baseline gap-2">
                    <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-neutral-900">
                      {kr(offer.price.month)}
                    </span>
                    <span className="text-[14px] text-neutral-500">
                      kr per månad och företag
                    </span>
                  </p>
                  {offer.price.year !== null && (
                    <p className="mt-3 text-[13px] text-neutral-500">
                      eller {kr(offer.price.year)} kr per år
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[14px] font-medium text-neutral-900">
                    {offer.name}
                  </p>
                  <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-neutral-600">
                    {offer.body}
                  </p>
                </div>
              </div>
            ))}

            {/* Sista raden i priskortet: kundens egen summa. Styckpriserna står
                kvar ovanför — det är dem man ska kunna upprepa. */}
            <PriceCalculator pricing={pricing} modules={modules} />
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Cta href="/registrera">Prova i 30 dagar</Cta>
          <p className="text-[13px] text-neutral-500">
            Inget betalkort. Provperioden övergår inte i betalning av sig själv.
          </p>
        </div>

        <ContactLine className="mt-5" />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 07 Frågor                                                                   */
/* -------------------------------------------------------------------------- */

export function Faq({ modules }: { modules: ModulePricing }) {
  const questions = faqQuestions(modules);

  return (
    <section
      id="fragor"
      className="relative scroll-mt-16 overflow-hidden bg-neutral-50"
    >
      <Motif tone="onLight" className="-bottom-96 -right-72 h-[48rem] w-[48rem]" />

      <div className={`relative ${SHELL}`}>
        <SectionHead index="07" eyebrow="Frågor" title="Vanliga frågor" />

        {/* <details> ger utfällbara svar utan JavaScript. Fungerar även om
            något går fel, och går att söka i med webbläsarens egen funktion.

            Frågan ligger i ett kort som lyser upp när pekaren vilar på det,
            och den öppna frågan behåller den ljusa ytan: en öppen fråga ska
            synas som öppen även när pekaren flyttat sig. */}
        <div className="mt-14 space-y-2">
          {questions.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-neutral-200 bg-white/60 px-5 transition-colors duration-300 open:border-neutral-300 open:bg-white hover:border-neutral-300 hover:bg-white"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-400 transition-all duration-300 group-open:rotate-45 group-open:border-tick-deep group-open:text-tick-deep"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                  >
                    <path d="M10 4v12M4 10h12" />
                  </svg>
                </span>
              </summary>
              <p className="max-w-3xl pb-5 text-[14px] leading-relaxed text-neutral-600">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Avslutande uppmaning                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Sidans enda gröna yta.
 *
 * Grönt är accent och aldrig huvudfärg. Ett block, sist, är precis vad
 * varumärkets egen delningsbild gör — och det blir sidans starkaste yta just
 * för att färgen inte förekommit som yta tidigare.
 *
 * GLANSEN GÅR ÖVER HELA BLOCKET och inte över knappen. Knappen i det här
 * avsnittet är Fjord, inte Tick, och en glans över en mörk knapp blir ett grått
 * streck. Ytan bakom den är däremot sidans ljusaste, och den tål ljus: bandet
 * vandrar över den en gång var nionde sekund och står still resten av tiden.
 * Resten av varvet står det utanför kanten, eftersom en glans som rör sig
 * oavbrutet drar blicken från det man ska läsa.
 */
export function FinalCta({ pricing }: { pricing: ScreenPricing }) {
  return (
    <section className="relative overflow-hidden bg-tick">
      <Motif tone="onTick" className="-right-48 -top-64 h-[48rem] w-[48rem]" />

      <span
        aria-hidden="true"
        className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-linear-to-r from-transparent via-white/30 to-transparent"
      />

      <div className={`relative ${SHELL}`}>
        <div className="grid items-end gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-[40px] font-semibold leading-[1.02] tracking-tight text-neutral-900 sm:text-[56px]">
              Prova i er
              <br />
              egen verkstad.
            </h2>
            <p className="mt-7 max-w-lg text-[16px] leading-relaxed text-emerald-900">
              Lägg upp anställda, arbetsmoment och ordrar, koppla skärmen och
              börja registrera tid. Uppsättningen tar cirka femton minuter och
              kräver inga kortuppgifter.
            </p>
          </div>

          <div className="lg:justify-self-end">
            <div className="flex flex-wrap gap-3">
              <Cta href="/registrera">Skapa arbetsyta</Cta>
              {/* Ramen är Fjord och inte en mörkare grön. Grönt mot grönt
                  skiljer sig för lite för att läsas som en kant, och knappen
                  såg ut att sakna ram tills man letade efter den. */}
              <Link
                href="/admin/login"
                className="rounded-lg border border-neutral-900/55 px-6 py-3.5 text-[15px] font-semibold text-neutral-900 transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-900 hover:bg-neutral-900/5"
              >
                Logga in
              </Link>
            </div>

            <p className="mt-6 text-[13px] text-emerald-900">
              30 dagar utan betalkort, därefter {kr(pricing.month)} kr per skärm
              och månad.
            </p>

            <ContactLine tone="tick" className="mt-2" />
          </div>
        </div>
      </div>
    </section>
  );
}
