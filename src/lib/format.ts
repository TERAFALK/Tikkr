/**
 * Enhetlig formatering av tid och datum.
 *
 * Ligger samlat för att samma sak ska se likadan ut överallt. Blandade format
 * i en rapport gör att man börjar tvivla på siffrorna.
 */

const DEFAULT_TIME_ZONE = "Europe/Stockholm";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

export function formatDate(value: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("sv-SE", { ...DATE_OPTIONS, timeZone }).format(
    value
  );
}

export function formatDateTime(
  value: Date,
  timeZone = DEFAULT_TIME_ZONE
): string {
  return new Intl.DateTimeFormat("sv-SE", {
    ...DATE_OPTIONS,
    ...TIME_OPTIONS,
    timeZone,
  }).format(value);
}

export function formatTime(value: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("sv-SE", { ...TIME_OPTIONS, timeZone }).format(
    value
  );
}

/**
 * Minuter som "7 tim 30 min".
 *
 * Läsbart format för skärm. För Excel exporteras istället decimaltimmar, som
 * går att räkna med.
 */
export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;

  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} tim`;
  return `${hours} tim ${rest} min`;
}

/** Decimaltimmar med två decimaler — formatet fakturaunderlag räknas i. */
export function toDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** Minuter mellan två tidpunkter. Pågående jobb räknas fram till nu. */
export function minutesBetween(from: Date, to: Date | null): number {
  const end = to ?? new Date();
  return Math.max(0, (end.getTime() - from.getTime()) / 60000);
}
