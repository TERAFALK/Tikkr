"use client";

import { useEffect, useState } from "react";

/**
 * Kioskbilden, men levande.
 *
 * Var fjärde sekund stämplar någon in eller ut, och tiden på pågående jobb
 * räknas uppåt. Poängen är inte effekten utan att visa vad produkten gör:
 * en besökare som tittar i tio sekunder har sett hela flödet utan att läsa
 * en enda rad text.
 *
 * Utgångsläget är hårdkodat och identiskt med det servern renderar. Startade
 * animationen direkt skulle det som ritas i webbläsaren skilja sig från det
 * servern skickade, och React klagar med rätta på det.
 */

interface Person {
  name: string;
  order: string;
  moment: string;
  /** Minuter jobbet pågått. null betyder utstämplad. */
  minutes: number | null;
}

const START: Person[] = [
  { name: "Anna Andersson", order: "2601", moment: "Svetsning", minutes: 135 },
  { name: "Björn Bergqvist", order: "2602", moment: "Montering", minutes: null },
  { name: "Carina Cederlund", order: "2603", moment: "Montering", minutes: 48 },
  { name: "David Dahl", order: "2601", moment: "Lackering", minutes: null },
  { name: "Erik Ek", order: "2601", moment: "Fräsning", minutes: 302 },
  { name: "Frida Falk", order: "2603", moment: "Kapning", minutes: null },
];

/** Ordningen någon stämplar in eller ut i. Går runt. */
const SEQUENCE = [1, 3, 0, 5, 2, 4];

function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return `${hours} tim ${String(rest).padStart(2, "0")} min`;
}

export default function LiveKiosk({ className = "" }: { className?: string }) {
  const [people, setPeople] = useState<Person[]>(START);
  const [step, setStep] = useState(0);

  // Tiden räknas upp. Snabbare än verkligheten — en minut per sekund — så att
  // rörelsen märks under de sekunder någon faktiskt tittar.
  useEffect(() => {
    const timer = setInterval(() => {
      setPeople((current) =>
        current.map((person) =>
          person.minutes === null
            ? person
            : { ...person, minutes: person.minutes + 1 }
        )
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Någon stämplar in eller ut.
  useEffect(() => {
    const timer = setInterval(() => {
      setPeople((current) => {
        const index = SEQUENCE[step % SEQUENCE.length];
        return current.map((person, position) =>
          position === index
            ? { ...person, minutes: person.minutes === null ? 0 : null }
            : person
        );
      });
      setStep((value) => value + 1);
    }, 4000);

    return () => clearInterval(timer);
  }, [step]);

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
        <span className="text-[11px] text-neutral-400">Stämplingsskärmen</span>
      </div>

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
        {people.map((person) => {
          const working = person.minutes !== null;

          return (
            <div
              key={person.name}
              className={`rounded-lg border p-3 transition-colors duration-500 ${
                working
                  ? "border-emerald-600 bg-emerald-600"
                  : "border-neutral-200 bg-white"
              }`}
            >
              <span
                className={`block text-[13px] font-semibold leading-tight transition-colors duration-500 ${
                  working ? "text-white" : "text-neutral-900"
                }`}
              >
                {person.name}
              </span>

              {working ? (
                <>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white ring-1 ring-inset ring-white/25">
                    <span className="animate-breathe h-1.5 w-1.5 rounded-full bg-white" />
                    {formatMinutes(person.minutes!)}
                  </span>
                  <span className="mt-1 block truncate text-[10px] text-white/80">
                    {person.order} · {person.moment}
                  </span>
                </>
              ) : (
                <span className="mt-2 block text-[10px] text-neutral-400">
                  Ej instämplad
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
