import { mergedBreaks, netMinutes } from "./weekly-hours";
import {
  addDaysInZone,
  instantFromWallTime,
  startOfDayIn,
  wallTimeIn,
} from "./time-zone";

/**
 * ARBETSMINUTER MOT VÄGGKLOCKA.
 *
 * Planeringens enda verkligt kniviga räkning, och därför samlad på ett ställe.
 *
 * ── VARFÖR EN RUTA MÄTS I ARBETSMINUTER ──────────────────────────────────
 *
 * En planerad ruta bär en tid som kommer ur orderns beräkning: "fräsning, 4:00".
 * De fyra timmarna är ARBETE. Stationen står still under lunchen, och en ruta
 * som börjar 10:00 på en station med lunch 12:00–12:40 slutar därför 14:40 på
 * väggen men är fortfarande 4:00 arbete.
 *
 * Räknade vi i väggminuter i stället skulle "fyll stationens arbetstid" betyda
 * olika saker beroende på var på dagen man råkade börja: en ruta som dras över
 * lunchen hade ätit fyrtio minuter ur orderns beräkning utan att någon arbetat
 * dem, och den oplacerade återstoden hade blivit för liten. Tid skulle falla
 * bort, vilket är det enda utfall planeringen inte får ha.
 *
 * ── REGELN, I EN MENING ──────────────────────────────────────────────────
 *
 * BARA STATIONENS EGNA RASTER HOPPAS ÖVER. Allt annat är arbetsminuter.
 *
 * Tid utanför öppettiderna räknas alltså som arbete. Det är inte en lucka i
 * regeln utan själva innebörden av överbokning: drar administratören en ruta
 * förbi stängningen, eller lägger den klockan fem på morgonen, betyder det att
 * maskinen ska gå då. Tavlan varnar i gult, men minuterna är riktiga.
 *
 * Alternativet vore att behandla stängd tid som ett glapp att hoppa över, och
 * då blir före och efter öppettiderna olika: en ruta lagd 05:00 på en station
 * som öppnar 07:00 skulle ritas som om den tog en tvåtimmarspaus direkt. En
 * regel som är olika i de två ändarna är en regel ingen minns.
 *
 * ── DYGNSGRÄNSER ─────────────────────────────────────────────────────────
 *
 * ALLA räknas i FÖRETAGETS tidszon, aldrig i serverns. Containern kör UTC, och
 * ett dygn som börjar 00:00 UTC börjar 02:00 på verkstadsgolvet på sommaren.
 * En ruta hade då hamnat på fel dag i tavlan men på rätt dag i rapporten,
 * vilket är den sortens skillnad man letar efter i en timme.
 *
 * Filen räknar och läser ingenting. Ingen databas, inga importer utom
 * tidszonsmatematiken och `netMinutes`, som också servern och
 * schemaformuläret använder.
 */

/** Ett spann på väggen, som millisekunder sedan epoch. Samma form som Span i spans.ts. */
export interface WallSpan {
  from: number;
  to: number;
}

/**
 * En stations öppettider en veckodag. Minuter från midnatt, ISO-veckodag.
 *
 * Samma form som `WeekdayHours`, men med `weekday` obligatorisk eftersom
 * tavlan alltid frågar om en bestämd dag.
 */
export interface StationHours {
  weekday: number;
  startMinute: number;
  endMinute: number;
  breaks: { startMinute: number; endMinute: number }[];
}

/**
 * Rutnätets upplösning, i minuter.
 *
 * Kvartar och inte minuter: en ruta ska gå att placera med fingret på en
 * pekskärm, och ingen planerar en fräsning till 09:07. Snäppningen sker på
 * servern och inte bara i gränssnittet — ett formulär kan skickas av annat än
 * tavlan.
 */
export const SNAP_MINUTES = 15;

/** Tidsaxelns golv när ingen station har några tider alls. */
const FALLBACK_WINDOW = { startMinute: 6 * 60, endMinute: 18 * 60 };

const MS_PER_MINUTE = 60_000;

/** Snäpper ett minutantal till rutnätet. Aldrig under en ruta. */
export function snap(minutes: number): number {
  return Math.max(SNAP_MINUTES, Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES);
}

/** Snäpper en tidpunkt till rutnätet, räknat från dygnets början på väggen. */
export function snapInstant(instant: Date, timeZone: string): Date {
  const dayStart = startOfDayIn(instant, timeZone).getTime();
  const into = (instant.getTime() - dayStart) / MS_PER_MINUTE;
  const snapped = Math.round(into / SNAP_MINUTES) * SNAP_MINUTES;

  return new Date(dayStart + Math.max(0, snapped) * MS_PER_MINUTE);
}

/**
 * Stationens kapacitet en dag, i minuter netto.
 *
 * Noll när dagen är stängd, vilket är rätt svar för en lördag. Räknar inte
 * själv: `netMinutes` i weekly-hours.ts äger aritmetiken, och företagets
 * schema mäts med samma funktion. Två kopior av den räkningen hade hunnit ge
 * olika långa dagar beroende på vem som frågade.
 */
