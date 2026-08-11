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

/* -------------------------------------------------------------------------- */
/* Stämplingsskärmen                                                           */
/* -------------------------------------------------------------------------- */

const NAMES = [
  { name: "Anna Andersson", job: "2601 · Svetsning", since: "2 tim 15 min" },
  { name: "Björn Bergqvist", job: null, since: null },
  { name: "Carina Cederlund", job: "2603 · Montering", since: "48 min" },
  { name: "David Dahl", job: null, since: null },
  { name: "Erik Ek", job: "2601 · Fräsning", since: "5 tim 02 min" },
  { name: "Frida Falk", job: null, since: null },
];

export function KioskMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Stämplingsskärmen" className={className}>
      <div className="flex items-center gap-2.5 border-b border-neutral-200 px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-[11px] font-semibold text-white">
          D
        </span>
        <span>
          <span className="block text-[13px] font-semibold leading-tight text-neutral-900">
            Demo Mekaniska AB
          </span>
          <span className="block text-[11px] leading-tight text-neutral-400">
            Verkstaden
          </span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-3 sm:grid-cols-3">
        {NAMES.map((person, index) => (
          <div
            key={person.name}
            className={`animate-rise rounded-lg border p-3 ${
              person.job
                ? "border-emerald-600 bg-emerald-600"
                : "border-neutral-200 bg-white"
            }`}
            style={{ animationDelay: `${300 + index * 70}ms` }}
          >
            <span
              className={`block text-[13px] font-semibold leading-tight ${
                person.job ? "text-white" : "text-neutral-900"
              }`}
            >
              {person.name}
            </span>

            {person.job ? (
              <>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white ring-1 ring-inset ring-white/25">
                  <span className="animate-breathe h-1.5 w-1.5 rounded-full bg-white" />
                  {person.since}
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
/* Adminpanelen                                                                */
/* -------------------------------------------------------------------------- */

const ROWS = [
  { name: "Anna Andersson", order: "2601", customer: "Volvo Lastvagnar", time: "2 tim 15 min" },
  { name: "Erik Ek", order: "2601", customer: "Volvo Lastvagnar", time: "5 tim 02 min" },
  { name: "Carina Cederlund", order: "2603", customer: "Atlas Copco", time: "48 min" },
];

export function AdminMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen" className={className}>
      <div className="flex">
        <div className="hidden w-32 shrink-0 border-r border-neutral-200 p-2 sm:block">
          <div className="mb-3 flex items-center gap-1.5 px-1">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-neutral-900 text-[9px] font-semibold text-white">
              D
            </span>
            <span className="truncate text-[10px] font-semibold text-neutral-900">
              Demo Mekaniska
            </span>
          </div>

          {["Översikt", "Rapporter", "Granskning", "Ordrar", "Anställda"].map(
            (item, index) => (
              <div
                key={item}
                className={`mb-0.5 rounded px-2 py-1 text-[10px] font-medium ${
                  index === 0
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-500"
                }`}
              >
                {item}
              </div>
            )
          )}
        </div>

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
/* Excel-exporten                                                              */
/* -------------------------------------------------------------------------- */

export function ExportMockup({ className = "" }: { className?: string }) {
  const rows = [
    ["Anna Andersson", "2601", "Svetsning", "7,50"],
    ["Erik Ek", "2601", "Fräsning", "8,00"],
    ["Carina Cederlund", "2603", "Montering", "4,25"],
    ["Anna Andersson", "2603", "Montering", "3,00"],
  ];

  return (
    <Frame label="tikkr-demo-mekaniska-2026-08.xlsx" className={className}>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-neutral-900 text-white">
            <th className="px-3 py-1.5 text-left font-medium">Anställd</th>
            <th className="px-3 py-1.5 text-left font-medium">Order</th>
            <th className="px-3 py-1.5 text-left font-medium">Moment</th>
            <th className="px-3 py-1.5 text-right font-medium">Timmar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join()} className="border-b border-neutral-100">
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={`px-3 py-1.5 ${
                    index === 3
                      ? "text-right tabular-nums text-neutral-900"
                      : "text-neutral-600"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="px-3 py-1.5 text-neutral-900" colSpan={3}>
              TOTALT
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums text-neutral-900">
              22,75
            </td>
          </tr>
        </tbody>
      </table>
    </Frame>
  );
}
