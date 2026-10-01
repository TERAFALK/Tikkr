/**
 * Enhetlig formatering av tid och datum.
 *
 * Ligger samlat för att samma sak ska se likadan ut överallt. Blandade format
 * i en rapport gör att man börjar tvivla på siffrorna.
 *
 * ── ETT FORMAT PÅ SKÄRMEN, ETT I KALKYLARKET ─────────────────────────────
 *
 * Tid som någon ska LÄSA skrivs som tim:min: `formatDuration` och
 * `formatSignedDuration`. Det gäller hela panelen, kiosken och varje PDF.
 *
 * Tid som någon ska RÄKNA MED skrivs som decimaltimmar: `toDecimalHours`, och
 * bara i Excel-exporten. En kolumn som ska summeras eller multipliceras med en
 * timpeng kan inte stå i tim:min.
 *
 * Tidrapporten bröt mot det här till 2026-10-01: rutorna överst stod i
 * decimaltimmar och tabellen under i tim:min, på samma sida om samma dag.
 * "1,99" lästes dessutom som 1:59, vilket är fyra minuter fel.
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

/**
 * Ett saldo som text: "+2:15", "−0:45" eller "0:00".
 *
 * Tecknet skrivs alltid ut, så att noll inte läses som plus.
 *
 * Samma tim:min som `formatDuration`, eftersom ett saldo är en tid någon ska
 * LÄSA: den som vill veta om hen kan gå hem tidigt läser "+2:15" snabbare än
 * "+2,25". Fanns i fyra egna kopior — i kiosken, i tidrapportens tabell, i
 * dess PDF och på sidan — och de hann börja visa olika saker på samma dag.
 */
export function formatSignedDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return "0:00";

  return `${rounded > 0 ? "+" : "−"}${formatDuration(Math.abs(rounded))}`;
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
