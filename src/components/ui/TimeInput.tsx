"use client";

import { useState, type ComponentProps } from "react";
import { maskTimeInput, normalizeTimeOfDay } from "@/lib/time-input";

/**
 * FÄLT FÖR ETT KLOCKSLAG.
 *
 * `type="text"` och inte `type="time"`: webbläsarens egen tidväljare ser olika
 * ut i varje webbläsare, och på en dator är den långsammare att fylla i än
 * fyra siffror.
 *
 * Kolonet skrivs av fältet, inte av användaren — se `maskTimeInput`. Vid
 * blur städas värdet till HH:MM när det går att tolka. Ett obegripligt värde
 * står kvar som skrivet, så att det syns vad man råkade skriva.
 *
 * Fungerar både okontrollerat (`defaultValue`, vanligt formulär) och
 * kontrollerat (`value` + `onValueChange`).
 */
export function TimeInput({
  value,
  defaultValue,
  onValueChange,
  className = "",
  ...props
}: Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const controlled = value !== undefined;
  const shown = controlled ? value : internal;

  function set(next: string) {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  }

  return (
    <input
      {...props}
      value={shown}
      inputMode="numeric"
      autoComplete="off"
      onChange={(event) => {
        const deleting = event.target.value.length < shown.length;
        set(maskTimeInput(event.target.value, deleting));
      }}
      onBlur={(event) => {
        const normalized = normalizeTimeOfDay(event.target.value);
        if (normalized !== null) set(normalized);
        props.onBlur?.(event);
      }}
      className={className}
    />
  );
}
