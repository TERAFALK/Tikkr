"use client";

import type { ReactNode } from "react";

/**
 * Knapparna för ett dokument, i orderlistans markeringsläge och på orderns
 * egen sida. Samma etikett och samma verb på båda ställena.
 */

/** Ett dokument och vägarna till det: namnet över, knapparna under. */
export function ExportGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-neutral-500">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * En nedladdningslänk.
 *
 * Länk och inte knapp: filen hämtas av webbläsaren, och en länk går att öppna
 * i en ny flik som vilken annan. Utan markerade ordrar leder den ingenstans,
 * och ser ut därefter.
 */
export function ExportLink({
  href,
  disabled = false,
  primary = false,
  onPick,
  children,
}: {
  href: string;
  disabled?: boolean;
  primary?: boolean;
  /** Körs när filen begärts. Används för frågan om att avsluta ordrarna. */
  onPick?: () => void;
  children: ReactNode;
}) {
  const tone = disabled
    ? "cursor-not-allowed text-neutral-500 ring-1 ring-inset ring-neutral-200"
    : primary
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50";

  return (
    <a
      href={disabled ? undefined : href}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onPick?.();
      }}
      aria-disabled={disabled}
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${tone}`}
    >
      {children}
    </a>
  );
}
