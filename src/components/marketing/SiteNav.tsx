"use client";

import { useState } from "react";
import { NAV } from "./links";

/**
 * SÄLJSIDANS LÄNKRAD, MED EN VÄG IN PÅ TELEFON.
 *
 * Länkarna låg i en `hidden md:flex` och ingenting ersatte dem under 768 px.
 * Den som ville till Pris på sin telefon fick skrolla förbi hela sidan för att
 * hitta samma länkar i foten — alltså förbi det hen försökte hoppa till.
 *
 * Samma lösning som `AdminSidebar` och `PlatformShell`: en knapp som fäller ut
 * menyn i flödet, med `aria-expanded` så att den som lyssnar på sidan också får
 * veta om den är öppen.
 *
 * VARFÖR EN KLIENTKOMPONENT OCH INTE `<details>`. En `<details>` hade sluppit
 * JavaScript, vilket annars är husets förstaval — FAQ:n är byggd just så. Men
 * den stängs inte av sig själv när man valt något, och menyn hade blivit
 * stående öppen ovanpå avsnittet man precis rullat till. Med mjuk rullning är
 * det extra tydligt: man ser sidan glida förbi bakom en meny som borde ha
 * försvunnit.
 *
 * Därför stänger varje länk menyn. Det är hela skälet till att det här är en
 * komponent med tillstånd.
 *
 * Utan JavaScript saknas knappen helt och länkraden visas från 768 px som förut.
 * Länkarna finns dessutom kvar i sidfoten på varje sida.
 */
export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Bred skärm: länkarna står utskrivna. */}
      <nav aria-label="Avsnitt" className="hidden gap-6 md:flex">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="text-[13px] text-neutral-400 transition-colors hover:text-white"
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* Smal skärm: knappen står först i raden, där man letar efter den. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Visa avsnitt"
        aria-expanded={open}
        className="-m-2 rounded-md p-2 text-neutral-400 transition-colors hover:text-white md:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          width={20}
          height={20}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {/*
        Den utfällda menyn.

        Ligger som ett eget block under listen och inte som en ruta ovanpå
        innehållet: listen är fastnitad, och en meny som svävar skulle behöva
        veta hur hög den är. `absolute inset-x-0 top-full` gör att den hänger
        under listen oavsett vad den innehåller.
      */}
      {open && (
        <div className="absolute inset-x-0 top-full border-b border-white/10 bg-neutral-900 md:hidden">
          <nav aria-label="Avsnitt" className="mx-auto max-w-6xl px-6 py-2">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block py-3 text-[15px] text-neutral-300 transition-colors hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
