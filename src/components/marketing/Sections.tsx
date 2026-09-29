import Link from "next/link";
import {
  AdminMockup,
  CalcMockup,
  ExportMockup,
  OrderPickMockup,
  ReportMockup,
  ReviewMockup,
  RunningMockup,
  TimesheetMockup,
} from "./Mockups";
import LiveKiosk from "./LiveKiosk";
import type { ModulePricing, ScreenPricing } from "@/lib/stripe";
import { MODULES } from "@/lib/modules";
import Reveal from "./Reveal";

/**
 * SÄLJSIDANS AVSNITT.
 *
 * FORMGIVNINGEN ÄR ETT SPECIFIKATIONSBLAD, inte en produktsida i allmänhet.
 * Läsaren är en verkstadschef som köper verktyg efter vad de gör, och sidan är
 * satt därefter: numrerade avsnitt, hårfina linjer och siffror i tabellsiffror.
 * Svart, vitt och grått hela vägen; färg förekommer bara INUTI produktbilderna,
 * där grönt betyder pågår och gult behöver granskas precis som i systemet.
 *
 * Det som medvetet INTE finns här, och varför:
 *
 *  - Gradienter i rubriktext och suddade färgfläckar bakom innehållet. De
 *    säger ingenting om produkten och ser likadana ut på varje ny sajt.
 *  - Rutnät av sex likadana kort med varsin ikon. En ikon som föreställer
 *    "säkerhet" bär mindre än ordet säkerhet.
 *  - Kundcitat och logotyper. Vi har en pilotkund, och påhittade referenser
 *    är det snabbaste sättet att förlora någon som känner branschen.
 *
 * Det som får bära sidan i stället: produktens egna ytor. Bilderna är byggda
 * i kod ur samma färger och siffror som systemet använder, se Mockups.tsx.
 */

/* -------------------------------------------------------------------------- */
/* Gemensamma byggstenar                                                       */
/* -------------------------------------------------------------------------- */

/** Belopp i svensk form. Samma formatering som i produkten. */
function kr(amount: number): string {
  return amount.toLocaleString("sv-SE");
}

/**
 * Avsnittets huvud.
 *
 * Nummer, linje, etikett. Sedan rubriken och högst ett par rader text. Samma
 * uppbyggnad hela vägen ned, så att sidan läses som ett dokument och inte som
 * en trave olika sidor staplade på varandra.
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
    <div className="max-w-2xl">
      <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em]">
        <span className={onDark ? "text-neutral-500" : "text-neutral-400"}>
          {index}
        </span>
        <span
          aria-hidden="true"
          className={`h-px w-8 ${onDark ? "bg-neutral-700" : "bg-neutral-300"}`}
        />
        <span className={onDark ? "text-neutral-300" : "text-neutral-500"}>
          {eyebrow}
        </span>
      </p>

      <h2
        className={`mt-5 text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[36px] ${
          onDark ? "text-white" : "text-neutral-900"
        }`}
      >
        {title}
      </h2>

      {intro && (
        <p
          className={`mt-4 max-w-xl text-[15px] leading-relaxed ${
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
 * En linje över varje rad i stället för en bock framför den. Bockar läser ögat
 * som reklam; linjer läser det som en specifikation, och det är vad det är.
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

export function Hero({ pricing }: { pricing: ScreenPricing }) {
  return (
    <section className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pb-20 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <p className="animate-rise font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Stämplingssystem för verkstad
            </p>

            <h1
              className="animate-rise mt-6 text-[40px] font-semibold leading-[1.02] tracking-[-0.02em] text-neutral-900 sm:text-[56px]"
              style={{ animationDelay: "60ms" }}
            >
              Rätt tid på rätt order.
            </h1>

            <p
              className="animate-rise mt-6 max-w-lg text-[17px] leading-relaxed text-neutral-600"
              style={{ animationDelay: "120ms" }}
            >
              En skärm på väggen i verkstaden och en panel på kontoret.
              Personalen trycker en gång, tiden hamnar på ordern och
              arbetsmomentet, och underlaget går att skicka samma dag.
            </p>

            <div
              className="animate-rise mt-9 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "180ms" }}
            >
              <Link
                href="/registrera"
                className="rounded-md bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
              >
                Prova i 30 dagar
              </Link>
              <a
                href="#sa-funkar-det"
                className="rounded-md px-5 py-3 text-sm font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900 hover:decoration-neutral-900"
              >
                Se hur det fungerar
              </a>
            </div>

            <p
              className="animate-rise mt-6 text-[13px] text-neutral-500"
              style={{ animationDelay: "240ms" }}
            >
              Inget betalkort. Ingen bindningstid. {kr(pricing.month)} kr per
              skärm och månad när provperioden tar slut.
            </p>
          </div>

          {/* Den levande kioskbilden. Den som tittar i tio sekunder har sett
              vad produkten gör utan att läsa en rad text. */}
          <div
            className="animate-rise-soft"
            style={{ animationDelay: "300ms" }}
          >
            <LiveKiosk />
          </div>
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
 * logotyper att visa, och de här siffrorna säger mer ändå: de svarar på det
 * första en köpare undrar innan hen bestämmer sig för att läsa vidare.
 */