export function capacityOf(hours: StationHours | null | undefined): number {
  if (!hours) return 0;
  return netMinutes(hours);
}

/** En minut på väggen som en tidpunkt, räknat från ett dygns början. */
function atMinute(day: Date, minute: number, timeZone: string): Date {
  const wall = wallTimeIn(day, timeZone);

  return instantFromWallTime(
    {
      ...wall,
      hour: Math.floor(minute / 60),
      minute: minute % 60,
    },
    timeZone
  );
}

/**
 * Stationens arbetsspann på väggen en viss dag, rasterna borträknade.
 *
 * FINNS FÖR ATT RITA, inte för att räkna. Tavlan skuggar stängd tid och raster
 * i grått, och behöver veta var de öppna spannen ligger. Aritmetiken använder
 * `breakSpans` i stället — se regeln överst om varför bara rasterna hoppas
 * över.
 *
 * En stängd dag ger en tom lista.
 */
export function workingWindows(
  hours: StationHours | null | undefined,
  day: Date,
  timeZone: string
): WallSpan[] {
  if (!hours || hours.endMinute <= hours.startMinute) return [];

  const dayStart = startOfDayIn(day, timeZone);

  // Samma klippta och sammanslagna raster som aritmetiken använder. Att rita
  // ur en egen uppsättning vore att låta skärmen visa en annan dag än den
  // som räknas — raster som i tavlan ser ut att ligga bredvid varandra och i
  // summan överlappar.
  const spans: WallSpan[] = [];
  let cursor = hours.startMinute;

  for (const rest of mergedBreaks(hours)) {
    if (rest.startMinute > cursor) {
      spans.push({
        from: atMinute(dayStart, cursor, timeZone).getTime(),
        to: atMinute(dayStart, rest.startMinute, timeZone).getTime(),
      });
    }
    cursor = Math.max(cursor, rest.endMinute);
  }

  if (hours.endMinute > cursor) {
    spans.push({
      from: atMinute(dayStart, cursor, timeZone).getTime(),
      to: atMinute(dayStart, hours.endMinute, timeZone).getTime(),
    });
  }

  return spans;
}

/** Dygnets slut på väggen: nästa dygns början. Rutor kapas här. */
function endOfDay(instant: Date, timeZone: string): number {
  return addDaysInZone(instant, 1, timeZone).getTime();
}

/**
 * Stationens raster på väggen en viss dag, sorterade och sammanslagna.
 *
 * Det här är det ENDA aritmetiken hoppar över.
 *
 * Klippningen och sammanslagningen görs av `mergedBreaks` i weekly-hours.ts
 * och inte här. Funktionen räknade själv till 2026-10-04, och gled då från
 * `capacityOf`: en station med rasterna 12:00–12:40 och 12:20–13:00 fick en
 * dag som var sextio minuter kortare enligt den här filen och åttio enligt
 * den andra. Två räknare för samma regel hinner alltid sluta säga samma sak.
 */
export function breakSpans(
  hours: StationHours | null | undefined,
  day: Date,
  timeZone: string
): WallSpan[] {
  if (!hours || hours.endMinute <= hours.startMinute) return [];

  const dayStart = startOfDayIn(day, timeZone);

  return mergedBreaks(hours).map((rest) => ({
    from: atMinute(dayStart, rest.startMinute, timeZone).getTime(),
    to: atMinute(dayStart, rest.endMinute, timeZone).getTime(),
  }));
}

/**
 * Rutans slut på väggen: start plus arbetsminuter, rasterna överhoppade.
 *
 * Går framåt genom stationens arbetsspann och förbrukar minuter. Tar minuterna
 * slut i ett spann slutar rutan där. Räcker inte dagens spann till — rutan
 * börjar sent, eller stationen stänger tidigt — läggs resten på som vanliga
 * väggminuter, eftersom kvällen inte har några raster att hoppa över.
 *
 * Kapas ALLTID vid dygnets slut. En ruta som spänner över två dagar går varken
 * att rita eller att läsa, se PlannedBlock i schema.prisma.
 */
export function blockEnd(
  hours: StationHours | null | undefined,
  startsAt: Date,
  minutes: number,
  timeZone: string
): Date {
  const limit = endOfDay(startsAt, timeZone);
  let left = Math.max(0, minutes) * MS_PER_MINUTE;
  let cursor = startsAt.getTime();

  for (const rest of breakSpans(hours, startsAt, timeZone)) {
    if (left <= 0) break;

    // Rasten är redan passerad.
    if (rest.to <= cursor) continue;

    // Rutan börjar inne i rasten. Klockan flyttas fram till rastens slut utan
    // att en minut förbrukas — den som lagt rutan mitt i lunchen menar att
    // jobbet börjar när lunchen är slut.
    if (rest.from <= cursor) {
      cursor = rest.to;
      continue;
    }

    const work = rest.from - cursor;

    if (work >= left) return new Date(Math.min(cursor + left, limit));

    left -= work;
    cursor = rest.to;
  }

  return new Date(Math.min(cursor + left, limit));
}

