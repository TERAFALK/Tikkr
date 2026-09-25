"use client";

import { useEffect, useState } from "react";

/**
 * MEDDELANDET SOM SÄGER ATT EN ÄNDRING NEKADES.
 *
 * Nere till höger, som ett vanligt meddelande — inte en egen sida och inte
 * ramverkets felsida. Ingenting gick sönder: systemet gjorde precis det det
 * skulle, och då ska svaret rymmas på en rad utan att flytta någon.
 *
 * Servern har redan skickat tillbaka till sidan man kom ifrån och satt en
 * flagga i en cookie. Den här komponenten visar meddelandet och SLÄNGER
 * FLAGGAN, så att den inte dyker upp igen vid nästa sidladdning.
 *
 * Flaggan slängs i webbläsaren och inte på servern, eftersom en cookie bara går
 * att ta bort i en åtgärd eller en route — aldrig under en rendering. Att låta
 * den självdö på trettio sekunder räckte inte: en snabb klickare hade fått
 * samma meddelande två gånger.
 */

const COOKIE = "tikkr_nekad";
const VISIBLE_MS = 6_000;

export default function ReadOnlyToast({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (!show) return;

    // Max-Age=0 tar bort den. Samma path som när den sattes, annars lämnas en
    // kopia kvar som dyker upp igen.
    document.cookie = `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;

    setVisible(true);
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [show]);

  if (!visible) return null;

  return (
    <div
      // aria-live gör att en skärmläsare läser upp beskedet. Utan den vore
      // meddelandet osynligt för den som inte ser skärmen, och den enda
      // återkopplingen vore att sidan såg oförändrad ut.
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-red-200 bg-white px-4 py-3 shadow-lg"
    >
      <p className="text-[13px] font-medium text-red-900">
        Ändringen sparades inte
      </p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-red-800">
        Supportläget får bara läsa. Be kunden göra ändringen själva, eller logga
        in som dem med deras medgivande.
      </p>

      <button
        onClick={() => setVisible(false)}
        className="mt-2 text-[13px] font-medium text-red-700 underline underline-offset-2 hover:text-red-900"
      >
        Stäng
      </button>
    </div>
  );
}
