import { normalizeTimeOfDay } from "./time-input";
import { wallTimeIn } from "./time-zone";

/**
 * EN ARBETSVECKA SOM FORMULÄR — SJU DAGAR MED TIDER OCH RASTER.
 *
 * Formen behövs på tre ställen numera:
 *
 *   1. Företagets standardschema, under Inställningar.
 *   2. En anställds egna arbetstider, i rutan under Anställda.
 *   3. En stations öppettider, i planeringens stationsregister.
 *
 * De två första hör till löneunderlaget, den tredje till planeringen, och de
 * två modulerna säljs var för sig. Läsningen kan därför inte ligga i
 * `schedule.ts`: den filen räknar löneunderlag, och varje fil som importerar
 * den räknas som en lönesida av `tests/module-coverage.test.ts` — med rätta.
 * En stationssida som krävde lönemodulen hade varit ett riktigt fel, inte en
 * teknikalitet.
 *
 * Alternativet vore en andra läsare med samma fältnamn. Två läsare av samma
 * fält glider isär vid första ändringen, och glidningen syns först som
 * felaktiga tider någon annanstans. Det är exakt skälet som står utskrivet i
 * CLAUDE.md § 3 regel 7 om varför `ScheduleDays` ritar dagarna och den här
 * filen läser dem.
 *
 * FILEN ÄR NEUTRAL. Den vet ingenting om scheman, stationer, flex eller
 * fakturor — bara om fält i ett formulär och minuter från midnatt. Den får
 * därför läsas från båda hållen.
 *
 * TIDER ÄR MINUTER FRÅN MIDNATT. Ett schema ska gå att räkna på, och "06:30"
 * är inte ett tal.
 *
 * VECKODAGAR ÄR ISO: 1 = måndag … 7 = söndag. Samma räkning som veckovyn.
 */

/* --- Klockslag som text ---------------------------------------------------
 *
 * Tiderna visas och matas in som "06:30" men lagras som 390. Omvandlingen
 * ligger här, så att gränssnittet och beräkningen aldrig kan tolka samma
 * sträng olika. */

/**
 * "06:30" → 390. Ger null på något som inte är ett klockslag.
 *
 * Tar även emot "0630" och "630". Fältet i adminpanelen sätter kolonet medan
 * man skriver, men ett formulär kan skickas innan det skriptet hunnit köra,
 * och då ska siffrorna ändå betyda det de ser ut att betyda.
 */
export function parseMinuteOfDay(value: string): number | null {
  const normalized = normalizeTimeOfDay(value);
  if (normalized === null) return null;

  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

/** 390 → "06:30". */
export function formatMinuteOfDay(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Veckodagen ett datum har, som ISO-nummer i företagets tidszon.
 *
 * Går via kalenderdatumet och inte via `getDay()` på instansen, eftersom
 * servern kör UTC: ett kvällspass i Stockholm hör till dagen på väggen, inte
 * till den UTC råkar visa.
 */
export function isoWeekdayIn(instant: Date, timeZone: string): number {
  const wall = wallTimeIn(instant, timeZone);
  const day = new Date(
    Date.UTC(wall.year, wall.month - 1, wall.day)
  ).getUTCDay();

  // getUTCDay() ger 0 för söndag. ISO vill ha 7.
  return day === 0 ? 7 : day;
}

export function dayName(weekday: number): string {
  return [
    "måndag",
    "tisdag",
    "onsdag",
    "torsdag",
    "fredag",
    "lördag",
    "söndag",
  ][weekday - 1];
}

/* --- Veckan ur ett formulär ----------------------------------------------- */

/** En dag på väg in i databasen. */
export interface WeekdayHours {
  weekday: number;
  startMinute: number;
  endMinute: number;
  breaks: { startMinute: number; endMinute: number }[];
}

/** Rasterna på en dag, som de kommer från formuläret. */
function readBreaks(
  formData: FormData,
  weekday: number
): { startMinute: number; endMinute: number }[] {
  const starts = formData.getAll(`break-start-${weekday}`);
  const ends = formData.getAll(`break-end-${weekday}`);

  const breaks: { startMinute: number; endMinute: number }[] = [];

  for (const [index, rawStart] of starts.entries()) {
    const start = parseMinuteOfDay(String(rawStart ?? ""));
    const end = parseMinuteOfDay(String(ends[index] ?? ""));

    // Halvfyllda rader hoppas över. Den som tryckt på plus och ångrat sig har
    // lämnat en tom rad, inte begått ett fel.
    if (start === null || end === null) continue;
    if (end <= start) continue;

    breaks.push({ startMinute: start, endMinute: end });
  }

  return breaks;
}

/**
 * Hela veckan ur ett formulär.
 *
 * Ger antingen ett fel att visa eller färdiga dagar, aldrig både och. Noll
 * dagar är ett giltigt svar och betyder olika saker beroende på vem som
 * frågar: för företagets schema att ingen dag är arbetsdag, för en anställd
 * att standardschemat gäller, för en station att den står still hela veckan.
 * Den tolkningen hör till anroparen och inte hit.
 */
export function readWeeklyHours(
  formData: FormData
): { error: string } | { days: WeekdayHours[] } {
  const days: WeekdayHours[] = [];

  for (let weekday = 1; weekday <= 7; weekday++) {
    // Dagen är arbetsfri när rutan inte är i. Raden skrivs då inte alls.
    if (formData.get(`active-${weekday}`) !== "on") continue;

    const start = parseMinuteOfDay(String(formData.get(`start-${weekday}`) ?? ""));
    const end = parseMinuteOfDay(String(formData.get(`end-${weekday}`) ?? ""));

    if (start === null || end === null) {
      return { error: "Skriv tiderna som klockslag, till exempel 06:30." };
    }

    if (end <= start) {
      return { error: "Sluttiden måste ligga efter starttiden." };
    }

    const breaks = readBreaks(formData, weekday);

    const breakMinutes = breaks.reduce(
      (total, rest) => total + (rest.endMinute - rest.startMinute),
      0
    );

    if (breakMinutes >= end - start) {
      return {
        error: `Rasterna är längre än arbetsdagen på ${dayName(weekday)}.`,
      };
    }

    days.push({ weekday, startMinute: start, endMinute: end, breaks });
  }

  return { days };
}

/**
 * Arbetstid netto för en dag, i minuter: spannet minus rasterna.
 *
 * En rast som sträcker sig utanför arbetspasset räknas bara till den del som
 * ligger innanför. Annars skulle en lunch som lagts 12:00–13:00 på en dag som
 * slutar 12:30 dra av trettio minuter för mycket.
 *
 * Samma aritmetik som `plannedMinutesForDay` i schedule.ts och `capacityOf` i
 * plan-calendar.ts, och de två kallar hit i stället för att räkna själva —
 * annars hade samma dag kunnat bli olång beroende på vem som frågade.
 */
export function netMinutes(day: {
  startMinute: number;
  endMinute: number;
  breaks: { startMinute: number; endMinute: number }[];
}): number {
  const span = Math.max(0, day.endMinute - day.startMinute);

  const breakMinutes = day.breaks.reduce((total, rest) => {
    const from = Math.max(rest.startMinute, day.startMinute);
    const to = Math.min(rest.endMinute, day.endMinute);
    return total + Math.max(0, to - from);
  }, 0);

  return Math.max(0, span - breakMinutes);
}
