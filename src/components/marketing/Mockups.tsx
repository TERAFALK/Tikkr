/**
 * PRODUKTBILDER FÖR SÄLJSIDAN.
 *
 * Byggda som kod istället för skärmdumpar. Tre skäl:
 *
 * 1. De blir skarpa i alla upplösningar, även på en retina-skärm där en
 *    skärmdump ser suddig ut.
 * 2. De kan animeras — en pulserande punkt visar att tid räknas just nu,
 *    vilket en stillbild inte kan.
 * 3. De innehåller ingen riktig kunddata. En skärmdump från en testmiljö har
 *    en tråkig vana att innehålla något man inte tänkt på.
 *
 * De använder samma färger och former som produkten, så det som visas är sant
 * även om det inte är en fotografisk avbildning.
 */

function Frame({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_20px_50px_-20px_rgba(15,23,42,0.25)] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
        </span>
        <span className="text-[11px] text-neutral-400">{label}</span>
      </div>
      {children}
    </div>
  );
}

/** Företagsraden som återkommer överst i kioskbilderna. */
function KioskHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-neutral-200 px-4 py-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-[11px] font-semibold text-white">
        D
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-tight text-neutral-900">
          Demo Mekaniska AB
        </span>
        <span className="block text-[11px] leading-tight text-neutral-400">
          Verkstaden
        </span>
      </span>
      {children}
    </div>
  );
}

/**
 * Personerna som återkommer i bilderna.
 *
 * Samma namn överallt, så att den som skrollar känner igen sig och förstår att
 * bilderna visar samma verkstad från olika håll.
 */
const NAMES = [
  { name: "Anna Andersson", job: "2601 · Svetsning", elapsed: "2 tim 15 min" },
  { name: "Björn Bergqvist", job: null, elapsed: null },
  { name: "Carina Cederlund", job: "2603 · Montering", elapsed: "48 min" },
  { name: "David Dahl", job: null, elapsed: null },
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
 * Skillnaden är hela poängen för någon som står med handskar på.
 */
export function OrderPickMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Stämplingsskärmen · steg 2" className={className}>
      <KioskHeader>
        <span className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[10px] font-medium text-neutral-500 sm:flex">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[8px] font-semibold text-white">
              2
            </span>
            Välj order
          </span>
          <span className="rounded-md border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-500">
            Avbryt
          </span>
        </span>
      </KioskHeader>

      <div className="bg-neutral-50 p-3">
        <p className="mb-2 text-[11px] font-semibold text-neutral-900">
          Anna Andersson: välj order
        </p>

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
/* Stämplingsskärmen — pågående arbete                                         */
/* -------------------------------------------------------------------------- */

/**
 * Namnrutnätet med tiden som räknas.
 *
 * Grönt kort betyder instämplad, och den förflutna tiden står på kortet. Vem
 * som arbetar med vad går att läsa från andra sidan verkstaden, vilket är
 * skälet att korten är så stora.
 */
export function RunningMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Stämplingsskärmen" className={className}>
      <KioskHeader />

      <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-3">
        {NAMES.map((person, index) => (
          <div
            key={person.name}
            className={`animate-rise rounded-lg border p-3 ${
              person.job
                ? "border-emerald-600 bg-emerald-600"
                : "border-neutral-200 bg-white"
            }`}
            style={{ animationDelay: `${200 + index * 80}ms` }}
          >
            <span
              className={`block truncate text-[12px] font-semibold leading-tight ${
                person.job ? "text-white" : "text-neutral-900"
              }`}
            >
              {person.name}
            </span>

            {person.job ? (
              <>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white ring-1 ring-inset ring-white/25">
                  <span className="animate-breathe h-1.5 w-1.5 rounded-full bg-white" />
                  {person.elapsed}
                </span>
                <span className="mt-1 block truncate text-[10px] text-white/80">
                  {person.job}
                </span>
              </>
            ) : (
              <span className="mt-2 block text-[10px] text-neutral-400">
                Ej instämplad
              </span>
            )}
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
  { name: "Anna Andersson", order: "2601", customer: "Volvo Lastvagnar", time: "2 tim 15 min" },
  { name: "Erik Ek", order: "2601", customer: "Volvo Lastvagnar", time: "5 tim 02 min" },
  { name: "Carina Cederlund", order: "2603", customer: "Atlas Copco", time: "48 min" },
];

const MENU = ["Översikt", "Rapporter", "Granskning", "Ordrar", "Anställda"];

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

export function AdminMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen" className={className}>
      <div className="flex">
        <Sidebar active={0} />

        <div className="min-w-0 flex-1 bg-neutral-50 p-3">
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat label="Arbetar nu" value="3" tone="emerald" />
            <Stat label="Idag" value="18,5 tim" />
            <Stat label="Att granska" value="1" tone="amber" />
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 bg-neutral-50/70 px-3 py-1.5">
              <span className="text-[10px] font-medium text-neutral-500">
                Pågående arbete
              </span>
            </div>

            {ROWS.map((row, index) => (
              <div
                key={row.name}
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
  { order: "2601", customer: "Volvo Lastvagnar", hours: "42,25", share: 100 },
  { order: "2603", customer: "Atlas Copco", hours: "28,00", share: 66 },
  { order: "2604", customer: "Sandvik Coromant", hours: "14,25", share: 34 },
];

/** Summeringen per order — svaret på vad som ska faktureras. */
export function ReportMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen · rapporter" className={className}>
      <div className="flex">
        <Sidebar active={1} />

        <div className="min-w-0 flex-1 bg-neutral-50 p-3">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {["1–31 augusti", "Alla ordrar", "Alla anställda"].map((chip) => (
              <span
                key={chip}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[9px] font-medium text-neutral-600"
              >
                {chip}
              </span>
            ))}
            <span className="ml-auto rounded-md bg-neutral-900 px-2 py-1 text-[9px] font-semibold text-white">
              Exportera
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/70 px-3 py-1.5">
              <span className="text-[10px] font-medium text-neutral-500">
                Tid per order
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-neutral-900">
                84,50 tim
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
 * Visar det som skiljer Tikkr från ett system som gissar tyst: sluttiden är
 * beräknad, den är märkt som beräknad, och den ligger i en lista som ska
 * gås igenom före fakturering.
 */
export function ReviewMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen · granskning" className={className}>
      <div className="bg-neutral-50 p-3">
        <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="animate-breathe h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
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
                9 tim 48 min
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
/* Underlaget                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Underlaget som skickas vidare till kundens kund.
 *
 * Visar avsiktligt en tänkt logotypruta överst — det är den detalj som gör
 * skillnaden mellan "en systemutskrift" och "ett dokument från leverantören",
 * och den är svår att förklara i text.
 */
export function ExportMockup({ className = "" }: { className?: string }) {
  const rows = [
    ["Anna Andersson", "Svetsning", "7,50"],
    ["Erik Ek", "Fräsning", "8,00"],
    ["Carina Cederlund", "Montering", "4,25"],
    ["Anna Andersson", "Kvalitetskontroll", "3,00"],
  ];

  return (
    <Frame label="order-2601.pdf" className={className}>
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
