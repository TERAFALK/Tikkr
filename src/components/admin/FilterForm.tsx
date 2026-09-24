"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * FILTERFORMULÄR SOM TILLÄMPAS DIREKT.
 *
 * Ett vanligt GET-formulär gör ingenting förrän man trycker på knappen. Väljer
 * man "Summerat per anställd" och läser vidare står det fortfarande kvar en
 * rapport som visar något annat än det väljaren säger — och den felläsningen
 * går ut som ett underlag.
 *
 * Nu skickas formuläret så fort ett fält ändras, och sidan visar alltid det
 * som står i filtren.
 *
 * Lyssnar på webbläsarens `change` och inte på Reacts `onChange`. Skillnaden
 * spelar roll för datumfälten: `change` kommer när värdet är färdigt, medan
 * Reacts variant är knuten till `input` och kan komma mitt i ett halvskrivet
 * datum. Ett filter som laddar om medan man skriver är värre än ett som inte
 * laddar om alls.
 *
 * Knappen "Visa" finns kvar. Den behövs inte längre, men är vad formuläret
 * faller tillbaka på om JavaScript inte kört — och då ska filtren fortfarande
 * gå att använda.
 */
export default function FilterForm({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const element = form.current;
    if (!element) return;

    const submit = () => element.requestSubmit();

    element.addEventListener("change", submit);
    return () => element.removeEventListener("change", submit);
  }, []);

  return (
    <form ref={form} className={className}>
      {children}
    </form>
  );
}
