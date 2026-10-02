/**
 * PRODUKTBILDER FÖR SÄLJSIDAN.
 *
 * Byggda som kod istället för skärmdumpar. Tre skäl:
 *
 * 1. De blir skarpa i alla upplösningar, även på en retina-skärm där en
 *    skärmdump ser suddig ut.
 * 2. De kan animeras. En skärm där någon stämplar in visar på tio sekunder
 *    vad produkten gör, vilket en stillbild inte kan.
 * 3. De innehåller ingen riktig kunddata. En skärmdump från en testmiljö har
 *    en tråkig vana att innehålla något man inte tänkt på.
 *
 * DE MÅSTE HÅLLAS I TAKT MED PRODUKTEN. Namnknappen visade länge en tickande
 * tidräknare som tagits bort ur kiosken för länge sedan: där står numera VAD
 * personen är instämplad på, eftersom det är den frågan man har när man går
 * fram till skärmen. En säljsida som visar en äldre version är en besvikelse
 * som kommer fram först efter köpet.
 *
 * RAMEN HAR INGA FÖNSTERKNAPPAR. Tre färgade prickar i hörnet härmar ett
 * operativsystem produkten inte körs i. En etikettrad som säger vad man tittar
 * på bär mer information och ljuger inte.
 */

import { WordmarkOnly } from "@/components/ui/Logo";

