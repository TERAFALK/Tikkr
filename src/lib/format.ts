/**
 * Enhetlig formatering av tid och datum.
 *
 * Ligger samlat för att samma sak ska se likadan ut överallt. Blandade format
 * i en rapport gör att man börjar tvivla på siffrorna.
 *
 * ── ETT FORMAT: DECIMALTIMMAR ─────────────────────────────────────────────
 *
 * Tid skrivs som decimaltimmar: "8,5". Det gäller hela panelen, kiosken,
 * varje PDF, Excel-arket och säljsidans produktbilder.
 *
 * Till 2026-10-14 skrevs tid som ska LÄSAS i tim:min ("8:30"), och bara arket
 * i decimaltimmar. Kunden bad om decimalt överallt: deras lönekörning och
 * deras gamla efterkalkyler räknas så, och den som läste en siffra i panelen
 * för att skriva in den någon annanstans räknade om den varje gång.
 *
 * Att det nu är ETT format och inte två är hela vinsten. Buggen som en gång
 * gav tim:min sin regel var att två format stod på samma sida om samma dag,
 * och "1,99" lästes som 1:59. Med ett enda format finns inget att läsa fel.
 *
 * Fälten där tid skrivs IN tar fortfarande båda formen: den som har "7:30" på
 * ett gammalt papper ska inte behöva räkna om det. Se `parseHours` i
 * order-budget.ts.
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
    value,
  );
}

export function formatDateTime(
  value: Date,
  timeZone = DEFAULT_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("sv-SE", {
    ...DATE_OPTIONS,
    ...TIME_OPTIONS,
    timeZone,
  }).format(value);
}

export function formatTime(value: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("sv-SE", { ...TIME_OPTIONS, timeZone }).format(
    value,
  );
}

/**
 * Nollor i slutet faller bort: "8,5" och inte "8,50", "2" och inte "2,00".
 *
 * Valet är kundens. En trimmad kolumn står ojämn, men "8" läses som åtta
 * timmar utan att man räknar decimaler, och tiden som faktiskt har kvartar
 * sticker då ut: 33,75 syns bland en spalt runda tal.
 *
 * Komma och inte punkt — svensk text. Det är samma decimaltecken som beloppen
 * skrivs med, se money.ts.
 */
function trimZeros(hours: number): string {
  return hours
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
}

/**
 * Minuter som decimaltimmar: "8,5".
 *
 * Avrundningen sker i TVÅ steg, och ordningen är inte likgiltig. Först till
 * hela minuter, eftersom en stämpling bär sekunder som ingen ska se, och
 * löneunderlaget räknar i hela minuter (CLAUDE.md § 3 regel 7). Sedan till två
 * decimaler, som är finare än en minut (0,01 timme är 36 sekunder) och därför
 * inte tappar något.
 *
 * Räknade den direkt från sekunder skulle en halv minut kunna bli "+0,01" i
 * ett saldo som egentligen är noll.
 *
 * Timdelen har ingen övre gräns: en order kan ha 312 timmar på sig.
 *
 * Där talet kan förväxlas med något annat skrivs enheten ut i
 * kolumnrubriken: "Tid (timmar)".
 */
export function formatDuration(minutes: number): string {
  const wholeMinutes = Math.max(0, Math.round(minutes));
  return trimZeros(toDecimalHours(wholeMinutes));
}

/**
 * Ett saldo som text: "+2,25", "−0,75" eller "0".
 *
 * Tecknet skrivs alltid ut, så att noll inte läses som plus.
 *
 * Fanns i fyra egna kopior — i kiosken, i tidrapportens tabell, i dess PDF och
 * på sidan — och de hann börja visa olika saker på samma dag.
 */
export function formatSignedDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return "0";

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
