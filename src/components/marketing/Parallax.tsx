"use client";

import { useEffect, useRef } from "react";

/**
 * LAGREN SOM FÖLJER PEKAREN.
 *
 * Hero har fyra lager på olika djup: ljuset längst bak, stämplingsskärmen i
 * mitten, och två kort framför den. Rör man musen över ytan flyttar de sig
 * olika mycket — bakgrunden knappt, de främsta korten mest. Det är enda sättet
 * att få en platt skärm att läsas som ett rum, och det är hela skillnaden
 * mellan en bild av en produkt och en produkt som ligger på ett bord.
 *
 * VARFÖR CSS-VARIABLER OCH INTE REACT-TILLSTÅND. En musrörelse ger upp mot
 * sextio händelser i sekunden. Lades positionen i ett tillstånd skulle React
 * rita om hela hero sextio gånger i sekunden, och på en enklare maskin hinner
 * det inte. Här skrivs två tal på ett element, webbläsaren räknar om en
 * `transform` på grafikkortet, och React får aldrig veta att något hänt.
 *
 * VARFÖR `requestAnimationFrame`. Webbläsaren skickar musrörelser oftare än
 * den ritar. Utan den här raden skrivs variabeln flera gånger mellan två
 * bildrutor, och allt utom det sista skrivandet är bortkastat arbete.
 *
 * TRE FALL DÄR RÖRELSEN INTE FINNS, och alla tre är avsiktliga:
 *
 *  - `prefers-reduced-motion: reduce`. En animation som inte går att stänga av
 *    är ett tillgänglighetsproblem, inte en effekt. Samma hållning som i
 *    `Reveal.tsx`.
 *  - `pointer: coarse`. En telefon har ingen pekare som vilar någonstans, och
 *    en surfplatta i en verkstad ännu mindre. Rörelsen kopplas aldrig på där.
 *  - Utan JavaScript. Variablerna har sitt värde i `globals.css`, så lagren
 *    står på sin plats och bilden är densamma. Ingenting går förlorat.
 *
 * Lagren själva är vanliga element med klassen `parallax-layer` och ett djup i
 * `--parallax-depth`. De behöver inte vara barn till den här komponenten i
 * trädet, bara ligga inuti den i DOM:en — variabeln ärvs.
 */

/**
 * Hur många pixlar det djupaste lagret flyttar sig som mest.
 *
 * Tolv är med flit lågt. Hela poängen är att man inte ska se att något rör
 * sig, bara att ytan har djup; en rörelse på femtio pixlar blir en leksak och
 * gör dessutom texten svår att läsa medan den pågår.
 */
const RANGE = 12;

export default function Parallax({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Båda frågorna ställs en gång, vid uppkopplingen. En maskin byter inte
    // pekare mitt i ett besök, och den som ändrar sin systeminställning för
    // rörelse laddar om sidan.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (still || coarse) return;

    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const write = () => {
      frame = 0;
      if (!pending) return;

      element.style.setProperty("--parallax-x", pending.x.toFixed(2));
      element.style.setProperty("--parallax-y", pending.y.toFixed(2));
      pending = null;
    };

    const onMove = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();

      // Pekarens läge som −1 till 1 från mitten, så att varje lager kan
      // multiplicera med sitt eget djup och få rätt riktning av sig själv.
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;

      // Minustecknet: lagren flyttar sig MOT pekaren. Det är så ett föremål
      // bakom ett fönster beter sig när man flyttar huvudet, och åt andra
      // hållet ser det ut som att bilden skjuts undan.
      pending = { x: -x * RANGE, y: -y * RANGE };

      if (frame === 0) frame = requestAnimationFrame(write);
    };

    // Lagren går tillbaka till mitten när pekaren lämnar ytan. Utan det står
    // de kvar i sitt sista läge, vilket ser ut som att sidan hängt sig.
    const onLeave = () => {
      pending = { x: 0, y: 0 };
      if (frame === 0) frame = requestAnimationFrame(write);
    };

    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", onLeave);

    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", onLeave);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
