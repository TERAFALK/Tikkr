/**
 * Räkna med klockslag i en viss tidszon.
 *
 * Varför detta behövs: databasen sparar tidpunkter i UTC, vilket är rätt. Men
 * regeln "stäng glömda stämplingar 18:00" menar 18:00 på verkstaden — och
 * skillnaden mellan svensk tid och UTC är två timmar på sommaren, en på
 * vintern. Räknade vi rakt på UTC skulle utstämplingen glida en timme vid varje
 * tidsomställning. Ingen skulle märka det förrän någon räknade efter på en
 * faktura.
 *
 * Vi använder webbläsarens och Nodes inbyggda tidszonsdata (Intl) istället för
 * ett externt bibliotek — den är alltid uppdaterad med aktuella regler.
 */

/** Delarna av ett klockslag som det ser ut på väggen i en viss tidszon. */
export interface WallTime {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
}

function partsInZone(instant: Date, timeZone: string): WallTime & { second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const value = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/** Vad klockan är på väggen i angiven tidszon vid en given tidpunkt. */
export function wallTimeIn(instant: Date, timeZone: string): WallTime {
  const { year, month, day, hour, minute } = partsInZone(instant, timeZone);
  return { year, month, day, hour, minute };
}

/**
 * Översätter ett klockslag på väggen till den faktiska tidpunkten.
 *
 * "18:00 den 3 juli i Stockholm" är en annan tidpunkt än "18:00 den 3 januari",
 * eftersom tidsskillnaden mot UTC ändras. Vi provar oss fram: gissa, mät hur
 * fel gissningen blev, och justera. Två varv räcker även vid tidsomställning.
 */
export function instantFromWallTime(wall: WallTime, timeZone: string): Date {
  const target = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);

  let instant = new Date(target);
  for (let attempt = 0; attempt < 2; attempt++) {
    const seen = partsInZone(instant, timeZone);
    const seenAsUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second
    );
    const drift = seenAsUtc - instant.getTime();
    instant = new Date(target - drift);
  }

  return instant;
}

/** Tolkar "18:00" till timme och minut. Kastar vid felaktigt format. */
export function parseTimeOfDay(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  const hour = match ? Number(match[1]) : NaN;
  const minute = match ? Number(match[2]) : NaN;

  if (!match || hour > 23 || minute > 59) {
    throw new Error(
      `Ogiltigt klockslag "${value}". Förväntat format är HH:MM, t.ex. "18:00".`
    );
  }

  return { hour, minute };
}

/**
 * Nästa gång klockan slår angivet klockslag efter en given tidpunkt.
 *
 * Används för att avgöra när en glömd stämpling ska stängas. Stämplar någon in
 * kl 20 på kvällen, efter att dagens 18:00 passerat, stängs posten först nästa
 * dags 18:00 — inte omedelbart. Det gör att kvälls- och nattskift fungerar.
 */
export function nextOccurrenceOf(
  timeOfDay: string,
  after: Date,
  timeZone: string
): Date {
  const { hour, minute } = parseTimeOfDay(timeOfDay);
  const wall = wallTimeIn(after, timeZone);

  const sameDay = instantFromWallTime({ ...wall, hour, minute }, timeZone);
  if (sameDay > after) return sameDay;

  // Klockslaget har redan passerat idag — ta morgondagens. Vi räknar fram
  // nästa kalenderdatum via UTC för att undvika månads- och årsskiften.
  const tomorrow = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1));
  return instantFromWallTime(
    {
      year: tomorrow.getUTCFullYear(),
      month: tomorrow.getUTCMonth() + 1,
      day: tomorrow.getUTCDate(),
      hour,
      minute,
    },
    timeZone
  );
}
