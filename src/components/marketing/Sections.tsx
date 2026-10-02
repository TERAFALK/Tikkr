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
import type { ModulePricing, ScreenPricing } from "@/lib/stripe";
import { MODULES } from "@/lib/modules";
import Reveal from "./Reveal";

/**
 * SÄLJSIDANS AVSNITT.
 *
 * FORMGIVNINGEN ÄR ETT SPECIFIKATIONSBLAD, inte en produktsida i allmänhet.
 * Läsaren är en verkstadschef som köper verktyg efter vad de gör, och sidan är
 * satt därefter: numrerade avsnitt, hårfina linjer och siffror i tabellsiffror.
 * Svart, vitt och grått hela vägen; färg förekommer bara inuti produktbilderna,
 * där grönt betyder pågår och gult behöver granskas precis som i systemet.
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

export function Hero() {
  return (
    <section className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-14 sm:pb-24 sm:pt-20">
        <div className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
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
              En pekskärm i verkstaden och en panel på kontoret. Personalen
              registrerar tiden med ett tryck, den hamnar på rätt order och
              arbetsmoment, och underlaget kan skickas samma dag.
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
              Inget betalkort. Ingen bindningstid.
            </p>
          </div>

          {/* Stämplingsskärmen, levande. Den som tittar i tio sekunder ser
              någon stämpla in utan att läsa en rad text.

              Låg en period i en tecknad skärm på stativ. Den togs bort: en
              ritad hårdvara blir en teckning av en skärm, och det är
              gränssnittet som ska synas. */}
          <div
            className="animate-rise-soft"
            style={{ animationDelay: "300ms" }}
          >
            <Frame label="Stämplingsskärmen">
              <LiveKiosk />
            </Frame>
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
 * logotyper att visa.
 */