/**
 * Arbetsminuter mellan två tidpunkter enligt stationens kalender.
 *
 * Motsatsen till `blockEnd`, och används när tavlan dras: pekaren ger en
 * sluttid på väggen, och rutan ska lagra arbetsminuterna fram dit.
 *
 * Spannet minus rasterna i det, ingenting annat. Se regeln överst.
 */
export function workingMinutesBetween(
  hours: StationHours | null | undefined,
  from: Date,
  to: Date,
  timeZone: string
): number {
  const span = to.getTime() - from.getTime();
  if (span <= 0) return 0;

  const paused = breakSpans(hours, from, timeZone).reduce((total, rest) => {
    const start = Math.max(rest.from, from.getTime());
    const end = Math.min(rest.to, to.getTime());
    return total + Math.max(0, end - start);
  }, 0);

  return Math.round(Math.max(0, span - paused) / MS_PER_MINUTE);
}

/**
 * Hur många arbetsminuter som ryms från en starttid till dygnets slut.
 *
 * Kapar draget: den som drar en ruta mot midnatt ska få precis så mycket som
 * finns kvar, och återstoden ligger kvar som oplacerad. Noll betyder att
 * starttiden är dygnets sista minut, vilket formuläret avvisar.
 */
export function fitsFrom(
  hours: StationHours | null | undefined,
  startsAt: Date,
  timeZone: string
): number {
  return workingMinutesBetween(
    hours,
    startsAt,
    new Date(endOfDay(startsAt, timeZone)),
    timeZone
  );
}

/** En rutas läge på väggen, som tavlan behöver det för att rita. */
export interface PlannedSpan {
  startsAt: Date;
  minutes: number;
  /** Stationens tider den dagen, eller null när dagen är stängd. */
  hours: StationHours | null;
}

/**
 * Den gemensamma tidsaxeln en veckodag ritas på.
 *
 * Stationerna har olika öppettider, och varje rad med sin egen skala vore
 * oläsbart: två rutor på samma klockslag skulle ligga på olika x-läge. Axeln
 * är därför den vidaste av alla stationers tider den dagen.
 *
 * Rutorna sträcker ut den. En överbokad ruta som går till 20:00 måste synas,
 * annars är varningen om överbokning det enda man ser av den.
 *
 * Utan både tider och rutor gäller 06:00–18:00. En tom tavla ska se ut som en
 * arbetsdag och inte som en nollbred kolumn.
 */
export function dayWindow(
  hours: (StationHours | null | undefined)[],
  blocks: PlannedSpan[],
  day: Date,
  timeZone: string
): { startMinute: number; endMinute: number } {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;

  for (const station of hours) {
    if (!station || station.endMinute <= station.startMinute) continue;
    start = Math.min(start, station.startMinute);
    end = Math.max(end, station.endMinute);
  }

  const dayStart = startOfDayIn(day, timeZone).getTime();
  const dayEnd = endOfDay(day, timeZone);

  for (const block of blocks) {
    const from = block.startsAt.getTime();
    if (from < dayStart || from >= dayEnd) continue;

    const to = blockEnd(block.hours, block.startsAt, block.minutes, timeZone);

    start = Math.min(start, Math.floor((from - dayStart) / MS_PER_MINUTE));
    end = Math.max(end, Math.ceil((to.getTime() - dayStart) / MS_PER_MINUTE));
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { ...FALLBACK_WINDOW };
  }

  // Avrundas utåt till hel timme, så att axelns etiketter blir hela klockslag.
  return {
    startMinute: Math.max(0, Math.floor(start / 60) * 60),
    endMinute: Math.min(24 * 60, Math.ceil(end / 60) * 60),
  };
}

/**
 * Minuterna en station har planerat en viss dag, och om den är överbokad.
 *
 * Överbokning är tillåten och varnas bara för. Två skäl räknas som
 * överbokning, och de är olika fel: mer planerat än dagen rymmer, eller två
 * rutor som ligger i varandra. Det andra är det allvarligare — maskinen kan
 * inte köra två jobb samtidigt — och det är därför det räknas för sig.
 */
export function stationDayLoad(
  hours: StationHours | null | undefined,
  blocks: PlannedSpan[],
  timeZone: string
): { plannedMinutes: number; capacityMinutes: number; overlaps: boolean } {
  const plannedMinutes = blocks.reduce(
    (total, block) => total + Math.max(0, block.minutes),
    0
  );

  const spans = blocks
    .map((block) => ({
      from: block.startsAt.getTime(),
      to: blockEnd(block.hours, block.startsAt, block.minutes, timeZone).getTime(),
    }))
    .sort((a, b) => a.from - b.from);

  let overlaps = false;
  for (let index = 1; index < spans.length; index++) {
    if (spans[index].from < spans[index - 1].to) {
      overlaps = true;
      break;
    }
  }

  return { plannedMinutes, capacityMinutes: capacityOf(hours), overlaps };
}
