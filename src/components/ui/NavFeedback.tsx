"use client";

import { useLinkStatus } from "next/link";
import { useEffect, useState } from "react";

/**
 * MENYNS SVAR PÅ ETT KLICK (2026-10-20).
 *
 * Delas av kundpanelens och plattformspanelens meny, så att de två svarar
 * likadant och inte glider isär.
 *
 * Markeringen följde adressen, och adressen byts först när servern svarat.
 * Under tiden stod den gamla punkten markerad, och ett klick såg ut att inte
 * ha tagit. Nu markeras den klickade punkten direkt, och pricken säger att
 * sidan hämtas.
 */

/**
 * Den klickade länken, tills adressen bytts.
 *
 * `follow(href, after)` ges till länkens `onClick`. Ctrl- och Cmd-klick
 * öppnar en ny flik; den här fliken står kvar där den var, och markeringen
 * gör det också.
 */
export function useClickedLink(pathname: string) {
  const [clicked, setClicked] = useState<string | null>(null);
  useEffect(() => setClicked(null), [pathname]);

  const follow =
    (href: string, after?: () => void) => (event: React.MouseEvent) => {
      after?.();

      const newTab =
        event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
      if (!newTab) setClicked(href);
    };

  return { clicked, follow };
}

/**
 * Pricken som säger att sidan hämtas. Ska stå inuti en `<Link>`.
 *
 * Syns först efter en stund (`skeleton-delay`), så att en sida som svarar
 * direkt inte blinkar förbi en prick. Grön, eftersom grönt är "pågår just nu".
 */
export function PendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden
      className="skeleton-delay size-1.5 shrink-0 rounded-full bg-tick-deep"
    />
  );
}
