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
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
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
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-5 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100"
      } ${className}`}
    >
      {children}
    </div>
  );
}