export function Facts({ pricing }: { pricing: ScreenPricing }) {
  const facts = [
    { value: `${kr(pricing.month)} kr`, label: "per skärm och månad" },
    { value: "30 dagar", label: "provperiod utan betalkort" },
    { value: "0 kr", label: "i uppstart och installation" },
    { value: "Sverige", label: "servrar och support" },
  ];

  return (
    <section className="border-b border-neutral-200 bg-white">
      {/* Hårlinjerna ritas med gap-px mot en grå botten i stället för med
          kantlinjer på varje ruta. Kantlinjer på ett rutnät som byter antal
          kolumner ger alltid en linje för mycket någonstans. */}
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-neutral-200 lg:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="bg-white px-6 py-7">
            <dt className="text-[22px] font-semibold tracking-tight tabular-nums text-neutral-900">
              {fact.value}
            </dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-neutral-500">
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
 * Sidans enda mörka avsnitt.
 *
 * Det är också det enda som beskriver ett problem i stället för en lösning.
 * Brytningen gör att läsaren registrerar perspektivbytet i stället för att
 * skumma vidare genom ännu ett vitt fält.
 */
export function Problem() {
  const points = [
    {
      title: "Tiden skrivs upp i efterhand",
      body: "På fredagen ska någon minnas vad som gjordes på tisdagen. Uppskattningen blir underlag för en faktura.",
    },
    {
      title: "Timmar som aldrig faktureras",
      body: "Arbete som inte hinner rapporteras faktureras inte. Bortfallet syns aldrig, eftersom ingen vet vad som saknas.",
    },
    {
      title: "Ingen vet vad ordern kostade",
      body: "Utan tid per order finns inget att jämföra offerten med. Nästa pris sätts på en känsla.",
    },
  ];

  return (
    <section className="border-b border-neutral-800 bg-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          onDark
          index="01"
          eyebrow="Problemet"
          title="Tid som inte registreras när arbetet utförs går inte att rekonstruera"
        />

        <div className="mt-14 grid gap-px overflow-hidden rounded-lg bg-neutral-800 sm:grid-cols-3">
          {points.map((point, index) => (
            <Reveal key={point.title} delay={index * 90}>
              <div className="h-full bg-neutral-900 p-6">
                <h3 className="text-[15px] font-semibold text-white">
                  {point.title}
                </h3>
                <p className="mt-3 text-[13px] leading-relaxed text-neutral-400">
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
/* 02 Så fungerar det                                                          */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    number: "1",
    title: "Namn, order, moment",
    body: "Tre tryck, med knappar stora nog att träffa med arbetshandskar. Den som har ordernumret på ritningen slår in det på en knappsats i stället. Saknas ordern går den att lägga upp direkt vid skärmen och märks då för kontoret.",
    mockup: <OrderPickMockup />,
  },
  {
    number: "2",
    title: "Tiden räknas medan arbetet pågår",
    body: "Vem som arbetar, på vad och sedan när syns på skärmen och i panelen samtidigt. En operatör som kör två maskiner stämplar in på båda, och båda ordrarna får sin timme. Försvinner nätet sparas trycken lokalt och skickas när det kommer tillbaka.",
    mockup: <RunningMockup />,
  },
  {
    number: "3",
    title: "Avvikelser märks före fakturering",
    body: "Glömd utstämpling stängs vid ett klockslag ni själva anger och hamnar i granskningen. En beräknad sluttid är alltid märkt som beräknad, både i panelen och i underlaget, och ingen tid fylls i tyst.",
    mockup: <ReviewMockup />,
  },
];

export function HowItWorks() {
  return (
    <section
      id="sa-funkar-det"
      className="border-b border-neutral-200 bg-white"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          index="02"
          eyebrow="I verkstaden"
          title="Från tryck på skärmen till färdigt underlag"
          intro="De två första stegen sker vid maskinen, utan inloggning och utan att någon skriver något."
        />

        <div className="mt-16 space-y-16">
          {STEPS.map((step, index) => (
            <Reveal key={step.number}>
              <div className="grid items-center gap-8 border-t border-neutral-200 pt-10 lg:grid-cols-2 lg:gap-16">
                {/* Vartannat avsnitt speglas, så att blicken flyttas i sidled
                    på vägen ned i stället för att falla rakt igenom. */}
                <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                  <p className="font-mono text-[11px] tracking-[0.18em] text-neutral-400">
                    STEG {step.number}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-4 max-w-md text-[15px] leading-relaxed text-neutral-600">
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
/* 03 Panelen                                                                  */
/* -------------------------------------------------------------------------- */

export function AdminSection() {
  return (
    <section id="panelen" className="border-b border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          index="03"
          eyebrow="På kontoret"
          title="Läget i verkstaden, utan att någon behöver fråga"
          intro="Registrerad tid finns i panelen i samma stund som knappen trycks. Ingen insamling, ingen sammanställning på fredagen."
        />

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <dl>
            <SpecRow term="Rapporter">
              Filtrera på period, order, kund, anställd och arbetsmoment. Ta ut
              som PDF eller Excel, eller skriv ut direkt.
            </SpecRow>
            <SpecRow term="Granskning">
              Allt som kräver en åtgärd på ett ställe: beräknade sluttider och
              ordrar som lagts upp vid skärmen och behöver kompletteras.
            </SpecRow>
            <SpecRow term="Ordrar och kunder">
              Kunden bär påslag, rabatt och adressen på underlaget. Ordern kan
              ha eget påslag eller ett avtalat fast pris.
            </SpecRow>
            <SpecRow term="Beräknad tid">
              Lägg en beräkning per arbetsmoment och se utfallet mot den medan
              jobbet pågår.
            </SpecRow>
            <SpecRow term="Rättelser">
              Tider går att ändra och skriva in i efterhand. Ändringen märks och
              går att skilja från ett riktigt tryck.
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

/**
 * Tre dokument, tre mottagare.
 *
 * Avsnittet finns för att det är här produkten skiljer sig mest från en vanlig
 * stämpelklocka, och för att gränsen mellan dokumenten är en av de få saker i
 * systemet som aldrig får suddas ut. Kundens papper innehåller inga
 * självkostnader; det interna gör det; lönens räknar samma timme på ett annat
 * sätt.
 */
export function Documents({ modules }: { modules: ModulePricing }) {
  const docs = [
    {
      kicker: "Till kunden",
      title: "Underlag per order",
      body: "PDF att bifoga fakturan, med er logotyp, ordernummer och kund som rubrik, varje stämpling och en summa sist. Samma innehåll som Excel. Belopp följer med bara när ni kryssar i det.",
      mockup: <ExportMockup className="h-full" />,
    },
    {
      kicker: "Internt",
      title: "Efterkalkyl",
      body: "Vad jobbet kostade och vad det gav. Timkostnaden är personens sats plus maskinens, kopierad till stämplingen när den gjordes, så en prishöjning inte ändrar en kalkyl som redan fakturerats.",
      mockup: <CalcMockup className="h-full" />,
    },
    {
      kicker: "Till lönen",
      title: "Tidrapport per anställd",
      body: `Planerad tid mot närvaro, med flex, komp och frånvaro. Ett tillval för ${kr(
        modules.PAYROLL.month
      )} kr i månaden, och ett annat dokument än de två andra: samma timme räknas olika.`,
      mockup: <TimesheetMockup className="h-full" />,
    },
  ];

  return (
    <section id="underlag" className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          index="04"
          eyebrow="Dokumenten"
          title="Tre underlag, tre mottagare"
          intro="Kör en operatör två maskiner fyra timmar är det åtta maskintimmar att fakturera, men fyra timmar på jobbet. Därför räknas samma timme olika i olika dokument, och därför delar de aldrig kod."
        />

        <div className="mt-14 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {docs.map((doc, index) => (
            /* h-full hela vägen ned: de tre pappersytorna blir lika höga
               även när en tabell har en rad mer, och rubrikerna under dem
               hamnar på samma linje. Utan det står de tre bildtexterna på
               tre olika höjder, vilket är det enda i avsnittet ögat
               fastnar på. */
            <Reveal key={doc.title} delay={index * 90} className="h-full">
              <div className="flex h-full flex-col">
                <div className="flex-1">{doc.mockup}</div>

                <div className="mt-6 border-t border-neutral-200 pt-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                    {doc.kicker}
                  </p>
                  <h3 className="mt-2 text-[17px] font-semibold tracking-tight text-neutral-900">
                    {doc.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
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
/* 05 Allt som ingår                                                           */
/* -------------------------------------------------------------------------- */

export function Capabilities() {
  const groups = [
    {
      title: "I verkstaden",
      rows: [
        [
          "Ett tryck",
          "Ingen inloggning, ingen PIN. Namn, order, moment och tillbaka till jobbet.",
        ],
        [
          "Flera maskiner",
          "En person kan ha ett pågående jobb per arbetsmoment. Aldrig två på samma maskin.",
        ],
        [
          "Automatisk utstämpling",
          "Vid byte av jobb på samma maskin, och vid ett klockslag ni anger i slutet av dagen.",
        ],
        [
          "Fungerar utan nät",
          "Trycken sparas i skärmen och skickas när uppkopplingen är tillbaka.",
        ],
        [
          "Improduktiv tid",
          "Städning, möten och underhåll registreras i ett eget register och når aldrig en faktura.",
        ],
      ],
    },
    {
      title: "På kontoret",
      rows: [
        [
          "Rapporter och export",
          "PDF, Excel och utskrift. Flera markerade ordrar ger en fil per order.",
        ],
        [
          "Efterkalkyl",
          "Självkostnad, påslag, rabatt och pris per order. Internt märkt på varje sida.",
        ],
        [
          "Kundregister",
          "Påslag och rabatt per kund, adress på underlaget, och all tid samlad per kund.",
        ],
        [
          "Flera administratörer",
          "Inbjudan per e-post. Alla ändringar är spårbara till ett konto.",
        ],
        [
          "Löneunderlag",
          "Schema, stämplade raster, flex, komp och frånvaro. Tillval, se priset nedan.",
        ],
      ],
    },
    {
      title: "Drift och säkerhet",
      rows: [
        [
          "Svensk drift",
          "Servrar i Sverige. Personuppgiftsbiträdesavtal ingår och finns att läsa innan ni börjar.",
        ],
        [
          "Spårbarhet",
          "Varje stämpling bär tidpunkt, skärm och IP. Manuella ändringar märks som manuella.",
        ],
        [
          "Dataskydd",
          "Export och radering av en enskild anställds uppgifter finns i panelen.",
        ],
        [
          "Ingen installation",
          "Skärmen är en surfplatta eller dator med webbläsare. Panelen nås som vilken sida som helst.",
        ],
        [
          "Uppdateringar ingår",
          "Nya funktioner kommer utan att någon behöver installera något.",
        ],
      ],
    },
  ];

  return (
    <section
      id="funktioner"
      className="border-b border-neutral-200 bg-neutral-50"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          index="05"
          eyebrow="Innehåll"
          title="Vad ni får"
          intro="Allt nedan ingår i grundpriset, utom löneunderlaget som är ett tillval."
        />

        <div className="mt-14 grid gap-12 lg:grid-cols-3 lg:gap-10">
          {groups.map((group, index) => (
            <Reveal key={group.title} delay={index * 80}>
              <div>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  {group.title}
                </h3>

                <dl className="mt-4">
                  {group.rows.map(([term, body]) => (
                    <div key={term} className="border-t border-neutral-200 py-4">
                      <dt className="text-[14px] font-medium text-neutral-900">
                        {term}
                      </dt>
                      <dd className="mt-1 text-[13px] leading-relaxed text-neutral-600">
                        {body}
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
 * Två rader och en uträkning. Ingen jämförelsetabell med tre kolumner där den
 * mittersta är förvald: Tikkr har ett pris per skärm och ett tillval, och att
 * rita upp det som ett paketval vore att låtsas att det finns ett beslut att
 * fatta som inte finns.
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

  // Räkneexempel med tre skärmar. Tre är vanligt i en verkstad som har en
  // skärm vid porten och två ute i produktionen, och exemplet svarar på den
  // fråga priset i sig inte gör: vad landar fakturan på?
  const screens = 3;
  const example = screens * pricing.month + payroll.month;

  return (
    <section id="pris" className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          index="06"
          eyebrow="Pris"
          title="Per skärm, inte per anställd"
          intro="Antalet anställda, ordrar och stämplingar påverkar inte priset. Skärmarna följer verkstadens storlek av sig själva, eftersom folk annars köar vid den enda."
        />

        <div className="mt-14 overflow-hidden rounded-lg border border-neutral-200">
          {/* Basen. Den stora siffran ligger till vänster och innehållet till
              höger, som en rad i en prislista snarare än ett paketkort. */}
          <div className="grid gap-8 border-b border-neutral-200 bg-white p-6 sm:p-8 lg:grid-cols-[20rem_1fr] lg:gap-12">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Bas
              </p>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="text-[44px] font-semibold leading-none tracking-tight tabular-nums text-neutral-900">
                  {kr(pricing.month)}
                </span>
                <span className="text-[15px] text-neutral-500">
                  kr per skärm och månad
                </span>
              </p>
              <p className="mt-2 text-[13px] text-neutral-500">
                Exklusive moms. Ingen bindningstid.
              </p>

              {pricing.year !== null && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[13px] text-neutral-700">
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
          <div className="grid gap-6 border-b border-neutral-200 bg-neutral-50 p-6 sm:p-8 lg:grid-cols-[20rem_1fr] lg:gap-12">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Tillval
              </p>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-neutral-900">
                  {kr(payroll.month)}
                </span>
                <span className="text-[14px] text-neutral-500">
                  kr per månad och företag
                </span>
              </p>
              {payroll.year !== null && (
                <p className="mt-2 text-[13px] text-neutral-500">
                  eller {kr(payroll.year)} kr per år
                </p>
              )}
            </div>

            <div>
              <p className="text-[14px] font-medium text-neutral-900">
                {MODULES.PAYROLL.name}
              </p>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-neutral-600">
                Arbetstidsschema, stämplade raster, flex, komp, frånvaro och
                tidrapport per anställd. Priset gäller hela företaget oavsett
                antal skärmar och anställda. Slås på och av när ni vill, och
                era uppgifter ligger kvar när det är avstängt.
              </p>
            </div>
          </div>

          {/* Räkneexemplet. Den fråga priset i sig inte besvarar. */}
          <div className="flex flex-wrap items-baseline justify-between gap-4 bg-white px-6 py-5 sm:px-8">
            <p className="text-[13px] text-neutral-600">
              Tre skärmar med löneunderlag: {screens} × {kr(pricing.month)} +{" "}
              {kr(payroll.month)}
            </p>
            <p className="text-[15px] font-semibold tabular-nums text-neutral-900">
              {kr(example)} kr per månad
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/registrera"
            className="rounded-md bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            Prova i 30 dagar
          </Link>
          <p className="text-[13px] text-neutral-500">
            Inget betalkort. Provperioden övergår inte i betalning av sig själv.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 07 Frågor                                                                   */
/* -------------------------------------------------------------------------- */

export function Faq({ modules }: { modules: ModulePricing }) {
  const questions = [
    {
      q: "Vilken utrustning krävs i verkstaden?",
      a: "En surfplatta eller dator med pekskärm och webbläsare. Ingen installation. Skärmen kopplas en gång med en sexsiffrig kod och kräver därefter ingen inloggning.",
    },
    {
      q: "Hur lång tid tar uppsättningen?",
      a: "Omkring en kvart. Anställda, arbetsmoment och ordrar läggs upp i en guide, och skärmen kopplas genom att koden knappas in på den enhet som ska användas.",
    },
    {
      q: "Kan en person arbeta med två maskiner samtidigt?",
      a: "Ja. En anställd kan ha ett pågående jobb per arbetsmoment, men aldrig två på samma. Går två maskiner en timme är det två maskintimmar, och båda ordrarna får sin.",
    },
    {
      q: "Vad händer om någon glömmer stämpla ut?",
      a: "Posten stängs vid ett klockslag ni själva anger, exempelvis 18:00, och hamnar i granskningen. Den beräknade sluttiden är märkt som beräknad och rättas innan fakturering.",
    },
    {
      q: "Vad händer om nätet försvinner?",
      a: "Skärmen fortsätter ta emot tryck. De sparas lokalt och skickas när uppkopplingen är tillbaka. Arbetstid som inte registrerats går inte att rekonstruera, så stämplingen får aldrig vara det som slutar fungera.",
    },
    {
      q: "Kan Tikkr användas för löneunderlag?",
      a: `Ja, som tillval för ${kr(modules.PAYROLL.month)} kr i månaden: arbetstidsschema, stämplade raster, flex, komp, frånvaro och tidrapport per anställd. Tikkr räknar timmar, inte pengar. Lönearter, OB och övertidsersättning hör till kollektivavtalet och stannar i lönesystemet.`,
    },
    {
      q: "Hur hanteras tid som inte ska faktureras?",
      a: "Städning, möten och underhåll registreras som improduktiv tid i ett eget register. Den tiden når aldrig ett fakturaunderlag, men den göms inte heller i närmaste order.",
    },
    {
      q: "Kan underlaget skickas vidare till vår kund?",
      a: "Ja. PDF:en har er logotyp, ordernummer och kund som rubrik, varje stämpling och en summa sist. Självkostnad och marginal finns inte i det dokumentet; de står i efterkalkylen, som är internt märkt.",
    },
    {
      q: "Var lagras uppgifterna?",
      a: "På servrar i Sverige. Personuppgiftsbiträdesavtal ingår och går att läsa innan ni börjar. Uppgifterna om en anställd begränsas till namn, valfritt anställningsnummer och registrerad tid, och går att exportera eller radera ur panelen.",
    },
    {
      q: "Vad händer om vi slutar betala?",
      a: "Stämplingsskärmarna fortsätter fungera. Det är panelen och exporten som låses, eftersom oregistrerad arbetstid inte går att få tillbaka. Tiden finns kvar och blir åtkomlig igen när fakturan är betald.",
    },
    {
      q: "Är vi bundna?",
      a: "Nej. Ingen bindningstid och ingen uppsägningstid. Årsbetalning är ett frivilligt alternativ som ger rabatt, inte en bindning.",
    },
  ];

  return (
    <section id="fragor" className="border-b border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead index="07" eyebrow="Frågor" title="Vanliga frågor" />

        {/* <details> ger utfällbara svar utan JavaScript. Fungerar även om
            något går fel, och går att söka i med webbläsarens egen funktion. */}
        <div className="mt-12 border-t border-neutral-200">
          {questions.map((item) => (
            <details key={item.q} className="group border-b border-neutral-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15px] font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-neutral-400 transition-transform group-open:rotate-45"
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

export function FinalCta({ pricing }: { pricing: ScreenPricing }) {
  return (
    <section className="bg-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <div className="grid items-end gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[28px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[36px]">
              Prova i er egen verkstad
            </h2>
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-neutral-400">
              Lägg upp anställda, arbetsmoment och ordrar, koppla skärmen och
              börja registrera tid. Det tar omkring en kvart, och ni behöver
              inte lämna några kortuppgifter för att komma igång.
            </p>
          </div>

          <div className="lg:justify-self-end">
            <div className="flex flex-wrap gap-3">
              <Link
                href="/registrera"
                className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-neutral-900 transition-colors hover:bg-neutral-200"
              >
                Skapa arbetsyta
              </Link>
              <Link
                href="/admin/login"
                className="rounded-md border border-neutral-700 px-5 py-3 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
              >
                Logga in
              </Link>
            </div>

            <p className="mt-5 text-[13px] text-neutral-500">
              30 dagar utan betalkort, därefter {kr(pricing.month)} kr per skärm
              och månad.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
