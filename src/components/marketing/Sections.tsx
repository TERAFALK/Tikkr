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
  OrderPickMockup,
  ReportMockup,
  ReviewMockup,
  RunningMockup,
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
 * Samma uppbyggnad hela vägen ned: en etikett som säger var man är, en rubrik
 * som säger vad avsnittet hävdar, och vid behov en mening som utvecklar. En
 * sida där varje avsnitt ser olika ut läses som flera sidor.
 */
function SectionHeading({
  eyebrow,
  title,
  body,
  centered,
  onDark,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  centered?: boolean;
  onDark?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p
        className={`inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] ${
          onDark ? "text-blue-300" : "text-blue-600"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-px w-6 ${onDark ? "bg-blue-300/60" : "bg-blue-600/40"}`}
        />
        {eyebrow}
      </p>

      <h2
        className={`mt-4 text-[26px] font-semibold leading-tight tracking-tight sm:text-[34px] ${
          onDark ? "text-white" : "text-neutral-900"
        }`}
      >
        {title}
      </h2>

      {body && (
        <p
          className={`mt-4 text-[15px] leading-relaxed ${
            onDark ? "text-neutral-300" : "text-neutral-600"
          }`}
        >
          {body}
        </p>
      )}
    </div>
  );
}

function Check() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-inset ring-emerald-200"
    >
      <svg
        viewBox="0 0 20 20"
        className="h-3 w-3 text-emerald-600"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4 10.5 4 4 8-9" />
      </svg>
    </span>
  );
}

/** Punktlista med bock. Används i tre avsnitt och ska se likadan ut i alla. */
function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-7 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <Check />
          <span className="text-[14px] leading-relaxed text-neutral-700">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-neutral-200 bg-white">
      {/* Rutnät i bakgrunden, urtonat mot kanterna. Ger djup åt ytan utan att
          konkurrera med texten. Masken gör att mönstret aldrig får en synlig
          kant där det tar slut. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.045)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,black,transparent)]"
      />

      {/* Mjukt ljus bakom rubriken. En gradient i en låda med bestämd höjd får
          en synlig kant där lådan tar slut. En suddad fläck har ingen kant. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-300px] h-[600px] w-[1150px] -translate-x-1/2 rounded-full bg-blue-500/[0.10] blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[12%] top-[-140px] h-[400px] w-[540px] rounded-full bg-emerald-400/[0.07] blur-[130px]"
      />

      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur">
            <span className="animate-breathe h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Byggt för svensk verkstadsindustri
          </span>

          <h1
            className="animate-rise mt-7 text-[40px] font-semibold leading-[1.05] tracking-tight text-neutral-900 sm:text-6xl"
            style={{ animationDelay: "60ms" }}
          >
            Tidregistrering per order,
            <br className="hidden sm:block" />{" "}
            <span className="bg-gradient-to-br from-blue-600 to-blue-500 bg-clip-text text-transparent">
              direkt i verkstaden
            </span>
          </h1>

          <p
            className="animate-rise mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-neutral-600 sm:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            Personalen trycker en gång på en skärm. Tiden hamnar på rätt order
            och arbetsmoment, utan blanketter och utan efterhandsrapportering.
          </p>

          <div
            className="animate-rise mt-9 flex flex-wrap justify-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Link
              href="/registrera"
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-all hover:-translate-y-px hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/25"
            >
              Prova i 30 dagar
            </Link>
            <a
              href="#sa-funkar-det"
              className="rounded-lg border border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Se hur det fungerar
            </a>
          </div>

          <p
            className="animate-rise mt-5 text-[13px] text-neutral-400"
            style={{ animationDelay: "240ms" }}
          >
            Inget betalkort · Uppsättning på en kvart · Ingen bindningstid
          </p>
        </div>

        {/* Produktbilderna. Kiosken ligger framför panelen, eftersom det är den
            anställda ser och den som avgör om systemet används. */}
        <div className="relative mx-auto mt-20 max-w-4xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-10 -bottom-6 top-10 rounded-[2rem] bg-neutral-900/[0.05] blur-2xl"
          />

          <div
            className="animate-rise-soft relative"
            style={{ animationDelay: "300ms" }}
          >
            <AdminMockup />
          </div>

          <div
            className="animate-rise-soft absolute -bottom-12 -right-2 hidden w-64 sm:block lg:-right-12 lg:w-80"
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
 * Ersätter den kundlogotyprad som annars brukar stå här. Vi har inga kunder att
 * visa upp ännu, och påhittade logotyper är det snabbaste sättet att förlora
 * förtroendet hos någon som känner branschen.
 */
