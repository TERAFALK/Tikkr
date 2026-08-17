import Link from "next/link";
import {
  IconClock,
  IconDevice,
  IconOrder,
  IconPeople,
  IconReport,
  IconShield,
} from "@/components/ui/icons";
import {
  AdminMockup,
  ExportMockup,
  OfflineMockup,
  OrderPickMockup,
  ReportMockup,
  ReviewMockup,
} from "./Mockups";
import LiveKiosk from "./LiveKiosk";
import type { ScreenPricing } from "@/lib/stripe";
import Reveal from "./Reveal";

/* -------------------------------------------------------------------------- */
/* Gemensamma byggstenar                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Rubriken som inleder varje avsnitt.
 *
 * Samma uppbyggnad hela vägen ned: en liten etikett som säger var man är, en
 * rubrik som säger vad avsnittet hävdar, och vid behov en mening som utvecklar.
 * En sida där varje avsnitt ser olika ut läses som flera sidor.
 */
function SectionHeading({
  eyebrow,
  title,
  body,
  centered,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-[13px] font-semibold uppercase tracking-wider text-blue-600">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
        {title}
      </h2>
      {body && (
        <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
          {body}
        </p>
      )}
    </div>
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 10.5 4 4 8-9" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-neutral-200 bg-white">
      {/* Rutnät i bakgrunden, urtonat mot kanterna. Ger djup åt ytan utan att
          konkurrera med texten — masken gör att det aldrig får en synlig kant
          där mönstret tar slut. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
      />

      {/* Mjukt ljus bakom rubriken.
          En gradient i en låda med bestämd höjd får en synlig kant där lådan
          tar slut. En suddad fläck har ingen kant att se. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-280px] h-[560px] w-[1100px] -translate-x-1/2 rounded-full bg-blue-500/[0.09] blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[15%] top-[-120px] h-[380px] w-[520px] rounded-full bg-emerald-400/[0.07] blur-[120px]"
      />

      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
            <span className="animate-breathe h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Utvecklat för svensk verkstadsindustri
          </span>

          <h1
            className="animate-rise mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl"
            style={{ animationDelay: "60ms" }}
          >
            Tidregistrering per order,
            <br className="hidden sm:block" /> direkt i verkstaden
          </h1>

          <p
            className="animate-rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            Personalen registrerar tid med ett tryck på en skärm i verkstaden.
            Tiden hamnar direkt på rätt order och arbetsmoment, utan blanketter
            och utan efterhandsrapportering.
          </p>

          <div
            className="animate-rise mt-8 flex flex-wrap justify-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Link
              href="/registrera"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Prova i 30 dagar
            </Link>
            <a
              href="#sa-funkar-det"
              className="rounded-lg border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Se hur det fungerar
            </a>
          </div>

          <p
            className="animate-rise mt-4 text-[13px] text-neutral-400"
            style={{ animationDelay: "240ms" }}
          >
            Inget betalkort krävs · Uppsättning på cirka 15 minuter · Ingen
            bindningstid
          </p>
        </div>

        {/* Produktbilderna. Kiosken ligger framför panelen, eftersom det är
            den anställda ser och den som avgör om systemet används. */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="animate-rise-soft" style={{ animationDelay: "300ms" }}>
            <AdminMockup />
          </div>

          <div
            className="animate-rise-soft absolute -bottom-10 -right-2 hidden w-64 sm:block lg:-right-10 lg:w-80"
            style={{ animationDelay: "480ms" }}
          >
            <div className="animate-drift">
              <LiveKiosk />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Kapabilitetsremsa                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Fyra påståenden direkt under hero.
 *
 * Ersätter den kundlogotyprad som annars brukar stå här. Vi har inga kunder
 * att visa upp ännu, och påhittade logotyper är det snabbaste sättet att
 * förlora förtroendet hos någon som känner branschen.
 */
export function Capabilities() {
  const items = [
    { title: "Ett tryck", body: "Ingen inloggning i verkstaden" },
    { title: "Utan nätverk", body: "Stämplingar köas och överförs" },
    { title: "Per order", body: "Underlag som PDF och Excel" },
    { title: "Utan bindningstid", body: "Månadsvis eller årsvis" },
  ];

  return (
    <section className="border-b border-neutral-200 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden bg-neutral-200 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.title} className="bg-white px-6 py-6">
            <p className="text-sm font-semibold text-neutral-900">
              {item.title}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Problemet                                                                   */
/* -------------------------------------------------------------------------- */

export function Problem() {
  const points = [
    {
      title: "Tiden skrivs upp i efterhand",
      body: "Vid veckans slut ska medarbetaren minnas vad som utfördes tidigare i veckan. Uppskattningar blir underlag för fakturering.",
    },
    {
      title: "Timmar som aldrig faktureras",
      body: "Arbete som inte hinner rapporteras faktureras inte. Bortfallet är svårt att upptäcka i efterhand.",
    },
    {
      title: "Ingen vet vad en order kostade",
      body: "Utan tid per order saknas underlag för att bedöma lönsamhet, vilket försvårar kommande offerter.",
    },
  ];

  return (
    <section className="border-b border-neutral-200 bg-neutral-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Problemet"
          title="Tid som inte registreras när arbetet utförs går inte att rekonstruera"
        />

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {points.map((point, index) => (
            // Korten tonas in efter varandra istället för samtidigt. Ögat
            // hinner då läsa i den ordning de är tänkta att läsas.
            <Reveal key={point.title} delay={index * 90}>
              <div className="h-full rounded-xl border border-neutral-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-neutral-900">
                  {point.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
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
/* Så fungerar det                                                             */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    number: 1,
    title: "Den anställde trycker på sitt namn",
    body: "Order och arbetsmoment väljs i två steg, med knappar stora nog att träffa med arbetshandskar. Vid byte av arbete stängs föregående post automatiskt, vilket säkerställer att samma tid aldrig registreras på två ordrar.",
    mockup: <OrderPickMockup />,
  },
  {
    number: 2,
    title: "Tiden räknas medan arbetet pågår",
    body: "Pågående arbete markeras på skärmen med förfluten tid. Vid nätverksavbrott lagras stämplingen lokalt och överförs när anslutningen återupprättas, med den tidpunkt registreringen faktiskt skedde.",
    mockup: <OfflineMockup />,
  },
  {
    number: 3,
    title: "Avvikelser markeras före fakturering",
    body: "Saknas utstämpling stängs posten vid ett klockslag ni själva anger och markeras för granskning. Systemet gissar aldrig tyst — den beräknade sluttiden är märkt som beräknad, både i panelen och i underlaget.",
    mockup: <ReviewMockup />,
  },
];

export function HowItWorks() {
  return (
    <section id="sa-funkar-det" className="border-b border-neutral-200 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Så fungerar det"
          title="Från tryck på skärmen till färdigt underlag"
          body="Tre steg, varav de två första sker i verkstaden utan att någon behöver logga in."
        />

        <div className="mt-14 space-y-16">
          {STEPS.map((step, index) => (
            <Reveal key={step.number}>
              <div className="grid items-center gap-10 lg:grid-cols-2">
                {/* Vartannat avsnitt speglas, så att blicken flyttas i sidled
                    på vägen ned istället för att falla rakt igenom. */}
                <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-[13px] font-semibold text-white">
                    {step.number}
                  </span>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-md text-[15px] leading-relaxed text-neutral-600">
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
/* Funktioner                                                                  */
/* -------------------------------------------------------------------------- */

export function Features() {
  const features = [
    {
      icon: <IconClock />,
      title: "Automatisk utstämpling",
      body: "Vid byte av arbete stängs föregående post automatiskt. Saknas utstämpling stängs posten vid ett klockslag ni själva anger, och markeras för granskning.",
    },
    {
      icon: <IconDevice />,
      title: "Fungerar utan nätverk",
      body: "Stämplingar lagras lokalt vid avbrott och överförs automatiskt. Registrerad tidpunkt är när stämplingen gjordes, inte när överföringen skedde.",
    },
    {
      icon: <IconReport />,
      title: "Underlag med er logotyp",
      body: "PDF avsedd att bifogas fakturan, med ordernummer och kund som rubrik, samtliga stämplingar och totalsumma. Excel finns för vidare bearbetning.",
    },
    {
      icon: <IconOrder />,
      title: "All tid hör till en order",
      body: "Varje registrerad minut är kopplad till en kundorder. Systemet innehåller inga interna konton för icke fakturerbar tid.",
    },
    {
      icon: <IconPeople />,
      title: "Ingen inloggning i verkstaden",
      body: "Skärmen kopplas en gång med en engångslänk. Personalen behöver inga inloggningsuppgifter, och behörigheten kan återkallas när som helst.",
    },
    {
      icon: <IconShield />,
      title: "Spårbart i efterhand",
      body: "Varje stämpling registrerar tidpunkt, skärm och IP-adress. Manuella ändringar markeras och kan därmed särskiljas från registrerade stämplingar.",
    },
  ];

  return (
    <section
      id="funktioner"
      className="border-b border-neutral-200 bg-neutral-50 py-20"
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Funktioner"
          title="Anpassat efter verkstadens arbetssätt"
        />

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 70}>
              <div className="group h-full rounded-xl border border-neutral-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-600">
                  {feature.icon}
                </span>
                <h3 className="mt-3.5 text-sm font-semibold text-neutral-900">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">
                  {feature.body}
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
/* Panelen                                                                     */
/* -------------------------------------------------------------------------- */

export function AdminSection() {
  const points = [
    "Pågående arbete i realtid, per anställd och order",
    "Rapporter filtrerade på datum, order, anställd och arbetsmoment",
    "Granskning av poster där utstämpling saknas",
    "Manuell registrering av tid i efterhand, tydligt märkt",
    "Flera administratörer med olika behörighet",
  ];

  return (
    <section className="border-b border-neutral-200 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Adminpanelen"
              title="Överblick i realtid"
              body="Registrerad tid är tillgänglig i panelen omedelbart. Ingen manuell insamling eller sammanställning krävs."
            />

            <ul className="mt-6 space-y-2.5">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <Check />
                  <span className="text-[13px] leading-relaxed text-neutral-700">
                    {point}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <ReportMockup />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Underlaget                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Avsnittet som säljer produkten till den som betalar för den.
 *
 * Kiosken avgör om systemet används, men underlaget är skälet att skaffa det.
 * Det förtjänar en egen plats i stället för en punkt i en lista.
 */
export function Documents() {
  const points = [
    "Ordernummer och kund som rubrik, er logotyp överst",
    "Samtliga stämplingar med anställd, arbetsmoment och timmar",
    "Totalsumma, och beräknade sluttider tydligt markerade",
    "Flera ordrar kan markeras och exporteras samlat",
  ];

  return (
    <section
      id="underlag"
      className="border-b border-neutral-200 bg-neutral-50 py-20"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="lg:order-2">
            <SectionHeading
              eyebrow="Underlaget"
              title="Ett dokument som går att skicka vidare"
              body="Underlag per order laddas ned som PDF eller Excel och är utformat för att bifogas fakturan till er kund."
            />

            <ul className="mt-6 space-y-2.5">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-2.5">
                  <Check />
                  <span className="text-[13px] leading-relaxed text-neutral-700">
                    {point}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap gap-2">
              {["order-2601.pdf", "order-2601.xlsx"].map((file) => (
                <span
                  key={file}
                  className="rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600"
                >
                  {file}
                </span>
              ))}
            </div>
          </div>

          <div className="lg:order-1">
            <ExportMockup className="mx-auto max-w-sm" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Pris                                                                        */
/* -------------------------------------------------------------------------- */

export function Pricing({ pricing }: { pricing: ScreenPricing }) {
  const included = [
    "Obegränsat antal anställda",
    "Obegränsat antal ordrar och arbetsmoment",
    "Rapporter, PDF och Excel-export",
    "Offline-stöd på stämplingsskärmarna",
    "Flera administratörer",
    "Support på svenska",
  ];

  return (
    <section id="pris" className="border-b border-neutral-200 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          centered
          eyebrow="Pris"
          title="Ett pris"
          body="Avgiften avser antalet licenser. En licens ger en stämplingsskärm. Antalet anställda påverkar inte priset, och ingen grundavgift tillkommer."
        />

        <div className="mx-auto mt-10 max-w-md">
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-200 bg-neutral-50/60 px-6 py-6 text-center">
              <p className="text-[13px] font-medium text-neutral-500">
                Per licens
              </p>
              <p className="mt-2 flex items-baseline justify-center gap-1.5">
                <span className="text-4xl font-semibold tracking-tight text-neutral-900">
                  {pricing.month.toLocaleString("sv-SE")}
                </span>
                <span className="text-sm text-neutral-500">kr / månad</span>
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                exklusive moms · ingen bindningstid
              </p>

              {pricing.year !== null && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {pricing.yearlyDiscountPercent !== null && (
                    <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      −{pricing.yearlyDiscountPercent} %
                    </span>
                  )}
                  {pricing.year.toLocaleString("sv-SE")} kr per år
                </p>
              )}
            </div>

            <ul className="space-y-2.5 px-6 py-6">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check />
                  <span className="text-[13px] text-neutral-700">{item}</span>
                </li>
              ))}
            </ul>

            <div className="border-t border-neutral-200 px-6 py-5">
              <Link
                href="/registrera"
                className="block rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Prova i 30 dagar
              </Link>
              <p className="mt-2.5 text-center text-xs text-neutral-400">
                Inget betalkort krävs. Provperioden övergår inte automatiskt i
                betalning.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Frågor                                                                      */
/* -------------------------------------------------------------------------- */

export function Faq() {
  const questions = [
    {
      q: "Vilken utrustning krävs i verkstaden?",
      a: "En surfplatta eller dator med pekskärm och webbläsare. Ingen installation krävs. Skärmen kopplas en gång med en länk och kräver därefter ingen inloggning.",
    },
    {
      q: "Vad händer vid nätverksavbrott?",
      a: "Stämplingen fungerar som vanligt. Registreringen lagras lokalt och överförs när anslutningen återupprättas, med den tidpunkt den faktiskt gjordes. Antalet väntande registreringar visas på skärmen.",
    },
    {
      q: "Vad händer om någon glömmer stämpla ut?",
      a: "Posten stängs vid ett klockslag ni själva anger, exempelvis 18:00, och markeras för granskning. Beräknade sluttider är alltid markerade som beräknade och kan korrigeras före fakturering.",
    },
    {
      q: "Går det att rätta en felaktig stämpling?",
      a: "Ja. Administratören kan korrigera tider och registrera stämplingar i efterhand. Samtliga manuella ändringar markeras och kan därmed särskiljas från registrerade stämplingar.",
    },
    {
      q: "Kan underlaget skickas vidare till vår kund?",
      a: "Ja. PDF-underlaget innehåller ordernummer och kundnamn som rubrik, samtliga stämplingar och totalsumma, med er logotyp överst. Excel finns för vidare bearbetning.",
    },
    {
      q: "Kan Tikkr användas för löneunderlag?",
      a: "Nej. Tikkr avser tid som ska faktureras kund och innehåller varken frånvaro, övertidsregler eller lönearter. Avgränsningen är medveten och håller systemet enkelt att använda i verkstaden.",
    },
    {
      q: "Hur hanteras personuppgifter?",
      a: "Uppgifterna om en anställd begränsas till namn och registrerad tid. Administratören kan när som helst exportera eller radera en enskild anställds uppgifter, i enlighet med dataskyddsförordningen.",
    },
    {
      q: "Vad händer med registrerad tid om prenumerationen avslutas?",
      a: "Tiden finns kvar. Stämplingsskärmarna fortsätter dessutom att fungera vid utebliven betalning — det är rapporter och export som låses, eftersom oregistrerad arbetstid inte går att rekonstruera i efterhand.",
    },
  ];

  return (
    <section
      id="fragor"
      className="border-b border-neutral-200 bg-neutral-50 py-20"
    >
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeading centered eyebrow="Frågor" title="Vanliga frågor" />

        <div className="mt-10 divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {questions.map((item) => (
            // <details> ger utfällbara svar utan JavaScript. Fungerar även om
            // något går fel, och går att söka i med webbläsarens egen funktion.
            <details key={item.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-neutral-900">
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
                    strokeWidth={1.75}
                    strokeLinecap="round"
                  >
                    <path d="M10 4v12M4 10h12" />
                  </svg>
                </span>
              </summary>
              <p className="mt-2.5 max-w-2xl text-[13px] leading-relaxed text-neutral-600">
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
    <section className="relative overflow-hidden bg-neutral-900 py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-blue-500/20 blur-[130px]"
      />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Utvärdera systemet i er egen verksamhet
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-300">
          Uppsättningen tar omkring 15 minuter: lägg upp anställda, ordrar och
          arbetsmoment, koppla skärmen och börja registrera tid.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/registrera"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100"
          >
            Skapa arbetsyta
          </Link>
          <Link
            href="/admin/login"
            className="rounded-lg border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
          >
            Logga in
          </Link>
        </div>

        <p className="mt-4 text-[13px] text-neutral-400">
          30 dagars provperiod · inget betalkort · därefter{" "}
          {pricing.month.toLocaleString("sv-SE")} kr per licens och månad
        </p>
      </div>
    </section>
  );
}
