"use client";

import { useEffect, useRef } from "react";

/**
 * HUR LÅNGT NED PÅ SIDAN MAN HAR KOMMIT.
 *
 * En grön hårlinje längst ned i den fastnitade menyn, som växer från vänster
 * medan man skrollar. Säljsidan är lång — tio avsnitt — och rullningslisten
 * svarar på samma fråga, men den är fem pixlar bred i kanten av skärmen och
 * finns inte alls på en surfplatta.
 *
 * Grönt betyder "pågår just nu" i hela produkten, och en läsning som pågår är
 * precis vad linjen visar.
 *
 * VARFÖR `scaleX` OCH INTE `width`. En bredd som ändras tvingar webbläsaren
 * att räkna om sidans layout vid varje bildruta, alltså hela vägen ned genom
 * en sida med tio avsnitt och åtta produktbilder. En `transform` flyttas på
 * grafikkortet och rör ingenting annat. Samma regel som resten av sidans
 * rörelse följer, se globals.css.
 *
 * `transform-origin: left` gör att den växer från vänster i stället för från
 * mitten.
 *
 * STÄNGS AV VID MINSKAD RÖRELSE. Linjen är i praktiken en animation som pågår
 * så länge man läser, och den som valt bort rörelse har valt bort just det.
 * Rullningslisten står kvar och svarar på samma fråga.
 *
 * Utan JavaScript syns ingen linje. Den bär ingen information som inte finns
 * någon annanstans, så ingenting går förlorat.
 */
export default function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    const write = () => {
      frame = 0;

      const doc = document.documentElement;
      // Hur mycket det FINNS att skrolla. Är sidan kortare än fönstret är det
      // noll, och en division med noll ger NaN — vilket blir en linje som
      // ligger kvar full bredd över en sida utan rullning.
      const travel = doc.scrollHeight - window.innerHeight;
      const share = travel > 0 ? Math.min(1, window.scrollY / travel) : 0;

      element.style.transform = `scaleX(${share.toFixed(4)})`;
    };

    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(write);
    };

    // Skrivs en gång vid uppkopplingen. Den som kommer tillbaka till sidan med
    // bakåtknappen landar där hen var, och linjen ska stämma redan då.
    write();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden"
    >
      <div
        ref={ref}
        className="h-px origin-left scale-x-0 bg-linear-to-r from-tick-deep via-tick to-tick"
      />
    </div>
  );
}
