"use client";

import { useEffect, useState } from "react";
import { KioskCard, KioskChrome, PEOPLE, type KioskPerson } from "./Mockups";

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
 * UTGÅNGSLÄGET ÄR `PEOPLE` OCH INTE EN EGEN LISTA. Filen bar länge en kopia
 * med samma nio namn, och de två hann börja säga olika saker: rutnätet längre
 * ned på sidan visade rast och improduktiv tid, hero gjorde det inte. Samma
 * verkstad ska se likadan ut varhelst den visas.
 *
 * RAST OCH IMPRODUKTIV TID RÖRS INTE AV RÖRELSEN. En rast avslutar alla jobb i
 * produkten, så att ge en rastande person ett jobb vore ett läge som inte kan
 * inträffa. Den som städar lämnas också i fred: improduktiv tid väljs i en egen
 * vy, och en slinga som stämplar in folk på ordrar ska inte flytta dem dit.
 *
 * Utgångsläget är hårdkodat och identiskt med det servern renderar. Startade
 * rörelsen direkt skulle det som ritas i webbläsaren skilja sig från det
 * servern skickade, och React klagar med rätta på det.
 */

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

/** Personen står still: hen är på rast eller på improduktiv tid. */
function fixed(person: KioskPerson): boolean {
  return Boolean(person.onBreak) || Boolean(person.indirect);
}

export default function LiveKiosk() {
  const [people, setPeople] = useState<KioskPerson[]>(PEOPLE);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPeople((current) => {
        const index = SEQUENCE[step % SEQUENCE.length];
        const person = current[index];
        if (fixed(person)) return current;

        return current.map((each, position) => {
          if (position !== index) return each;

          // Instämplad: ut från allt, och det sista jobbet blir "Senast".
          if (each.job !== null) {
            return { ...each, job: null, alsoJob: undefined, last: each.job };
          }

          return { ...each, job: JOBS[index] };
        });
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
