"use client";

import { useEffect, useRef } from "react";

/**
 * LADDAR OM PANELEN EFTER EN DRIFTSÄTTNING.
 *
 * En flik som stått öppen över en uppdatering har kvar den gamla versionens
 * kod. Server Actions identifieras med ett id som räknas fram ur bygget, så
 * varje knapp i den fliken skickar ett id den nya servern inte känner igen och
 * svaret blir "Failed to find Server Action". För den som sitter framför
 * skärmen ser det ut som att spara-knappen slutat fungera.
 *
 * Två saker är medvetna:
 *
 * 1. **Aldrig medan någon skriver.** Ligger fokus i ett fält väntar
 *    omladdningen till nästa kontroll. Att kasta bort en halvskriven
 *    anteckning för att servern startat om vore ett sämre fel än det vi löser.
 *
 * 2. **Bara panelerna.** Stämplingsskärmen har den INTE. Där kan en omladdning
 *    komma mitt i ett tryck, och kioskens egen kö gör dessutom att ett gammalt
 *    gränssnitt fortsätter fungera.
 */

/** Hur ofta servern tillfrågas. Sällan — det här är inget som brådskar. */
const INTERVAL_MS = 60_000;

export default function ReloadOnDeploy() {
  const known = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;

    async function check() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;

        const { instance } = (await response.json()) as { instance: string };
        if (stopped || !instance) return;

        if (known.current === null) {
          known.current = instance;
          return;
        }

        if (known.current === instance) return;

        // Skriver någon just nu får omladdningen vänta till nästa varv.
        const focused = document.activeElement;
        const typing =
          focused instanceof HTMLInputElement ||
          focused instanceof HTMLTextAreaElement ||
          (focused instanceof HTMLElement && focused.isContentEditable);

        if (typing) return;

        window.location.reload();
      } catch {
        // Nätet är nere eller servern startar om. Nästa kontroll får svara.
      }
    }

    void check();
    const timer = setInterval(() => void check(), INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return null;
}
