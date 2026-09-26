"use client";

import { useEffect } from "react";

/**
 * VAD ADMINPANELEN VISAR NÄR NÅGOT GÅR SÖNDER.
 *
 * Utan den här filen möts man av ramverkets egen felsida: "Application error: a
 * server-side exception has occurred", på engelska, med ett spårnings-id och
 * inget mer. Den säger varken vad som hände, om något sparades, eller vad man
 * ska göra — och den ser likadan ut om databasen startar om som om det finns en
 * bugg.
 *
 * Panelen saknade den. Kiosken hade en från början, av samma skäl: den som
 * arbetar ska inte behöva tolka ett stackspår.
 *
 * TVÅ SAKER SOM STÅR HÄR OCH INTE I RAMVERKETS SIDA:
 *
 *   1. Att en halvfärdig ändring inte blivit halvt sparad. Det är den första
 *      frågan man har, och svaret är nästan alltid nej — en åtgärd som faller
 *      skriver ingenting.
 *   2. Spårnings-id:t, men som en detalj längst ner och inte som huvudsaken.
 *      Det behövs bara när någon ska leta i serverloggen.
 *
 * Väntade nekanden hör INTE hit. Ett supportbesök som försöker spara skickas
 * tillbaka till sidan det kom ifrån och får ett meddelande nere till höger — se
 * assertWritable och ReadOnlyToast. Systemet gjorde då precis det det skulle.
 * Den här sidan är för det som faktiskt gick fel.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Adminpanelen kunde inte laddas", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-neutral-900">
          Något gick fel
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Sidan kunde inte visas. Ingen halvfärdig ändring har sparats.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Försök igen. Står det kvar beror det oftast på att servern startar om,
          och då räcker det att vänta en minut.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-700"
          >
            Försök igen
          </button>
          <a
            href="/admin"
            className="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 ring-1 ring-inset ring-neutral-200 transition-colors hover:bg-neutral-50"
          >
            Till översikten
          </a>
        </div>

        {error.digest && (
          <p className="mt-5 border-t border-neutral-100 pt-4 text-xs text-neutral-400">
            Referens för felsökning: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
