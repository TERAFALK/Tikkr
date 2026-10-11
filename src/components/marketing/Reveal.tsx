"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tonar in innehåll när det kommer in i bild.
 *
 * Använder webbläsarens egen bevakare istället för att lyssna på varje
 * skrollning — den senare kör kod hundratals gånger i sekunden och gör sidan
 * hackig på just de enklare enheter en verkstad brukar ha.
 *
 * Elementet visas direkt om webbläsaren saknar stödet, och all rörelse stängs
 * av för den som valt minskad rörelse i sitt system. En animation som inte går
 * att stänga av är ett tillgänglighetsproblem, inte en effekt.
 *
 * TVÅ LÄGEN, OCH VALET ÄR INNEHÅLLETS.
 *
 *  - `rise` är textens. Tjugo pixlar och ingenting mer. En rubrik man läser
 *    ska stå still när blicken når den.
 *  - `soft` är produktbildernas. Fyrtio pixlar och en knapp förminskning, så
 *    att bilden kommer fram mot läsaren i stället för att glida upp.
 *
 * Lägena ligger som KLASSER i `globals.css` och inte som inline-stilar här.
 * Skälet är `prefers-reduced-motion`: en inline-stil kan ingen mediafråga nå,
 * och varje läge hade då behövt ett eget undantag i JavaScript, som dessutom
 * bara hade gällt den som har JavaScript.
 */

export type RevealVariant = "rise" | "soft";

export default function Reveal({
  children,
  delay = 0,
  variant = "rise",
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  variant?: RevealVariant;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          // Slutar bevaka direkt. Innehållet ska tonas in en gång, inte varje
          // gång man skrollar förbi det.
          observer.disconnect();
        }
      },
      // Startar strax innan elementet nått kanten, så rörelsen hinner kännas
      // färdig när man läser.
      { rootMargin: "0px 0px -12% 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${
        visible ? "reveal-shown" : `reveal-${variant}`
      } ${className}`}
    >
      {children}
    </div>
  );
}