export function Capabilities() {
  const items = [
    { title: "Ett tryck", body: "Ingen inloggning i verkstaden" },
    { title: "Automatisk utstämpling", body: "Vid jobbyte och dagens slut" },
    { title: "Per order", body: "Underlag som PDF och Excel" },
    { title: "Ingen bindningstid", body: "Månadsvis eller årsvis" },
  ];

  return (
    <section className="border-b border-neutral-200 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden bg-neutral-200 lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.title}
            className="bg-white px-6 py-7 transition-colors hover:bg-neutral-50"
          >
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

/**
 * Avsnittet ligger på mörk botten.
 *
 * Det är sidans enda avsnitt som beskriver ett problem i stället för en
 * lösning, och en tydlig brytning gör att läsaren registrerar bytet av
 * perspektiv i stället för att skumma vidare genom ännu ett vitt fält.
 */
export function Problem() {
  const points = [
    {
      title: "Tiden skrivs upp i efterhand",
      body: "Vid veckans slut ska någon minnas vad som gjordes på tisdagen. Uppskattningar blir underlag för fakturering.",
    },
    {
      title: "Timmar som aldrig faktureras",
      body: "Arbete som inte hinner rapporteras faktureras inte. Bortfallet syns aldrig, eftersom ingen vet vad som saknas.",
    },
    {
      title: "Ingen vet vad en order kostade",
      body: "Utan tid per order saknas underlag för att bedöma lönsamhet. Nästa offert bygger på en känsla.",
    },
  ];

  return (
    <section className="relative overflow-hidden border-b border-neutral-800 bg-neutral-900 py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[400px] w-[900px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[130px]"
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <SectionHeading
          onDark
          eyebrow="Problemet"
          title="Tid som inte registreras när arbetet utförs går inte att rekonstruera"
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {points.map((point, index) => (
            // Korten tonas in efter varandra i stället för samtidigt. Ögat
            // hinner då läsa i den ordning de är tänkta att läsas.
            <Reveal key={point.title} delay={index * 90}>
              <div className="h-full rounded-xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
                <h3 className="text-[15px] font-semibold text-white">
                  {point.title}
                </h3>
                <p className="mt-2.5 text-[13px] leading-relaxed text-neutral-400">
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
    body: "Order och arbetsmoment väljs i två steg, med knappar stora nog att träffa med arbetshandskar. Vid byte av jobb stängs föregående post automatiskt, så samma tid aldrig hamnar på två ordrar.",
    mockup: <OrderPickMockup />,
  },
  {
    number: 2,
    title: "Tiden räknas medan arbetet pågår",
    body: "Vem som är instämplad, på vilken order och sedan när syns på skärmen. Samma bild finns i panelen, så kontoret ser läget i verkstaden utan att fråga.",
    mockup: <RunningMockup />,
  },
  {
    number: 3,
    title: "Avvikelser markeras före fakturering",
    body: "Saknas utstämpling stängs posten vid ett klockslag ni själva anger och markeras för granskning. Beräknade sluttider är alltid märkta som beräknade, både i panelen och i underlaget.",
    mockup: <ReviewMockup />,
  },
];

export function HowItWorks() {
  return (
    <section id="sa-funkar-det" className="border-b border-neutral-200 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Så fungerar det"
          title="Från tryck på skärmen till färdigt underlag"
          body="Tre steg. De två första sker i verkstaden utan att någon loggar in."
        />

        <div className="mt-16 space-y-20">
          {STEPS.map((step, index) => (
            <Reveal key={step.number}>
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                {/* Vartannat avsnitt speglas, så att blicken flyttas i sidled
                    på vägen ned i stället för att falla rakt igenom. */}
                <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white">
                      {step.number}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-px flex-1 bg-gradient-to-r from-neutral-200 to-transparent"
                    />
                  </div>

                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl">
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
      body: "Vid byte av jobb stängs föregående post. Saknas utstämpling stängs posten vid ett klockslag ni anger, och markeras för granskning.",
    },
    {
      icon: <IconDevice />,
      title: "Ingen installation",
      body: "Skärmen är en surfplatta eller dator med webbläsare. Panelen nås från kontoret utan särskild programvara.",
    },
    {
      icon: <IconReport />,
      title: "Underlag med er logotyp",
      body: "PDF att bifoga fakturan, med ordernummer och kund som rubrik, samtliga stämplingar och totalsumma. Excel finns också.",
    },
    {
      icon: <IconOrder />,
      title: "All tid hör till en order",
      body: "Varje registrerad minut är kopplad till en kundorder. Inga interna konton för tid som ändå inte faktureras.",
    },
    {
      icon: <IconPeople />,
      title: "Ingen inloggning i verkstaden",
      body: "Skärmen kopplas en gång med en sexsiffrig kod. Personalen behöver inga uppgifter, och en skärm kan när som helst kopplas om.",
    },
    {
      icon: <IconShield />,
      title: "Spårbart i efterhand",
      body: "Varje stämpling registrerar tidpunkt, skärm och IP-adress. Manuella ändringar märks och går att skilja från registrerade tryck.",
    },
  ];

  return (
    <section
      id="funktioner"
      className="border-b border-neutral-200 bg-neutral-50 py-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Funktioner"
          title="Anpassat efter verkstadens arbetssätt"
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 70}>
              <div className="group h-full rounded-xl border border-neutral-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-neutral-300 hover:shadow-lg hover:shadow-neutral-900/5">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-500 transition-colors group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-600">
                  {feature.icon}
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-neutral-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
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
    "Rapporter filtrerade på datum, order, anställd och moment",
    "Granskning av poster där utstämpling saknas",
    "Manuell registrering i efterhand, tydligt märkt",
    "Flera administratörer med olika behörighet",
  ];

  return (
    <section className="border-b border-neutral-200 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="Adminpanelen"
              title="Överblick i realtid"
              body="Registrerad tid finns i panelen omedelbart. Ingen insamling och ingen sammanställning."
            />
            <CheckList items={points} />
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
    "Samtliga stämplingar med anställd, moment och timmar",
    "Totalsumma, och beräknade sluttider tydligt märkta",
    "Flera ordrar kan markeras och exporteras samlat",
  ];

  return (
    <section
      id="underlag"
      className="border-b border-neutral-200 bg-neutral-50 py-24"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="lg:order-2">
            <SectionHeading
              eyebrow="Underlaget"
              title="Ett dokument som går att skicka vidare"
              body="Underlag per order laddas ned som PDF eller Excel, utformat för att bifogas fakturan till er kund."
            />

            <CheckList items={points} />

            <div className="mt-7 flex flex-wrap gap-2">
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
    "Obegränsat antal stämplingar",
    "Rapporter, PDF och Excel",
    "Flera administratörer",
    "Support på svenska",
  ];

  return (
    <section id="pris" className="border-b border-neutral-200 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          centered
          eyebrow="Pris"
          title="Ett pris"
          body="Avgiften avser antalet licenser. En licens ger en stämplingsskärm. Antalet anställda påverkar inte priset."
        />

        {/* Gradientram runt kortet. En vanlig kant gör kortet till ännu en ruta
            bland alla andra på sidan; den här säger att det är sidans svar. */}
        <div className="mx-auto mt-12 max-w-md rounded-2xl bg-gradient-to-b from-blue-200 via-neutral-200 to-neutral-200 p-px shadow-xl shadow-neutral-900/5">
          <div className="overflow-hidden rounded-[calc(1rem-1px)] bg-white">
            <div className="border-b border-neutral-200 bg-gradient-to-b from-blue-50/60 to-white px-6 py-8 text-center">
              <p className="text-[13px] font-medium uppercase tracking-wider text-neutral-500">
                Per licens
              </p>

              <p className="mt-3 flex items-baseline justify-center gap-1.5">
                <span className="text-5xl font-semibold tracking-tight text-neutral-900">
                  {pricing.month.toLocaleString("sv-SE")}
                </span>
                <span className="text-sm text-neutral-500">kr / månad</span>
              </p>

              <p className="mt-1.5 text-xs text-neutral-400">
                exklusive moms · ingen bindningstid
              </p>

              {pricing.year !== null && (
                <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {pricing.yearlyDiscountPercent !== null && (
                    <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      −{pricing.yearlyDiscountPercent} %
                    </span>
                  )}
                  {pricing.year.toLocaleString("sv-SE")} kr per år
                </p>
              )}
            </div>

            <ul className="space-y-3 px-6 py-7">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check />
                  <span className="text-[14px] text-neutral-700">{item}</span>
                </li>
              ))}
            </ul>

            <div className="border-t border-neutral-200 px-6 py-6">
              <Link
                href="/registrera"
                className="block rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
              >
                Prova i 30 dagar
              </Link>
              <p className="mt-3 text-center text-xs text-neutral-400">
                Inget betalkort. Provperioden övergår inte i betalning av sig
                själv.
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
      a: "En surfplatta eller dator med pekskärm och webbläsare. Ingen installation. Skärmen kopplas en gång med en sexsiffrig kod och kräver därefter ingen inloggning.",
    },
    {
      q: "Hur lång tid tar uppsättningen?",
      a: "Omkring en kvart. Anställda, ordrar och arbetsmoment läggs upp i en guide, och skärmen kopplas genom att koden knappas in på den enhet som ska användas.",
    },
    {
      q: "Vad händer om någon glömmer stämpla ut?",
      a: "Posten stängs vid ett klockslag ni själva anger, exempelvis 18:00, och markeras för granskning. Beräknade sluttider är alltid märkta och kan rättas före fakturering.",
    },
    {
      q: "Går det att rätta en felaktig stämpling?",
      a: "Ja. Administratören kan ändra tider och registrera stämplingar i efterhand. Manuella ändringar märks och går att skilja från registrerade tryck.",
    },
    {
      q: "Kan underlaget skickas vidare till vår kund?",
      a: "Ja. PDF:en innehåller ordernummer och kundnamn som rubrik, samtliga stämplingar och totalsumma, med er logotyp överst. Excel finns för vidare bearbetning.",
    },
    {
      q: "Kan Tikkr användas för löneunderlag?",
      a: "Nej. Tikkr avser tid som ska faktureras kund och innehåller varken frånvaro, övertidsregler eller lönearter. Avgränsningen håller systemet enkelt i verkstaden.",
    },
    {
      q: "Hur hanteras personuppgifter?",
      a: "Uppgifterna om en anställd begränsas till namn och registrerad tid. Administratören kan när som helst exportera eller radera en enskild anställds uppgifter.",
    },
    {
      q: "Vad händer med tiden om prenumerationen avslutas?",
      a: "Tiden finns kvar. Stämplingsskärmarna fortsätter dessutom fungera vid utebliven betalning. Det är rapporter och export som låses, eftersom oregistrerad arbetstid inte går att rekonstruera.",
    },
  ];

  return (
    <section
      id="fragor"
      className="border-b border-neutral-200 bg-neutral-50 py-24"
    >
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeading centered eyebrow="Frågor" title="Vanliga frågor" />

        {/* Två spalter på stora skärmar. Åtta frågor i en enda kolumn blev en
            lång remsa som sköt ned prisavsnittet ur bild. */}
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {questions.map((item) => (
            // <details> ger utfällbara svar utan JavaScript. Fungerar även om
            // något går fel, och går att söka i med webbläsarens egen funktion.
            <details
              key={item.q}
              className="group h-fit rounded-xl border border-neutral-200 bg-white px-5 py-4 transition-colors hover:border-neutral-300"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
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
              <p className="mt-3 text-[13px] leading-relaxed text-neutral-600">
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
    <section className="relative overflow-hidden bg-neutral-900 py-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[440px] w-[900px] -translate-x-1/2 rounded-full bg-blue-500/20 blur-[140px]"
      />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-[26px] font-semibold tracking-tight text-white sm:text-4xl">
          Prova i er egen verkstad
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-neutral-300">
          Lägg upp anställda, ordrar och arbetsmoment, koppla skärmen och börja
          registrera tid. Det tar omkring en kvart.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href="/registrera"
            className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-neutral-900 transition-all hover:-translate-y-px hover:bg-neutral-100"
          >
            Skapa arbetsyta
          </Link>
          <Link
            href="/admin/login"
            className="rounded-lg border border-neutral-700 px-6 py-3 text-sm font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
          >
            Logga in
          </Link>
        </div>

        <p className="mt-5 text-[13px] text-neutral-400">
          30 dagars provperiod · inget betalkort · därefter{" "}
          {pricing.month.toLocaleString("sv-SE")} kr per licens och månad
        </p>
      </div>
    </section>
  );
}
