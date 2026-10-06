"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * VÄLJARE MAN SKRIVER I, I STÄLLET FÖR ATT SKROLLA.
 *
 * En vanlig `<select>` duger så länge listan är kort. Med tvåhundra kunder
 * eller femhundra ordrar är den fel verktyg: man vet vad man letar efter, men
 * måste ändå leta.
 *
 * Skriver ett DOLT `<input name=...>` med det valda id:t. Serveråtgärderna
 * läser alltså formuläret precis som förut — ingen av dem behöver veta att
 * väljaren bytts ut.
 *
 * BYGGD SJÄLV, INTE MED `<datalist>`. Den senare ser olika ut i varje
 * webbläsare, går inte att formge, och stänger av sig på olika sätt i Safari
 * och Chrome. Här vet vi vad som händer.
 *
 * Filtreringen sker i webbläsaren på en lista servern redan skickat. Det gör
 * svaret omedelbart och kräver ingen fråga per tangenttryck. Listan är rimlig
 * i storlek — ett företag har hundratals kunder, inte hundratusentals.
 *
 * TVÅ UTSEENDEN, SAMMA VÄLJARE (tillagt 2026-09-29).
 *
 * I ett FILTER ser den ut som en väljare: "Alla kunder" med en pil, eftersom
 * det tomma läget betyder något där. I ett FORMULÄR ser den i stället ut som
 * ett sökfält med förstoringsglas, eftersom det tomma läget bara är ett fält
 * man ännu inte fyllt i.
 *
 * Skillnaden finns för att kunden bad om att kunna söka kund när en order
 * läggs upp. Det gick redan, men ingenting sa det: fältet såg ut som en
 * rullgardin, och en rullgardin klickar man på och skrollar i. Samma
 * funktion, en annan skylt.
 */

export interface SearchSelectOption {
  id: string;
  /** Det som visas och söks i. */
  label: string;
  /** Extra text under etiketten, t.ex. kundnummer. Söks också i. */
  hint?: string;
}

export default function SearchSelect({
  name,
  options,
  defaultValue,
  placeholder = "Sök…",
  emptyLabel,
  required = false,
  variant = "select",
  inDialog = false,
}: {
  name: string;
  options: SearchSelectOption[];
  defaultValue?: string | null;
  placeholder?: string;
  /** Texten för "inget valt". Utelämnad betyder att ett val krävs. */
  emptyLabel?: string;
  required?: boolean;
  /**
   * "select" ser ut som en rullgardin och visar emptyLabel när inget valts.
   * "search" ser ut som ett sökfält och visar platshållaren. Se toppen.
   */
  variant?: "select" | "search";
  /**
   * SÄTTS NÄR VÄLJAREN LIGGER I EN RUTA.
   *
   * Listan ritas då i flödet i stället för ovanpå innehållet. Skälet är att
   * en ruta skrollar sitt innehåll (overflow-y-auto, se dialogBody i
   * designsystemet), och allt som ligger absolut positionerat KLIPPS vid
   * rutans kant. Ordervaljaren i "Ny stämpling" hamnade därför halvt utanför
   * och gick knappt att läsa.
   *
   * I ett filter på en sida finns ingen sådan kant, och där är en lista som
   * lägger sig ovanpå bättre: den knuffar inte ned resten av formuläret.
   */
  inDialog?: boolean;
}) {
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  const [selected, setSelected] = useState<string | null>(defaultValue ?? null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const chosen = options.find((option) => option.id === selected) ?? null;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options.slice(0, 50);

    return options
      .filter(
        (option) =>
          option.label.toLowerCase().includes(needle) ||
          option.hint?.toLowerCase().includes(needle)
      )
      .slice(0, 50);
  }, [options, query]);

  // Stänger när man klickar någon annanstans. Utan det ligger listan kvar över
  // nästa fält, och man tror att man skriver i den.
  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  /**
   * SKICKAR EN change-HÄNDELSE NÄR VALET ÄNDRAS.
   *
   * En dold input som React sätter skickar ingen händelse av sig själv.
   * Filterformulären i rapport- och stämplingsvyn lyssnar på `change` och
   * tillämpar filtret direkt — utan den här raden händer ingenting när man
   * väljer, och man står och undrar varför listan inte ändras.
   *
   * Hoppar över första renderingen. Ett defaultValue är inte ett val någon
   * gjort, och skulle annars skicka iväg formuläret när sidan laddas.
   */
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    hidden.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [selected]);

  const pick = (id: string | null) => {
    setSelected(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapper} className="relative">
      <input ref={hidden} type="hidden" name={name} value={selected ?? ""} />

      {/* Förstoringsglaset står still medan fältet byter läge. Låg det inuti
          knappen respektive fältet skulle det hoppa i sidled i samma stund som
          man börjar skriva. */}
      {variant === "search" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-neutral-400"
        >
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
      )}

      {open ? (
        <input
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            // Enter i ett sökfält inuti ett formulär skickar annars hela
            // formuläret, vilket sparar med det val som råkade vara gjort.
            if (event.key === "Enter") {
              event.preventDefault();
              if (matches.length === 1) pick(matches[0].id);
            }
          }}
          placeholder={placeholder}
          className={`w-full rounded-md border-0 bg-white py-1.5 pr-3 text-base sm:text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 focus:ring-2 focus:ring-inset focus:ring-blue-600 ${
            variant === "search" ? "pl-8" : "pl-3"
          }`}
        />
      ) : (
        /* Knappen visar valet. Klick öppnar sökfältet: samma yta, två lägen,
           så att raden inte hoppar till i höjd när listan öppnas. */
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex w-full items-center justify-between rounded-md bg-white py-1.5 pr-3 text-left text-[13px] ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50 ${
            variant === "search" ? "pl-8" : "pl-3"
          } ${chosen ? "text-neutral-900" : "text-neutral-400"}`}
        >
          <span className="truncate">
            {chosen?.label ??
              (variant === "search" ? placeholder : emptyLabel ?? placeholder)}
          </span>

          {/* Pilen hör till rullgardinen. I ett sökfält vore den en lögn: man
              skriver i det, man fäller inte ut det. */}
          {variant === "select" && (
            <span aria-hidden="true" className="ml-2 shrink-0 text-neutral-400">
              ▾
            </span>
          )}
        </button>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className={`max-h-64 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 ${
            inDialog ? "relative mt-1" : "absolute z-20 mt-1 shadow-lg"
          }`}
        >
          {/* "Ingen vald" står först och inte sist. Den som vill tömma ett fält
              ska inte behöva skrolla förbi tvåhundra rader för att göra det. */}
          {emptyLabel && !required && (
            <li>
              <button
                type="button"
                onClick={() => pick(null)}
                className="w-full px-3 py-2 text-left text-[13px] text-neutral-500 hover:bg-neutral-50"
              >
                {emptyLabel}
              </button>
            </li>
          )}

          {matches.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-neutral-400">
              Ingen träff på ”{query.trim()}”.
            </li>
          ) : (
            matches.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === selected}
                  onClick={() => pick(option.id)}
                  className={`w-full px-3 py-2 text-left text-[13px] hover:bg-neutral-50 ${
                    option.id === selected
                      ? "font-medium text-tick-deep"
                      : "text-neutral-900"
                  }`}
                >
                  {option.label}
                  {option.hint && (
                    <span className="ml-2 text-neutral-400">{option.hint}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
