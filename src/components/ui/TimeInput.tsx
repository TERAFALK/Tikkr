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
 * Kolonet skrivs av fältet, inte av användaren — se `maskTimeInput`. Vid blur
 * städas värdet till HH:MM: "9" blir "09:00", "630" blir "06:30".
 *
 * Går värdet inte att tolka står det kvar som skrivet och fältet blir rött.
 * Att tyst kasta det vore värre: då ser man ett fält som ser ifyllt ut, sparar,
 * och får ett schema som inte är det man skrev.
 *
 * Fungerar både okontrollerat (`defaultValue`, vanligt formulär) och
 * kontrollerat (`value` + `onValueChange`).
 */
export function TimeInput({
  value,
  defaultValue,
  onValueChange,
  className = "",
  invalidClassName,
  ...props
}: Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /**
   * Hela klassuppsättningen för ett otolkbart värde — inte ett tillägg till
   * `className`. Två motstridiga Tailwind-klasser på samma element avgörs av
   * ordningen i stilmallen, inte i strängen, och då blir röd ram en slump.
   */
  invalidClassName?: string;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const controlled = value !== undefined;
  const shown = controlled ? value : internal;

  // Markeras först vid blur. Ett fält som blir rött efter första siffran
  // skäller på någon som är mitt i att skriva.
  const [touched, setTouched] = useState(false);
  const invalid =
    touched && shown.trim() !== "" && normalizeTimeOfDay(shown) === null;

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
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        const deleting = event.target.value.length < shown.length;
        setTouched(false);
        set(maskTimeInput(event.target.value, deleting));
      }}
      onBlur={(event) => {
        const normalized = normalizeTimeOfDay(event.target.value);
        if (normalized !== null) set(normalized);
        setTouched(true);
        props.onBlur?.(event);
      }}
      className={invalid ? (invalidClassName ?? className) : className}
    />
  );
}