export function Facts() {
  const facts = [
    { value: "30 dagar", label: "provperiod utan betalkort" },
    { value: "0 kr", label: "i uppstart och installation" },
    { value: "Obegränsat", label: "antal anställda och ordrar" },
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
            <dt className="text-[22px] font-semibold tracking-tight text-neutral-900">
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
            <Reveal key={point.title} delay={index * 90} className="h-full">
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
    <section
      id="sa-funkar-det"
      className="border-b border-neutral-200 bg-white"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          index="02"
          eyebrow="I verkstaden"
          title="Från tryck på skärmen till färdigt underlag"
          intro="De två första stegen sker vid maskinen och kräver ingen inloggning."
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
/* 03 På kontoret                                                              */
/* -------------------------------------------------------------------------- */

export function AdminSection() {
  return (
    <section id="panelen" className="border-b border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          index="03"
          eyebrow="På kontoret"
          title="Överblick i realtid"
          intro="Registrerad tid finns i panelen i samma stund som den registreras."
        />

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
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
    <section id="underlag" className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          index="04"
          eyebrow="Dokumenten"
          title="Tre underlag, tre mottagare"
          intro="Tid som registrerats en gång blir underlag till kundens faktura, till er egen efterkalkyl och till lönen."
        />

        <div className="mt-14 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {docs.map((doc, index) => (
            /* h-full hela vägen ned: de tre pappersytorna blir lika höga även
               när en tabell har en rad mer, och rubrikerna under dem hamnar på
               samma linje. */
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
/* 05 Innehåll                                                                 */
/* -------------------------------------------------------------------------- */

interface Capability {
  term: string;
  body: string;
  /** Märks som tillval i listan. Priset står i prisavsnittet. */
  tillval?: boolean;
}

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
      className="border-b border-neutral-200 bg-neutral-50"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead index="05" eyebrow="Innehåll" title="Vad som ingår" />

        <div className="mt-14 grid gap-12 lg:grid-cols-3 lg:gap-10">
          {groups.map((group, index) => (
            <Reveal key={group.title} delay={index * 80}>
              <div>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                  {group.title}
                </h3>

                <dl className="mt-4">
                  {group.rows.map((row) => (
                    <div
                      key={row.term}
                      className="border-t border-neutral-200 py-4"
                    >
                      <dt className="flex items-center gap-2 text-[14px] font-medium text-neutral-900">
                        {row.term}
                        {row.tillval && (
                          <span className="rounded border border-neutral-300 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-neutral-500">
                            Tillval
                          </span>
                        )}
                      </dt>
                      <dd className="mt-1 text-[13px] leading-relaxed text-neutral-600">
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
    <section id="pris" className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHead
          index="06"
          eyebrow="Pris"
          title="Per skärm, inte per anställd"
          intro="Antalet anställda, ordrar och stämplingar påverkar inte priset."
        />

        <div className="mt-14 overflow-hidden rounded-lg border border-neutral-200">
          {/* Basen. Den stora siffran till vänster och innehållet till höger,
              som en rad i en prislista snarare än ett paketkort. */}
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
                <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[13px] text-neutral-700">
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
          <div className="grid gap-6 bg-neutral-50 p-6 sm:p-8 lg:grid-cols-[20rem_1fr] lg:gap-12">
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
                antal skärmar och anställda. Kan slås på och av, och
                registrerade uppgifter ligger kvar när tillvalet är avstängt.
              </p>
            </div>
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
      a: "En pekskärm eller surfplatta med webbläsare. Ingen installation krävs. Skärmen kopplas en gång med en sexsiffrig kod och kräver därefter ingen inloggning.",
    },
    {
      q: "Hur lång tid tar uppsättningen?",
      a: "Cirka femton minuter. Anställda, arbetsmoment och ordrar läggs upp i en guide, och skärmen kopplas genom att koden anges på den enhet som ska användas.",
    },
    {
      q: "Kan en anställd arbeta med två maskiner samtidigt?",
      a: "Ja. En anställd kan ha ett pågående jobb per arbetsmoment, men inte två på samma. Pågår två maskiner en timme registreras två maskintimmar, fördelade på respektive order.",
    },
    {
      q: "Vad händer om någon glömmer att stämpla ut?",
      a: "Posten stängs vid ett klockslag ni anger, exempelvis 18:00, och hamnar i granskningen. Den beräknade sluttiden är märkt som beräknad och rättas före fakturering.",
    },
    {
      q: "Vad händer vid avbrott i internetanslutningen?",
      a: "Skärmen tar emot registreringar som vanligt. De sparas lokalt och skickas när anslutningen återupprättats. Arbetstid som inte registrerats går inte att rekonstruera i efterhand.",
    },
    {
      q: "Kan Tikkr användas för löneunderlag?",
      a: `Ja, som tillval för ${kr(modules.PAYROLL.month)} kr per månad: arbetstidsschema, stämplade raster, flex, komp, frånvaro och tidrapport per anställd. Tikkr redovisar timmar. Lönearter, OB och övertidsersättning regleras i kollektivavtal och hanteras i lönesystemet.`,
    },
    {
      q: "Hur hanteras tid som inte ska faktureras?",
      a: "Städning, möten och underhåll registreras som improduktiv tid i ett eget register, skilt från ordrarna.",
    },
    {
      q: "Kan underlaget skickas vidare till vår kund?",
      a: "Ja. Underlaget innehåller er logotyp, ordernummer och kund som rubrik, samtliga stämplingar och en summa sist. Självkostnad och marginal redovisas enbart i efterkalkylen, som är märkt som internt underlag.",
    },
    {
      q: "Var lagras uppgifterna?",
      a: "På servrar i Sverige. Personuppgiftsbiträdesavtal ingår och kan läsas innan ni börjar. Uppgifterna om en anställd omfattar namn, valfritt anställningsnummer och registrerad tid, och kan exporteras eller raderas i panelen.",
    },
    {
      q: "Vad händer vid utebliven betalning?",
      a: "Stämplingsskärmarna fortsätter att fungera. Panelen och exporten låses, eftersom arbetstid som inte registrerats inte går att återskapa. Registrerad tid finns kvar och blir åtkomlig igen när fakturan är betald.",
    },
    {
      q: "Finns det någon bindningstid?",
      a: "Nej. Varken bindningstid eller uppsägningstid. Årsbetalning är ett frivilligt alternativ som ger rabatt.",
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
              börja registrera tid. Uppsättningen tar cirka femton minuter och
              kräver inga kortuppgifter.
            </p>
          </div>

          <div className="lg:justify-self-end">
            <div className="flex flex-wrap gap-3">
              {/* Grönt, inte vitt. Avsnittet ligger på Fjord, och Tick är
                  varumärkets accent på mörk yta. Det är sidans enda plats där
                  accenten bär en knapp, vilket är precis vad guiden menar med
                  att grönt aldrig är huvudfärg. */}
              <Link
                href="/registrera"
                className="rounded-md bg-tick px-5 py-3 text-sm font-semibold text-fjord transition-colors hover:bg-emerald-300"
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
