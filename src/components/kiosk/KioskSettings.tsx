"use client";

import { useRef, useState } from "react";
import { unpairThisDevice } from "@/app/kiosk/actions";

/**
 * KUGGHJULET PÅ STÄMPLINGSSKÄRMEN.
 *
 * Tre saker, i den ordning de behövs vid ett supportsamtal:
 *
 * 1. **Driftinformation.** Vilken skärm det är, hur många tryck som väntar i
 *    kön och när den senast nådde servern. Det är precis vad som behöver
 *    frågas när någon ringer och säger att skärmen inte fungerar — och det som
 *    annars kräver att någon läser en logg.
 *
 * 2. **Ladda om.** Löser det vanligaste problemet. I kiosk-läge finns ingen
 *    adressrad och inga knappar, så utan den här är enda utvägen att stänga av
 *    surfplattan.
 *
 * 3. **Koppla loss.** Bakom en bekräftelse, eftersom den som trycker fel
 *    annars gör skärmen oanvändbar tills någon hämtar en ny kod.
 *
 * Knappen är liten och dämpad men inte gömd. Den som letar efter den ska hitta
 * den; den som stämplar ska inte råka trycka på den.
 */
export default function KioskSettings({
  deviceName,
  companyName,
  waiting,
  lastSyncedAt,
}: {
  deviceName: string;
  companyName: string;
  /** Antal tryck som ligger i kön och ännu inte nått servern. */
  waiting: number;
  /** När skärmen senast fick svar från servern. */
  lastSyncedAt: Date | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        onClick={() => {
          setConfirming(false);
          dialog.current?.showModal();
        }}
        aria-label="Inställningar"
        className="shrink-0 rounded-lg p-2 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <dialog
        ref={dialog}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/50"
      >
        <div className="border-b border-neutral-200 px-6 py-5">
          <h2 className="text-lg font-semibold text-neutral-900">
            Om den här skärmen
          </h2>
        </div>

        <dl className="divide-y divide-neutral-100 px-6 text-[15px]">
          <Row label="Skärm" value={deviceName} />
          <Row label="Företag" value={companyName} />
          <Row
            label="Väntar på att skickas"
            value={
              waiting === 0
                ? "Inget"
                : `${waiting} ${waiting === 1 ? "stämpling" : "stämplingar"}`
            }
            tone={waiting > 0 ? "warning" : "normal"}
          />
          <Row
            label="Senaste kontakt med servern"
            value={
              lastSyncedAt
                ? lastSyncedAt.toLocaleTimeString("sv-SE", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "Ingen ännu"
            }
            tone={lastSyncedAt ? "normal" : "warning"}
          />
        </dl>

        <div className="space-y-2 px-6 py-5">
          <button
            onClick={() => window.location.reload()}
            className="kiosk-press w-full rounded-xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white active:bg-blue-700"
          >
            Ladda om skärmen
          </button>

          {confirming ? (
            <form action={unpairThisDevice} className="space-y-2">
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-[15px] leading-relaxed text-amber-900">
                Skärmen slutar fungera och behöver en ny kod från adminpanelen.
                Registrerad tid påverkas inte.
              </p>
              <button
                type="submit"
                className="kiosk-press w-full rounded-xl bg-amber-500 px-6 py-4 text-lg font-semibold text-white active:bg-amber-600"
              >
                Ja, koppla loss
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="kiosk-press w-full rounded-xl border border-neutral-200 px-6 py-4 text-lg font-semibold text-neutral-600"
              >
                Avbryt
              </button>
            </form>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="kiosk-press w-full rounded-xl border border-neutral-200 px-6 py-4 text-lg font-semibold text-neutral-600"
            >
              Koppla loss skärmen
            </button>
          )}

          <button
            onClick={() => dialog.current?.close()}
            className="kiosk-press w-full rounded-xl px-6 py-4 text-lg font-medium text-neutral-500"
          >
            Stäng
          </button>
        </div>
      </dialog>
    </>
  );
}

function Row({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "warning";
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd
        className={`text-right font-medium ${
          tone === "warning" ? "text-amber-700" : "text-neutral-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
