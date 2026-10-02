"use client";

import { useEffect, useState } from "react";
import { KioskCard, KioskChrome, type KioskPerson } from "./Mockups";

/**
 * STÄMPLINGSSKÄRMEN, MEN LEVANDE.
 *
 * Med några sekunders mellanrum stämplar någon in eller ut. Poängen är inte
 * effekten utan att visa vad produkten gör: en besökare som tittar i tio
 * sekunder har sett flödet utan att läsa en enda rad text.
 *
 * INGEN TIDRÄKNARE. Namnknappen visar vad personen är instämplad på, inte hur
 * länge. Så ser skärmen ut, och hur länge ett jobb pågått står i panelen.
 *
 * Utgångsläget är hårdkodat och identiskt med det servern renderar. Startade
 * rörelsen direkt skulle det som ritas i webbläsaren skilja sig från det
 * servern skickade, och React klagar med rätta på det.
 */

const START: KioskPerson[] = [
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

/** Jobbet var och en går till när de stämplar in. */
const JOBS = [
  "2602 · Montering",
  "2605 · Kapning",
  "2601 · Svetsning",
  "2603 · Kapning",
  "2604 · Fräsning",
  "2603 · Lackering",
  "2601 · Montering",
  "2605 · Svetsning",
  "2602 · Slipning",
];

/** Ordningen någon stämplar in eller ut i. Går runt. */
const SEQUENCE = [1, 4, 3, 0, 7, 2, 8, 5, 6];

/** Hur ofta någon byter läge. Långsamt nog att hinna läsas. */
const STEP_MS = 3200;

export default function LiveKiosk() {
  const [people, setPeople] = useState<KioskPerson[]>(START);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPeople((current) => {
        const index = SEQUENCE[step % SEQUENCE.length];

        return current.map((person, position) =>
          position === index
            ? person.job === null
              ? { ...person, job: JOBS[index] }
              : { ...person, job: null, last: person.job }
            : person
        );
      });

      setStep((value) => value + 1);
    }, STEP_MS);

    return () => clearInterval(timer);
  }, [step]);

  return (
    <div>
      <KioskChrome />

      {/* Tre kolumner, som på en liggande skärm i verkstaden. Två på en
          telefon, där bilden ändå bara ska visa vad det är. */}
      <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-2.5 sm:grid-cols-3">
        {people.map((person) => (
          <div key={person.name} className="transition-opacity duration-500">
            <KioskCard person={person} size="stor" />
          </div>
        ))}
      </div>
    </div>
  );
}
