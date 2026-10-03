import Link from "next/link";
import {
  AdminMockup,
  CalcMockup,
  ExportMockup,
  Frame,
  OrderPickMockup,
  ReportMockup,
  ReviewMockup,
  RunningMockup,
  TimesheetMockup,
} from "./Mockups";
import LiveKiosk from "./LiveKiosk";
import { SLOGAN } from "@/lib/brand";
import ContactLine from "./ContactLine";
import Motif from "./Motif";
import PriceCalculator from "./PriceCalculator";
import { faqQuestions } from "./faq-data";
import type { ModulePricing, ScreenPricing } from "@/lib/stripe";
import { MODULES } from "@/lib/modules";
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
 * YTORNAS ORDNING ÄR MEDVETEN. Fjord, Snö, vit, Snö, vit, Fjord, vit, Snö,
 * Tick. Två mörka ytor med fem avsnitt emellan, och grönt som hel yta exakt en
 * gång, sist. Grönt är accent och aldrig huvudfärg; ett enda grönt block i
 * slutet är vad varumärkets egen delningsbild gör.
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
 */
function Cta({
  href,
  children,
  onDark,
}: {
  href: string;
  children: string;
  onDark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-6 py-3.5 text-[15px] font-semibold transition-colors ${
        onDark
          ? "bg-tick text-neutral-900 hover:bg-emerald-300"
          : "bg-neutral-900 text-white hover:bg-neutral-800"
      }`}
    >
      {children}
    </Link>
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
 */
function SectionHead({
  index,
  eyebrow,
  title,
  intro,
  onDark,
}: {
  index: string;
  eyebrow: string;
  title: string;
  intro?: string;
  onDark?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider">
        <span className={onDark ? "text-tick" : "text-tick-deep"}>{index}</span>
        <span
          aria-hidden="true"
          className={`h-px w-8 ${onDark ? "bg-neutral-700" : "bg-neutral-300"}`}
        />
        <span className={onDark ? "text-neutral-400" : "text-neutral-500"}>
          {eyebrow}
        </span>
      </p>

      <h2
        className={`mt-6 text-[32px] font-semibold leading-[1.08] tracking-tight sm:text-[44px] ${
          onDark ? "text-white" : "text-neutral-900"
        }`}
      >
        {title}
      </h2>

      {intro && (
        <p
          className={`mt-5 max-w-xl text-[16px] leading-relaxed ${
            onDark ? "text-neutral-400" : "text-neutral-600"
          }`}
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
 */
function SpecRow({ term, children }: { term: string; children: string }) {
  return (
    <div className="grid gap-1 border-t border-neutral-200 py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
      <dt className="text-[14px] font-medium text-neutral-900">{term}</dt>
      <dd className="text-[14px] leading-relaxed text-neutral-600">
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
 * Varumärkets egen rad står kvar som etikett ovanför.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-neutral-900">
      <Motif tone="onDark" className="-right-56 -top-40 h-[52rem] w-[52rem]" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 pb-24 pt-20 sm:pb-28 sm:pt-24 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="animate-rise text-[11px] font-medium uppercase tracking-wider text-tick">
            {SLOGAN}
          </p>

          <h1
            className="animate-rise mt-7 text-[46px] font-semibold leading-none tracking-tight text-white sm:text-[68px]"
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
            <a
              href="#sa-funkar-det"
              className="rounded-lg border border-neutral-700 px-6 py-3.5 text-[15px] font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              Se hur det fungerar
            </a>
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

            Skuggan ligger på en ruta UTANFÖR kortet och inte på kortet
            självt. Ett vitt kort mot Fjord behöver lyftas för att läsas som ett
            föremål framför ytan i stället för som ett hål i den, men `Frame`
            har redan en egen skugga: två `shadow-[...]` på samma element är två
            lika starka regler, och vilken som vinner avgörs av i vilken ordning
            Tailwind råkar skriva ut dem. */}
        <div
          className="animate-rise-soft rounded-lg shadow-[0_40px_80px_-40px_rgba(0,0,0,0.65)]"
          style={{ animationDelay: "300ms" }}
        >
          <Frame label="Stämplingsskärmen">
            <LiveKiosk />
          </Frame>
        </div>
      </div>
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
    <section className="border-t border-neutral-800 bg-neutral-900">
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
            className={`py-8 ${
              index % 2 === 1 ? "border-l border-neutral-800 pl-6 sm:pl-10" : ""
            } ${
              index > 0 ? "lg:border-l lg:border-neutral-800 lg:pl-10" : ""
            }`}
          >
            <dt className="text-[24px] font-semibold tracking-tight text-white">
              {fact.value}
            </dt>
            <dd className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">
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
      <Motif
        tone="onLight"
        className="-bottom-80 -left-64 h-[46rem] w-[46rem]"
      />

      <div className={`relative ${SHELL}`}>
        <SectionHead
          index="01"
          eyebrow="Problemet"
          title="Tid som inte registreras när arbetet utförs går inte att rekonstruera"
        />

        <div className="mt-16 grid border-t border-neutral-200 sm:grid-cols-3">
          {points.map((point, index) => (
            <Reveal key={point.title} delay={index * 90} className="h-full">
              <div
                className={`h-full py-8 sm:pr-8 ${
                  index > 0 ? "sm:border-l sm:border-neutral-200 sm:pl-8" : ""
                }`}
              >
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
    body: "Tre tryck, med knappar anpassade för arbetshandskar. Den som har ordernumret på ritningen kan ange det på en knappsats i stället. Saknas ordern läggs den upp vid skärmen och markeras för komplettering på kontoret.",
    mockup: <OrderPickMockup />,
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

export function HowItWorks() {
  return (
    <section id="sa-funkar-det" className="scroll-mt-16 bg-white">
      <div className={SHELL}>
        <SectionHead
          index="02"
          eyebrow="I verkstaden"
          title="Från tryck på skärmen till färdigt underlag"
          intro="De två första stegen sker vid maskinen och kräver ingen inloggning."
        />

        <div className="mt-20 space-y-20">
          {STEPS.map((step, index) => (
            <Reveal key={step.number}>
              <div className="grid items-center gap-10 border-t border-neutral-200 pt-12 lg:grid-cols-2 lg:gap-16">
                {/* Vartannat avsnitt speglas, så att blicken flyttas i sidled
                    på vägen ned i stället för att falla rakt igenom. */}
                <div className={index % 2 === 1 ? "lg:order-2" : ""}>
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

                <div className={index % 2 === 1 ? "lg:order-1" : ""}>
                  {step.mockup}
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
/* 03 På kontoret                                                              */
/* -------------------------------------------------------------------------- */

export function AdminSection() {
  return (
    <section id="panelen" className="scroll-mt-16 bg-neutral-50">
      <div className={SHELL}>
        <SectionHead
          index="03"
          eyebrow="På kontoret"
          title="Överblick i realtid"
          intro="Registrerad tid finns i panelen i samma stund som den registreras."
        />

        <div className="mt-16 grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <dl>
            <SpecRow term="Rapporter">
              Filtrera på period, order, kund, anställd och arbetsmoment. Ta ut
              som PDF eller Excel, eller skriv ut direkt.
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

          <div className="space-y-6">
            <ReportMockup />
            <div className="hidden lg:block">
              <AdminMockup />
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
      body: "PDF eller Excel med er logotyp, ordernummer och kund som rubrik, samtliga stämplingar och en summa sist. Belopp tas med när ni väljer det.",
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
    <section id="underlag" className="scroll-mt-16 bg-white">
      <div className={SHELL}>
        <SectionHead
          index="04"
          eyebrow="Dokumenten"
          title="Tre underlag, tre mottagare"
          intro="Tid som registrerats en gång blir underlag till kundens faktura, till er egen efterkalkyl och till lönen."
        />

        <div className="mt-16 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {docs.map((doc, index) => (
            /* h-full hela vägen ned: de tre pappersytorna blir lika höga även
               när en tabell har en rad mer, och rubrikerna under dem hamnar på
               samma linje. */
            <Reveal key={doc.title} delay={index * 90} className="h-full">
              <div className="flex h-full flex-col">
                <div className="flex-1">{doc.mockup}</div>

                <div className="mt-6 border-t border-neutral-200 pt-5">
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
 * Sidans andra mörka yta, och den enda som är en ren uppräkning.
 *
 * Fjord gör att listan läses som ett datablad i stället för som ännu ett ljust
 * avsnitt att skumma. Den ligger dessutom mitt emellan hero och slutblocket,
 * vilket ger sidan tre mörka hållpunkter på jämnt avstånd.
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
          body: "PDF, Excel och utskrift. Flera markerade ordrar ger en fil per order.",
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
          term: "Spårbarhet",
          body: "Varje stämpling registrerar tidpunkt, skärm och IP-adress.",
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
                      className="border-t border-neutral-800 py-4"
                    >
                      <dt className="flex items-center gap-2 text-[14px] font-medium text-white">
                        {row.term}
                        {row.tillval && (
                          <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-neutral-400">
                            Tillval
                          </span>
                        )}
                      </dt>
                      <dd className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">
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
 */
export function Pricing({
  pricing,
  modules,
}: {
  pricing: ScreenPricing;
  modules: ModulePricing;
}) {
  const payroll = modules.PAYROLL;

  return (
    <section id="pris" className="scroll-mt-16 bg-white">
      <div className={SHELL}>
        <SectionHead
          index="06"
          eyebrow="Pris"
          title="Per skärm, inte per anställd"
          intro="Antalet anställda, ordrar och stämplingar påverkar inte priset."
        />

        <div className="mt-16 overflow-hidden rounded-xl border border-neutral-200">
          {/* Basen. Den stora siffran till vänster och innehållet till höger,
              som en rad i en prislista snarare än ett paketkort. */}
          <div className="grid gap-8 border-b border-neutral-200 bg-white p-7 sm:p-10 lg:grid-cols-[20rem_1fr] lg:gap-12">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-tick-deep">
                Bas
              </p>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="text-[56px] font-semibold leading-none tracking-tight tabular-nums text-neutral-900">
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
                  "Rapporter, PDF, Excel och utskrift",
                  "Efterkalkyl och kundregister",
                  "Flera administratörer",
                  "Uppdateringar och drift",
                  "Support på svenska",
                ].map((item) => (
                  <li
                    key={item}
                    className="border-t border-neutral-100 py-1.5 text-[13px] text-neutral-600"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Tillvalet. Egen rad med tonad botten, så att det syns att det är
              något annat än basen och inte ett paket till. */}
          <div className="grid gap-6 bg-neutral-50 p-7 sm:p-10 lg:grid-cols-[20rem_1fr] lg:gap-12">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                Tillval
              </p>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-neutral-900">
                  {kr(payroll.month)}
                </span>
                <span className="text-[14px] text-neutral-500">
                  kr per månad och företag
                </span>
              </p>
              {payroll.year !== null && (
                <p className="mt-3 text-[13px] text-neutral-500">
                  eller {kr(payroll.year)} kr per år
                </p>
              )}
            </div>

            <div>
              <p className="text-[14px] font-medium text-neutral-900">
                {MODULES.PAYROLL.name}
              </p>
              <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-neutral-600">
                Arbetstidsschema, stämplade raster, flex, komp, frånvaro och
                tidrapport per anställd. Priset gäller hela företaget oavsett
                antal skärmar och anställda.
              </p>
            </div>
          </div>

          {/* Sista raden i priskortet: kundens egen summa. Styckpriserna står
              kvar ovanför — det är dem man ska kunna upprepa. */}
          <PriceCalculator pricing={pricing} payroll={payroll} />
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
    <section id="fragor" className="scroll-mt-16 bg-neutral-50">
      <div className={SHELL}>
        <SectionHead index="07" eyebrow="Frågor" title="Vanliga frågor" />

        {/* <details> ger utfällbara svar utan JavaScript. Fungerar även om
            något går fel, och går att söka i med webbläsarens egen funktion. */}
        <div className="mt-14 border-t border-neutral-200">
          {questions.map((item) => (
            <details key={item.q} className="group border-b border-neutral-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-neutral-400 transition-transform group-open:rotate-45 group-open:text-tick-deep"
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
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
 */
export function FinalCta({ pricing }: { pricing: ScreenPricing }) {
  return (
    <section className="relative overflow-hidden bg-tick">
      <Motif tone="onTick" className="-right-48 -top-64 h-[48rem] w-[48rem]" />

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
                className="rounded-lg border border-neutral-900/55 px-6 py-3.5 text-[15px] font-semibold text-neutral-900 transition-colors hover:border-neutral-900 hover:bg-neutral-900/5"
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