export function Frame({
  label,
  meta,
  children,
  className = "",
}: {
  label: string;
  /** Höger sida av etikettraden, t.ex. ett filnamn eller en period. */
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_1px_1px_rgba(14,26,43,0.04),0_24px_48px_-28px_rgba(14,26,43,0.35)] ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          {label}
        </span>
        {meta && (
          <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">
            {meta}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stämplingsskärmens egna delar                                               */
/* -------------------------------------------------------------------------- */

/**
 * Rubrikraden i kiosken: företaget till vänster, Tikkr nedtonat till höger.
 *
 * Samma uppdelning som på riktigt. Skärmen hänger på kundens vägg och är
 * deras.
 */
export function KioskChrome({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-neutral-200 bg-white px-3 py-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-[11px] font-semibold text-white">
        D
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold leading-tight text-neutral-900">
          Demo Mekaniska AB
        </span>
        <span className="block text-[10px] leading-tight text-neutral-400">
          Verkstaden
        </span>
      </span>

      <span className="ml-auto flex items-center gap-2">
        {children}
        {/* Riktiga ordmärket och inte ordet skrivet som text. Mockupen är en
            bild av produkten, och en logotyp som skiljer sig från produktens
            syns först när någon jämför en skärmdump med säljsidan. */}
        <span className="text-neutral-400">
          <WordmarkOnly height={8} tone="current" />
        </span>
      </span>
    </div>
  );
}

/** En person på stämplingsskärmen, som kortet faktiskt ser ut. */
export interface KioskPerson {
  name: string;
  /** Order och moment, eller null för utstämplad. */
  job: string | null;
  /** Det som står på en utstämplad knapp. */
  last?: string;
  /** Klass för initialerna när kortet är vitt. Ur produktens egen palett. */
  tone: string;
}

/** Förnamnets och efternamnets första bokstav, som i produkten. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * NAMNKNAPPEN.
 *
 * Grön fyllning betyder instämplad, vit betyder utstämplad, och det som står
 * under namnet är jobbet. Ingen tidräknare: hur länge man varit inne står i
 * panelen, inte på väggen.
 */
export function KioskCard({
  person,
  size = "normal",
}: {
  person: KioskPerson;
  /** "stor" används i hero, där bilden får mer plats. */
  size?: "normal" | "stor";
}) {
  const working = person.job !== null;
  const big = size === "stor";

  return (
    <div
      className={`flex flex-col justify-between rounded-lg border p-2.5 ${
        big ? "min-h-[86px]" : "min-h-[64px]"
      } ${
        working
          ? "border-emerald-600 bg-emerald-600"
          : "border-neutral-200 bg-white"
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
            big ? "h-7 w-7 text-[10px]" : "h-6 w-6 text-[9px]"
          } ${working ? "bg-white/20 text-white" : person.tone}`}
        >
          {initials(person.name)}
        </span>
        <span
          className={`min-w-0 truncate font-semibold leading-tight ${
            big ? "text-[12px]" : "text-[11px]"
          } ${working ? "text-white" : "text-neutral-900"}`}
        >
          {person.name}
        </span>
      </span>

      {working ? (
        <span
          className={`mt-2 block truncate font-semibold leading-snug text-white ${
            big ? "text-[12px]" : "text-[11px]"
          }`}
        >
          {person.job}
        </span>
      ) : person.last ? (
        <span className="mt-2 block truncate text-[10px] text-neutral-500">
          Senast: {person.last}
        </span>
      ) : (
        <span className="mt-2 block text-[10px] text-neutral-400">
          Ej instämplad
        </span>
      )}
    </div>
  );
}

/**
 * Personerna som återkommer i bilderna.
 *
 * Samma namn överallt, så att den som skrollar känner igen sig och förstår att
 * bilderna visar samma verkstad från olika håll. Tonerna är hämtade ur
 * produktens egen palett för initialer.
 */
export const PEOPLE: KioskPerson[] = [
  {
    name: "Anna Andersson",
    job: "2601 · Svetsning",
    tone: "bg-blue-100 text-blue-700",
  },
  {
    name: "Björn Bergqvist",
    job: null,
    last: "2602 · Montering",
    tone: "bg-emerald-100 text-emerald-700",
  },
  {
    name: "Carina Cederlund",
    job: "2603 · Montering",
    tone: "bg-amber-100 text-amber-700",
  },
  { name: "David Dahl", job: null, tone: "bg-blue-200 text-blue-800" },
  {
    name: "Erik Ek",
    job: "2601 · Fräsning",
    tone: "bg-emerald-200 text-emerald-800",
  },
  {
    name: "Frida Falk",
    job: null,
    last: "2603 · Kapning",
    tone: "bg-neutral-200 text-neutral-700",
  },
  {
    name: "Gustav Gran",
    job: "2604 · Lackering",
    tone: "bg-blue-100 text-blue-700",
  },
  { name: "Hanna Holm", job: null, tone: "bg-emerald-100 text-emerald-700" },
  {
    name: "Ivar Isaksson",
    job: "2605 · Kapning",
    tone: "bg-amber-100 text-amber-700",
  },
];

/* -------------------------------------------------------------------------- */
/* Stämplingsskärmen — steg två, välj order                                    */
/* -------------------------------------------------------------------------- */

const ORDERS = [
  { number: "2601", customer: "Volvo Lastvagnar" },
  { number: "2603", customer: "Atlas Copco" },
  { number: "2604", customer: "Sandvik Coromant" },
  { number: "2605", customer: "SKF Sverige" },
];

/**
 * Andra steget i kiosken.
 *
 * Finns med för att visa att valet är knappar och inte en rullgardinslista.
 * Skillnaden är hela poängen för den som står med arbetshandskar på.
 */
export function OrderPickMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Stämplingsskärmen" meta="steg 2 av 3" className={className}>
      <KioskChrome>
        <span className="rounded-md border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-500">
          Avbryt
        </span>
      </KioskChrome>

      <div className="bg-neutral-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-neutral-900">
            Anna Andersson: välj order
          </p>
          <span className="shrink-0 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-neutral-500">
            Slå in ordernummer
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ORDERS.map((order, index) => (
            <div
              key={order.number}
              className="animate-rise rounded-lg border border-neutral-200 bg-white p-3"
              style={{ animationDelay: `${200 + index * 80}ms` }}
            >
              <span className="block text-sm font-semibold leading-tight text-neutral-900">
                {order.number}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-neutral-500">
                {order.customer}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Stämplingsskärmen — namnrutnätet                                            */
/* -------------------------------------------------------------------------- */

/**
 * Namnrutnätet.
 *
 * Grönt kort betyder instämplad och ordern står under namnet. Vem som arbetar
 * med vad går att läsa från andra sidan verkstaden, vilket är skälet att
 * korten är så stora.
 */
export function RunningMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Stämplingsskärmen" className={className}>
      <KioskChrome />

      <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-3">
        {PEOPLE.slice(0, 4).map((person, index) => (
          <div
            key={person.name}
            className="animate-rise"
            style={{ animationDelay: `${200 + index * 80}ms` }}
          >
            <KioskCard person={person} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Adminpanelen — översikten                                                   */
/* -------------------------------------------------------------------------- */

const ROWS = [
  {
    name: "Anna Andersson",
    order: "2601",
    customer: "Volvo Lastvagnar",
    time: "2:15",
  },
  { name: "Anna Andersson", order: "2604", customer: "Sandvik", time: "1:40" },
  {
    name: "Carina Cederlund",
    order: "2603",
    customer: "Atlas Copco",
    time: "0:48",
  },
];

const MENU = ["Översikt", "Rapporter", "Tidrapport", "Granskning", "Ordrar"];

function Sidebar({ active = 0 }: { active?: number }) {
  return (
    <div className="hidden w-32 shrink-0 border-r border-neutral-200 p-2 sm:block">
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-neutral-900 text-[9px] font-semibold text-white">
          D
        </span>
        <span className="truncate text-[10px] font-semibold text-neutral-900">
          Demo Mekaniska
        </span>
      </div>

      {MENU.map((item, index) => (
        <div
          key={item}
          className={`mb-0.5 rounded px-2 py-1 text-[10px] font-medium ${
            index === active
              ? "bg-neutral-100 text-neutral-900"
              : "text-neutral-500"
          }`}
        >
          {item}
        </div>
      ))}
    </div>
  );
}

/**
 * Översikten i panelen.
 *
 * Här STÅR tiden som gått, till skillnad från på stämplingsskärmen. Det är
 * skillnaden mellan de två ytorna: skärmen svarar på vad man är instämplad på,
 * panelen på hur länge.
 */
export function AdminMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen" meta="översikt" className={className}>
      <div className="flex">
        <Sidebar active={0} />

        <div className="min-w-0 flex-1 bg-neutral-50 p-3">
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat label="Arbetar just nu" value="3" tone="emerald" />
            <Stat label="Registrerat idag" value="18:30" />
            <Stat label="Att granska" value="1" tone="amber" />
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/70 px-3 py-1.5">
              <span className="text-[10px] font-medium text-neutral-500">
                Pågående arbete
              </span>
              {/* Anna står två gånger. En operatör som kör två maskiner har
                  två öppna stämplingar, och båda ordrarna ska betala sin. */}
              <span className="text-[10px] text-neutral-400">
                3 jobb · 2 personer
              </span>
            </div>

            {ROWS.map((row, index) => (
              <div
                key={`${row.name}-${row.order}`}
                className="animate-rise flex items-center gap-2 border-b border-neutral-100 px-3 py-2 last:border-0"
                style={{ animationDelay: `${500 + index * 90}ms` }}
              >
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-neutral-900">
                  {row.name}
                </span>
                <span className="hidden text-[10px] text-neutral-500 sm:block">
                  {row.order} · {row.customer}
                </span>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  {row.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber";
}) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : "text-neutral-900";

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
      <span className="block text-[9px] font-medium text-neutral-500">
        {label}
      </span>
      <span className={`block text-sm font-semibold tabular-nums ${valueTone}`}>
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Adminpanelen — rapporten                                                    */
/* -------------------------------------------------------------------------- */

const REPORT = [
  { order: "2601", customer: "Volvo Lastvagnar", hours: "42:15", share: 100 },
  { order: "2603", customer: "Atlas Copco", hours: "28:00", share: 66 },
  { order: "2604", customer: "Sandvik Coromant", hours: "14:15", share: 34 },
];

/** Summeringen per order. Svaret på vad som ska faktureras. */
export function ReportMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen" meta="rapporter" className={className}>
      <div className="flex">
        <Sidebar active={1} />

        <div className="min-w-0 flex-1 bg-neutral-50 p-3">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {["Förra veckan", "Alla ordrar", "Fakturerbar tid"].map((chip) => (
              <span
                key={chip}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[9px] font-medium text-neutral-600"
              >
                {chip}
              </span>
            ))}
            <span className="ml-auto rounded-md bg-neutral-900 px-2 py-1 text-[9px] font-semibold text-white">
              PDF
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/70 px-3 py-1.5">
              <span className="text-[10px] font-medium text-neutral-500">
                Tid per order
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-neutral-900">
                84:30
              </span>
            </div>

            {REPORT.map((row, index) => (
              <div
                key={row.order}
                className="border-b border-neutral-100 px-3 py-2 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-neutral-900">
                    {row.order}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-500">
                    {row.customer}
                  </span>
                  <span className="text-[10px] font-semibold tabular-nums text-neutral-900">
                    {row.hours}
                  </span>
                </div>

                {/* Stapeln gör förhållandet mellan ordrarna läsbart utan att
                    någon behöver jämföra siffror i huvudet. */}
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="animate-rise h-full rounded-full bg-blue-600"
                    style={{
                      width: `${row.share}%`,
                      animationDelay: `${300 + index * 120}ms`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Adminpanelen — granskning                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Posten där utstämplingen saknas.
 *
 * Sluttiden är beräknad, den är märkt som beräknad, och den ligger i en lista
 * som gås igenom före fakturering.
 */
export function ReviewMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen" meta="granskning" className={className}>
      <div className="bg-neutral-50 p-3">
        <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          <span className="text-[10px] font-medium text-amber-900">
            1 post behöver granskas före fakturering
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-neutral-900">
                David Dahl
              </span>
              <span className="text-[10px] text-neutral-500">
                2601 · Lackering
              </span>
              <span className="ml-auto rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 ring-1 ring-inset ring-amber-200">
                9:48
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-neutral-500">
              <span>
                Instämplad <span className="tabular-nums">07:12</span>
              </span>
              <span className="text-amber-700">
                Beräknad sluttid <span className="tabular-nums">18:00</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-neutral-50/70 px-3 py-2">
            <span className="rounded border border-neutral-200 bg-white px-2 py-1 text-[9px] font-medium text-neutral-600">
              Ange rätt sluttid
            </span>
            <span className="rounded bg-neutral-900 px-2 py-1 text-[9px] font-semibold text-white">
              Godkänn
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Dokument 1 — underlaget till kunden                                         */
/* -------------------------------------------------------------------------- */

/**
 * Underlaget som skickas vidare till kundens kund.
 *
 * Logotypsrutan överst är med avsikt. Det är den detalj som gör skillnaden
 * mellan en systemutskrift och ett dokument från leverantören.
 */
export function ExportMockup({ className = "" }: { className?: string }) {
  const rows = [
    ["Anna Andersson", "Svetsning", "7,50"],
    ["Erik Ek", "Fräsning", "8,00"],
    ["Carina Cederlund", "Montering", "4,25"],
    ["Anna Andersson", "Kvalitetskontroll", "3,00"],
  ];

  return (
    <Frame label="Till kunden" meta="order-2601.pdf" className={className}>
      <div className="px-4 py-4">
        <div className="flex h-7 w-20 items-center justify-center rounded border border-dashed border-neutral-300 text-[8px] text-neutral-400">
          er logotyp
        </div>

        <p className="mt-3 text-[13px] font-semibold text-neutral-900">
          Order 2601
        </p>
        <p className="text-[10px] text-neutral-500">Volvo Lastvagnar</p>

        <table className="mt-3 w-full text-[10px]">
          <thead>
            <tr className="bg-neutral-900 text-white">
              <th className="px-2 py-1 text-left font-medium">Anställd</th>
              <th className="px-2 py-1 text-left font-medium">Moment</th>
              <th className="px-2 py-1 text-right font-medium">Timmar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join()} className="border-b border-neutral-100">
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={`px-2 py-1 ${
                      index === 2
                        ? "text-right tabular-nums text-neutral-900"
                        : "text-neutral-600"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-1 flex items-center justify-between rounded bg-neutral-100 px-2 py-1.5">
          <span className="text-[10px] font-semibold text-neutral-900">
            TOTALT
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-neutral-900">
            22,75 timmar
          </span>
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Dokument 2 — efterkalkylen                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Efterkalkylen.
 *
 * Bandet överst är produktens eget och står på varje sida.
 *
 * INGA TIMKOSTNADER, som i dokumentet: pappret rör sig, och vad en namngiven
 * person kostar i timmen hör inte hemma på ett bord i verkstaden. Kvar står
 * tiden och kostnaden per arbetsmoment.
 */
export function CalcMockup({ className = "" }: { className?: string }) {
  const rows = [
    ["Svetsning", "12:30", "10 625"],
    ["Fräsning", "8:00", "7 200"],
    ["Montering", "4:15", "2 550"],
  ];

  return (
    <Frame label="Internt" meta="efterkalkyl-2601.pdf" className={className}>
      <div className="px-4 py-4">
        <div className="rounded bg-neutral-900 px-2 py-1.5">
          <span className="text-[8px] font-semibold uppercase tracking-wider text-white">
            Internt underlag
          </span>
        </div>

        <p className="mt-3 text-[13px] font-semibold text-neutral-900">
          Efterkalkyl order 2601
        </p>
        <p className="text-[10px] text-neutral-500">Volvo Lastvagnar</p>

        <table className="mt-3 w-full text-[10px]">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-1 text-left font-medium">Arbetsmoment</th>
              <th className="py-1 text-right font-medium">Tid</th>
              <th className="py-1 text-right font-medium">Kostnad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-b border-neutral-100">
                <td className="py-1 text-neutral-700">{row[0]}</td>
                <td className="py-1 text-right tabular-nums text-neutral-600">
                  {row[1]}
                </td>
                <td className="py-1 text-right tabular-nums text-neutral-900">
                  {row[2]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-3 space-y-1 text-[10px]">
          <Line label="Självkostnad" value="20 375 kr" />
          <Line label="Påslag 40 %" value="8 150 kr" />
          <Line label="Rabatt 5 %" value="−1 426 kr" muted />
        </dl>

        <div className="mt-2 flex items-center justify-between rounded bg-neutral-900 px-2 py-1.5">
          <span className="text-[10px] font-semibold text-white">PRIS</span>
          <span className="text-[10px] font-semibold tabular-nums text-white">
            27 099 kr
          </span>
        </div>
      </div>
    </Frame>
  );
}

function Line({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-neutral-500" : "text-neutral-600"}>
        {label}
      </dt>
      <dd className="tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dokument 3 — tidrapporten                                                   */
/* -------------------------------------------------------------------------- */

/** Tidrapporten per anställd. Underlaget som går vidare till lönen. */
export function TimesheetMockup({ className = "" }: { className?: string }) {
  const days = [
    ["Må", "8,50", "8,50", "0,00"],
    ["Ti", "8,50", "9,25", "+0,75"],
    ["On", "8,50", "8,50", "0,00"],
    ["To", "8,50", "0,00", "sjuk"],
    ["Fr", "6,00", "6,00", "0,00"],
  ];

  return (
    <Frame label="Till lönen" meta="tidrapport.pdf" className={className}>
      <div className="px-4 py-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-semibold text-neutral-900">
            Johan Andersson
          </p>
          <span className="text-[10px] tabular-nums text-neutral-400">
            v. 16
          </span>
        </div>

        <table className="mt-3 w-full text-[10px]">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-1 text-left font-medium">Dag</th>
              <th className="py-1 text-right font-medium">Planerat</th>
              <th className="py-1 text-right font-medium">Närvaro</th>
              <th className="py-1 text-right font-medium">Flex</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day[0]} className="border-b border-neutral-100">
                <td className="py-1 text-neutral-700">{day[0]}</td>
                <td className="py-1 text-right tabular-nums text-neutral-600">
                  {day[1]}
                </td>
                <td className="py-1 text-right tabular-nums text-neutral-600">
                  {day[2]}
                </td>
                <td
                  className={`py-1 text-right tabular-nums ${
                    day[3] === "sjuk" ? "text-amber-700" : "text-neutral-900"
                  }`}
                >
                  {day[3]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-3 space-y-1 text-[10px]">
          <Line label="Planerad tid" value="40,00 tim" />
          <Line label="Närvarotid" value="32,25 tim" />
          <Line label="Frånvaro, sjuk" value="8,50 tim" muted />
        </dl>

        <div className="mt-2 flex items-center justify-between rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5">
          <span className="text-[10px] font-semibold text-neutral-900">
            Flexsaldo
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-emerald-700">
            +0,75 tim
          </span>
        </div>
      </div>
    </Frame>
  );
}
