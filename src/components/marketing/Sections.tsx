import Link from "next/link";
import {
  IconClock,
  IconDevice,
  IconOrder,
  IconPeople,
  IconReport,
  IconShield,
} from "@/components/ui/icons";
import { AdminMockup, ExportMockup, KioskMockup } from "./Mockups";

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-neutral-200 bg-white">
      {/* Mjuk ljusgång bakom rubriken. Ren dekoration, därför dold för
          skärmläsare. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(37,99,235,0.10),transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">
            <span className="animate-breathe h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Byggt för svensk verkstadsindustri
          </span>

          <h1
            className="animate-rise mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl"
            style={{ animationDelay: "60ms" }}
          >
            Tidregistrering som
            <br className="hidden sm:block" /> faktiskt blir gjord
          </h1>

          <p
            className="animate-rise mx-auto mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg"
            style={{ animationDelay: "120ms" }}
          >
            Ett tryck på skärmen i verkstaden, så vet du hur mycket tid som lagts
            på varje order. Ingen PIN-kod, inga blanketter, ingen som sitter och
            gissar på fredagen.
          </p>

          <div
            className="animate-rise mt-8 flex flex-wrap justify-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Link
              href="/registrera"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Kom igång — 30 dagar fritt
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
            Inget kort behövs · Igång på en kvart · Säg upp när du vill
          </p>
        </div>

        {/* Produktbilderna. Kiosken ligger framför panelen, eftersom det är
            den anställda ser och den som avgör om systemet används. */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div
            className="animate-rise-soft"
            style={{ animationDelay: "300ms" }}
          >
            <AdminMockup />
          </div>

          <div
            className="animate-rise-soft absolute -bottom-10 -right-2 hidden w-64 sm:block lg:-right-10 lg:w-80"
            style={{ animationDelay: "480ms" }}
          >
            <div className="animate-drift">
              <KioskMockup />
            </div>
          </div>
        </div>
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
      body: "På fredagen ska någon minnas vad de gjorde på tisdagen. Det som skrivs blir en gissning, och gissningen blir en faktura.",
    },
    {
      title: "Timmar som aldrig faktureras",
      body: "Det som inte hann skrivas upp försvinner. Kunden betalar för mindre än ni gjorde, och ingen märker det.",
    },
    {
      title: "Ingen vet vad en order kostade",
      body: "Utan tid per order går det inte att se vilka jobb som lönar sig. Nästa offert blir en gissning den också.",
    },
  ];

  return (
    <section className="border-b border-neutral-200 bg-neutral-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-blue-600">
            Problemet
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Tid som inte registreras när den läggs ner går inte att få tillbaka
          </h2>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {points.map((point) => (
            <div
              key={point.title}
              className="rounded-xl border border-neutral-200 bg-white p-5"
            >
              <h3 className="text-sm font-semibold text-neutral-900">
                {point.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
                {point.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Så funkar det                                                               */
/* -------------------------------------------------------------------------- */

export function HowItWorks() {
  return (
    <section id="sa-funkar-det" className="border-b border-neutral-200 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-blue-600">
            Så funkar det
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Ett tryck vid skärmen, färdig rapport hos dig
          </h2>
        </div>

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <Step
              number={1}
              title="Den anställde trycker på sitt namn"
              body="Väljer order och arbetsmoment. Ingen PIN-kod, ingen bekräftelseruta. Byter någon jobb stämplas det förra ut automatiskt, så samma timme kan aldrig hamna på två ordrar."
            />
            <Step
              number={2}
              title="Tiden räknas medan arbetet pågår"
              body="Namnet blir grönt och visar hur länge jobbet hållit på. Hackar wifit sparas stämplingen i skärmen och skickas när nätet är tillbaka — med den tid den faktiskt gjordes."
            />
            <Step
              number={3}
              title="Du tar ut underlaget"
              body="Tid per order, person och moment. Glömde någon stämpla ut stänger systemet posten och flaggar den, så du ser exakt vilka tider som är gissade."
              last
            />
          </div>

          <div className="order-1 space-y-6 lg:order-2">
            <KioskMockup />
            <ExportMockup className="ml-6" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Step({
  number,
  title,
  body,
  last,
}: {
  number: number;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[13px] font-semibold text-white">
          {number}
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-neutral-200" />}
      </div>

      <div className={last ? "" : "pb-8"}>
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">
          {body}
        </p>
      </div>
    </div>
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
      body: "Byter någon jobb stängs det förra i samma sekund. Glöms utstämplingen stänger systemet posten vid ett klockslag du väljer — och flaggar den, istället för att gissa tyst.",
    },
    {
      icon: <IconDevice />,
      title: "Fungerar utan nät",
      body: "Stämplingar sparas i skärmen och skickas när nätet är tillbaka. Tiden som registreras är när personen tryckte, inte när anropet kom fram.",
    },
    {
      icon: <IconReport />,
      title: "Underlag att fakturera på",
      body: "Tid per order, person och moment. Excel-export med decimaltimmar i egna celler och färdiga summor, så siffrorna går att räkna vidare på.",
    },
    {
      icon: <IconOrder />,
      title: "All tid hör till en order",
      body: "Inget internt konto att gömma timmar i. Varje registrerad minut går att koppla till ett jobb som ska faktureras.",
    },
    {
      icon: <IconPeople />,
      title: "Ingen inloggning i verkstaden",
      body: "Skärmen kopplas en gång med en länk och kommer ihåg sig. En anställd behöver aldrig ett lösenord, och skärmen kan återkallas när som helst.",
    },
    {
      icon: <IconShield />,
      title: "Spårbart i efterhand",
      body: "Varje stämpling sparar tidpunkt, skärm och IP. Rättar du en tid märks den som manuell, så den aldrig går att förväxla med en riktig stämpling.",
    },
  ];

  return (
    <section
      id="funktioner"
      className="border-b border-neutral-200 bg-neutral-50 py-20"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-blue-600">
            Funktioner
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Byggt för hur en verkstad faktiskt fungerar
          </h2>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-neutral-200 bg-white p-5"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500">
                {feature.icon}
              </span>
              <h3 className="mt-3.5 text-sm font-semibold text-neutral-900">
                {feature.title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">
                {feature.body}
              </p>
            </div>
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
    "Se vem som arbetar just nu och på vilken order",
    "Filtrera på order, person, moment och datum",
    "Rätta glömda utstämplingar innan du fakturerar",
    "Lägg in tid som aldrig hann stämplas",
    "Exportera till Excel med färdiga summor",
  ];

  return (
    <section className="border-b border-neutral-200 py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wider text-blue-600">
            Adminpanelen
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Överblick utan att jaga någon
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
            Allt som registreras hamnar direkt i panelen. Du behöver inte fråga
            någon hur långt de kommit, och ingen behöver skriva en lapp.
          </p>

          <ul className="mt-6 space-y-2.5">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5">
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
                <span className="text-[13px] leading-relaxed text-neutral-700">
                  {point}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <AdminMockup />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Pris                                                                        */
/* -------------------------------------------------------------------------- */

export function Pricing() {
  const included = [
    "Obegränsat antal anställda",
    "Obegränsat antal ordrar och arbetsmoment",
    "Rapporter och Excel-export",
    "Offline-stöd på skärmarna",
    "Flera administratörer",
    "Support på svenska",
  ];

  return (
    <section id="pris" className="border-b border-neutral-200 bg-neutral-50 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-blue-600">
            Pris
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            En siffra, inget mer
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
            Ni betalar per stämplingsskärm. Antalet anställda spelar ingen roll,
            och det finns ingen grundavgift.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-md">
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-200 px-6 py-6 text-center">
              <p className="text-[13px] font-medium text-neutral-500">
                Per stämplingsskärm
              </p>
              <p className="mt-2 flex items-baseline justify-center gap-1.5">
                <span className="text-4xl font-semibold tracking-tight text-neutral-900">
                  399
                </span>
                <span className="text-sm text-neutral-500">kr / månad</span>
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                exklusive moms, månadsvis
              </p>
            </div>

            <ul className="space-y-2.5 px-6 py-6">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
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
                Inget kort behövs. Provperioden övergår inte automatiskt i
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
      q: "Vad händer om nätet ligger nere?",
      a: "Stämplingen fungerar ändå. Trycket sparas i skärmen och skickas när nätet är tillbaka, med den tid det faktiskt gjordes. En ruta på skärmen visar hur många som väntar på att skickas.",
    },
    {
      q: "Vad krävs för att köra det i verkstaden?",
      a: "En surfplatta eller en dator med pekskärm och en webbläsare. Inget att installera. Skärmen kopplas en gång med en länk och behöver aldrig loggas in igen.",
    },
    {
      q: "Vad händer om någon glömmer stämpla ut?",
      a: "Systemet stänger posten vid ett klockslag ni väljer, till exempel 18:00, och flaggar den för granskning. Ni ser exakt vilka tider som är gissade och kan rätta dem innan ni fakturerar. Systemet gissar aldrig tyst.",
    },
    {
      q: "Går det att rätta en felaktig stämpling?",
      a: "Ja. Administratören kan ändra tider och lägga in stämplingar som aldrig gjordes. Varje sådan ändring märks som manuell, så den aldrig går att förväxla med en riktig stämpling.",
    },
    {
      q: "Kan Tikkr användas för löner?",
      a: "Nej, och det är ett medvetet val. Tikkr registrerar tid som ska faktureras en kund. Ingen frånvaro, ingen övertid, inga lönearter. Det håller systemet enkelt nog att faktiskt användas.",
    },
    {
      q: "Vem kan se vår data?",
      a: "Bara ni. Varje företag är helt avskilt från andra i systemet, vilket är testat automatiskt. Vi som driver tjänsten ser hur mycket ni använder den, men inte namn på anställda, ordrar eller registrerade tider.",
    },
  ];

  return (
    <section id="fragor" className="border-b border-neutral-200 py-20">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-blue-600">
            Frågor
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Det folk brukar undra
          </h2>
        </div>

        <div className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
          {questions.map((item) => (
            // <details> ger utfällbara svar utan JavaScript. Fungerar även om
            // något strular, och går att söka i med webbläsarens egen sökfunktion.
            <details key={item.q} className="group py-4">
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

export function FinalCta() {
  return (
    <section className="bg-neutral-900 py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Sätt upp en skärm och se skillnaden på en vecka
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-300">
          Det tar en kvart att komma igång: lägg upp anställda, ordrar och
          moment, koppla skärmen och låt verkstaden börja stämpla.
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
          30 dagar utan kostnad · inget kort · 399 kr per skärm och månad därefter
        </p>
      </div>
    </section>
  );
}
