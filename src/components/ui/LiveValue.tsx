"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * ETT TAL SOM LYSER UPP NÄR DET ÄNDRATS (2026-10-20).
 *
 * För tal som uppdateras medan sidan står öppen, som översiktens. Utan en
 * signal går en ändring att missa: "Att granska" går från 2 till 3 och ser
 * likadan ut som förut. Talet tonar i accenten och tillbaka, se
 * `.animate-value` i globals.css.
 *
 * Aldrig vid första visningen: då har ingenting ändrats, och en sida där
 * varje tal blinkar när den öppnas säger ingenting.
 */
export default function LiveValue({
  value,
  children,
}: {
  /** Det som jämförs. Talet självt, oformaterat. */
  value: string | number;
  /** Det som visas. Utelämnat visas `value`. */
  children?: ReactNode;
}) {
  const previous = useRef(value);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setChanges((count) => count + 1);
  }, [value]);

  // Nyckeln byts vid varje ändring, så att animationen spelas om även när
  // samma tal ändras två gånger i rad.
  return (
    <span key={changes} className={changes > 0 ? "animate-value" : undefined}>
      {children ?? value}
    </span>
  );
}
