"use client";

import { useEffect } from "react";

/**
 * VAD SKÄRMEN VISAR NÄR SERVERN INTE SVARAR.
 *
 * Utan den här filen möts verkstaden av ramverkets egen felsida: en vit yta med
 * engelsk text och ett spårnings-id. Den ser ut som att systemet gått sönder,
 * och den som står framför den ringer chefen i stället för att vänta en minut.
 *
 * Vanligaste orsaken är att databasen startar om — vid en uppdatering tar det
 * några sekunder. Sidan försöker därför själv igen, med jämna mellanrum, och
 * säger under tiden det enda som är värt att veta: att ingen registrerad tid
 * har gått förlorad.
 *
 * Stämplingar som gjorts men inte hunnit skickas ligger kvar i skärmens egen
 * kö och går fram när servern svarar igen. Det är hela poängen med kön.
 */

const RETRY_MS = 5_000;

export default function KioskError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hamnar i webbläsarens logg, inte på skärmen. Den som står i verkstaden
    // har ingen nytta av ett felmeddelande de inte kan göra något åt.
    console.error("Kioskskärmen kunde inte laddas", error);
  }, [error]);

  useEffect(() => {
    const timer = setInterval(reset, RETRY_MS);
    return () => clearInterval(timer);
  }, [reset]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-8">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <span className="animate-breathe h-3 w-3 rounded-full bg-amber-500" />
        </div>

        <h1 className="text-3xl font-semibold text-neutral-900">
          Ingen kontakt med servern
        </h1>

        <p className="mt-4 text-lg leading-relaxed text-neutral-600">
          Skärmen försöker igen automatiskt. Ingen registrerad tid har gått
          förlorad.
        </p>

        <button
          onClick={reset}
          className="kiosk-press mt-8 rounded-xl bg-blue-600 px-8 py-4 text-xl font-semibold text-white active:bg-blue-700"
        >
          Försök nu
        </button>

        <p className="mt-6 text-sm text-neutral-400">
          Står detta kvar i mer än några minuter — kontakta er administratör.
        </p>
      </div>
    </main>
  );
}
