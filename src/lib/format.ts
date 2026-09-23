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
 * Minuter som "7:30" — timmar och minuter.
 *
 * Samma format som kundernas befintliga efterkalkyler skriver, vilket är
 * skälet till att det valdes: "50:02" betyder femtio timmar och två minuter
 * för den som läst den rapporten i tio år.
 *
 * Timdelen har ingen övre gräns och ingen utfyllnad — en order kan ha 312
 * timmar på sig. Minutdelen fylls alltid till två siffror, annars läses "7:5"
 * som sju och en halv timme.
 *
 * Där formatet kan förväxlas med ett klockslag skrivs enheten ut i
 * kolumnrubriken: "Tid (tim:min)".
 *
 * För Excel exporteras i stället decimaltimmar — se formatDecimalHours — som
 * går att summera. Det är två olika behov och de ska inte blandas ihop.
 */
export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;

  return `${hours}:${String(rest).padStart(2, "0")}`;
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

/**
 * Decimaltimmar som text: "1,99".
 *
 * Idiomet `toDecimalHours(m).toFixed(2).replace(".", ",")` fanns på tio ställen
 * i PDF- och Excel-koden. Samlat här så att en ändring av antalet decimaler
 * slår igenom överallt på en gång.
 *
 * Används DÄR KRONOR RÄKNAS, som underlag till en multiplikation: "1,98 h ×
 * 850 kr". För en tidkolumn som en människa ska läsa används `formatDuration`
 * — "1,99" läses annars lätt som klockslaget 1:99, vilket inte finns.
 */
export function formatDecimalHours(minutes: number): string {
  return toDecimalHours(minutes).toFixed(2).replace(".", ",");
}
