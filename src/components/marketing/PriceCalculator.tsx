"use client";

import { useState } from "react";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import type { ModulePricing, ScreenPricing } from "@/lib/stripe";

/**
 * VAD DET KOSTAR FÖR OSS.
 *
 * Prislistan ovanför svarar på vad en skärm kostar. Den här raden svarar på
 * vad kundens egen uppsättning kostar, vilket är den enda fråga som står kvar
 * när man läst tabellen.
 *
 * LIGGER INUTI PRISKORTET och inte som ett eget avsnitt. Den är en del av
 * prislistan, inte en tjänst vid sidan av — ett eget avsnitt hade gjort den
 * till en pryl man leker med, och den finns för att ta bort ett
 * räknesteg, inte för att underhålla.
 *
 * STYCKPRISERNA STÅR KVAR OVANFÖR. Att låta kalkylatorn ersätta dem vore att
 * byta ut en siffra man minns mot en summa som bara gäller just den som råkar
 * ha tre skärmar. "399 kr per skärm" är vad kunden ska kunna upprepa för sin
 * chef, se CLAUDE.md § 8.
 *
 * Språket följer § 7.1: etiketter, inga förklaringar. Reglagen visar själva
 * vad de gör.
 */

/** Belopp i svensk form. Samma formatering som i produkten. */
function kr(amount: number): string {
  return amount.toLocaleString("sv-SE");
}

/**
 * Antalet skärmar har ett tak.
 *
 * Inte för att fler inte går att köpa, utan för att en stegare man kan hålla
 * nere räknar till tusen om ingenting hindrar den. Den som behöver fler än så
 * har en annan sorts samtal med oss ändå.
 */
const MAX_SCREENS = 25;

export default function PriceCalculator({
  pricing,
  modules,
}: {
  pricing: ScreenPricing;
  modules: ModulePricing;
}) {
  const [screens, setScreens] = useState(1);

  // EN KRYSSRUTA PER TILLVAL, ur registret. Var en enda `withPayroll` tills
  // planeringen kom, och nästa modul hade då krävt en till boolean plus en
  // till rad i summan — två ställen att glömma. Mängden rymmer varje modul
  // utan att räkningen nedan ändras.
  const [picked, setPicked] = useState<Set<ModuleKey>>(new Set());

  const toggle = (key: ModuleKey, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  /*
    Årsbetalning erbjuds bara när ALLA priser finns hos betaltjänsten. Saknas
    ett av dem skulle växeln kunna visa en summa där den ena posten räknas per
    år och den andra per månad.
  */
  const yearlyOffered =
    pricing.year !== null &&
    MODULE_KEYS.every((key) => modules[key].year !== null);

  const [yearly, setYearly] = useState(false);
  const perYear = yearly && yearlyOffered;

  const moduleTotal = [...picked].reduce(
    (sum, key) =>
      sum + (perYear ? (modules[key].year ?? 0) : modules[key].month),
    0
  );

  const total =
    (perYear ? screens * (pricing.year ?? 0) : screens * pricing.month) +
    moduleTotal;

  const step = (delta: number) =>
    setScreens((current) => Math.min(MAX_SCREENS, Math.max(1, current + delta)));

  return (
    <div className="border-t border-neutral-200 bg-white p-7 sm:p-10">
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div className="flex flex-wrap items-end gap-8">
          {/* Skärmar */}
          <div>
            <Label htmlFor="kalkyl-skarmar">Skärmar</Label>
            <div className="mt-3 flex items-center gap-1">
              <Step onClick={() => step(-1)} disabled={screens <= 1} label="En skärm färre">
                <path d="M5 10h10" />
              </Step>
              {/*
                Ett utskrivet tal och inget nummerfält. Ett fält bjuder in till
                att skriva, och då måste tomma strängar, bokstäver och minustecken
                hanteras — för ett värde som nästan alltid är ett ensiffrigt tal
                man trycker sig till på två sekunder.
              */}
              <output
                id="kalkyl-skarmar"
                aria-live="polite"
                className="w-10 text-center text-[20px] font-semibold tabular-nums text-neutral-900"
              >
                {screens}
              </output>
              <Step
                onClick={() => step(1)}
                disabled={screens >= MAX_SCREENS}
                label="En skärm till"
              >
                <path d="M10 5v10M5 10h10" />
              </Step>
            </div>
          </div>

          {/* Tillval */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Tillval
            </p>
            <div className="mt-3 space-y-1">
              {MODULE_KEYS.map((key) => (
                <label
                  key={key}
                  htmlFor={`kalkyl-${key.toLowerCase()}`}
                  className="flex cursor-pointer items-center gap-2.5"
                >
                  <input
                    id={`kalkyl-${key.toLowerCase()}`}
                    type="checkbox"
                    checked={picked.has(key)}
                    onChange={(event) => toggle(key, event.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span className="text-[14px] text-neutral-900">
                    {MODULES[key].name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Betalning */}
          {yearlyOffered && (
            <div>
              <p
                id="kalkyl-betalning"
                className="text-[11px] font-medium uppercase tracking-wider text-neutral-500"
              >
                Betalning
              </p>
              <div
                role="group"
                aria-labelledby="kalkyl-betalning"
                className="mt-3 inline-flex rounded-md border border-neutral-200 p-0.5"
              >
                <Choice selected={!yearly} onClick={() => setYearly(false)}>
                  Månad
                </Choice>
                <Choice selected={yearly} onClick={() => setYearly(true)}>
                  År
                </Choice>
              </div>
            </div>
          )}
        </div>

        {/* Summan */}
        <p aria-live="polite" className="text-right">
          <span className="block text-[32px] font-semibold leading-none tracking-tight tabular-nums text-neutral-900">
            {kr(total)} kr
          </span>
          <span className="mt-2 block text-[13px] text-neutral-500">
            per {perYear ? "år" : "månad"}, exklusive moms
          </span>
        </p>
      </div>
    </div>
  );
}

function Label({ children, htmlFor }: { children: string; htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-medium uppercase tracking-wider text-neutral-500"
    >
      {children}
    </label>
  );
}

/** Plus och minus. Fyrtio pixlar, så att de går att träffa på en telefon. */
function Step({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-white"
    >
      <svg
        viewBox="0 0 20 20"
        width={18}
        height={18}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

function Choice({
  children,
  selected,
  onClick,
}: {
  children: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
        selected
          ? "bg-neutral-900 text-white"
          : "text-neutral-600 hover:text-neutral-900"
      }`}
    >
      {children}
    </button>
  );
}
