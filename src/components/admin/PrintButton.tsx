"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { IconPrinter } from "@/components/ui/icons";

/**
 * SKRIV UT, UTAN OMVÄGEN VIA NEDLADDNINGSMAPPEN.
 *
 * Kunden skriver ut efterkalkyler varje vecka. Innan fanns bara nedladdning:
 * spara filen, leta rätt på den, öppna den, skriva ut, och sedan rensa
 * mappen. Fyra steg för ett papper.
 *
 * Så här går det till i stället: dokumentet laddas i en dold ram, och när det
 * ligger där ber vi webbläsaren skriva ut ramen. Skrivardialogen kommer upp
 * med rätt dokument, och ingen fil hamnar på datorn.
 *
 * Dokumentet måste då lämnas ut för VISNING och inte som nedladdning, annars
 * hamnar det i nedladdningsmappen i stället för i ramen. Det är vad `visa=1`
 * gör i exportrutten, och därför sätter den här komponenten parametern själv i
 * stället för att lita på att varje anropsplats kommer ihåg den.
 *
 * RESERVVÄGEN ÄR EN FLIK. Går utskriften inte att starta öppnas dokumentet i
 * en ny flik, där webbläsarens egen skrivarknapp finns. En knapp som inte gör
 * någonting alls är det enda utfall som inte får inträffa.
 */

/** Hur länge vi väntar på att dokumentet ska ligga i ramen. */
const TIMEOUT_MS = 20000;

export default function PrintButton({
  href,
  label = "Skriv ut",
  tone = "secondary",
  variant = "button",
  description,
  disabled = false,
  onPrint,
}: {
  /** Adressen till dokumentet. Parametern visa=1 läggs till här. */
  href: string;
  label?: string;
  tone?: "primary" | "secondary" | "ghost";
  /** "menu" ritar raden som ett menyval, som länkarna i ordermenyn. */
  variant?: "button" | "menu";
  /** Undertext i menyläget. */
  description?: string;
  disabled?: boolean;
  /** Körs när utskriften startats. Används för att stänga menyn. */
  onPrint?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement | null>(null);

  function printUrl(): string {
    return href.includes("?") ? `${href}&visa=1` : `${href}?visa=1`;
  }

  function fallback() {
    window.open(printUrl(), "_blank", "noopener");
  }

  function start() {
    if (busy || disabled) return;
    setBusy(true);
    onPrint?.();

    // Ramen ligger kvar tills nästa utskrift. Tas den bort direkt efter
    // print() hinner Chrome inte rendera förhandsvisningen, och dialogen
    // öppnas tom.
    frame.current?.remove();

    const element = document.createElement("iframe");
    element.setAttribute("aria-hidden", "true");
    element.style.position = "fixed";
    element.style.right = "0";
    element.style.bottom = "0";
    element.style.width = "1px";
    element.style.height = "1px";
    element.style.opacity = "0";
    element.style.border = "0";

    let settled = false;

    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      setBusy(false);
      if (!ok) fallback();
    };

    element.onload = () => {
      // En kort paus innan utskriften. Ramen säger "laddad" så fort
      // dokumentet kommit, men webbläsarens PDF-visare behöver ett ögonblick
      // till innan den kan skriva ut — utan pausen kommer dialogen ibland upp
      // tom.
      window.setTimeout(() => {
        try {
          element.contentWindow?.focus();
          element.contentWindow?.print();
          done(true);
        } catch {
          done(false);
        }
      }, 150);
    };

    element.onerror = () => done(false);

    // Laddas dokumentet aldrig blir knappen annars stående på "Förbereder".
    window.setTimeout(() => done(false), TIMEOUT_MS);

    element.src = printUrl();
    document.body.appendChild(element);
    frame.current = element;
  }

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled || busy}
        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="mt-0.5 text-neutral-400">
          <IconPrinter />
        </span>
        <span>
          <span className="block text-[13px] font-medium text-neutral-900">
            {busy ? "Förbereder…" : label}
          </span>
          {description && (
            <span className="block text-xs text-neutral-500">{description}</span>
          )}
        </span>
      </button>
    );
  }

  return (
    <Button type="button" tone={tone} onClick={start} disabled={disabled || busy}>
      <IconPrinter />
      {busy ? "Förbereder…" : label}
    </Button>
  );
}
