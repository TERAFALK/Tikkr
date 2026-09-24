/**
 * TID I ARBETE, NÄR FLERA JOBB LÖPER SAMTIDIGT.
 *
 * Sedan en operatör får köra två maskiner samtidigt finns det två riktiga svar
 * på "hur mycket tid blev det", och vilket som är rätt beror på frågan:
 *
 *   Svets 08–12 och fräs 11–15 samma dag — fyra timmar var
 *     → 8 timmar när frågan är vad som ska faktureras. Två maskiner gick under
 *       den överlappande timmen, och båda ordrarna ska betala sin.
 *     → 7 timmar när frågan är hur länge personen varit i arbete. Personen
 *       fanns bara på ett ställe mellan elva och tolv.
 *
 * Rapporterna och efterkalkylerna räknar det första — de summerar rakt av och
 * ska inte röra den här filen. Översiktens och veckovyns tal räknar det andra,
 * och gör det här, så att båda vyerna svarar likadant på samma dag.
 *
 * SAMMANSLAGNING SKER ALLTID PER PERSON. Att två personer arbetar samtidigt är
 * inte överlapp — det är två personer. Den som slår ihop över en hel verkstad
 * får fram hur länge lokalen varit bemannad, vilket ingen frågat efter.
 */

/** Ett pass, som millisekunder sedan epoch. */
export interface Span {
  from: number;
  to: number;
}

/**
 * Sammanslagen längd av passen, i minuter.
 *
 * Sorterar på starttid och sveper igenom: så länge nästa pass börjar innan det
 * pågående slutat växer samma period, annars läggs den undan och en ny börjar.
 * Tid som täcks av flera pass räknas därmed en gång.
 */
export function mergedMinutes(spans: Span[]): number {
  const sorted = spans
    .filter((span) => span.to > span.from)
    .sort((a, b) => a.from - b.from);

  if (sorted.length === 0) return 0;

  let total = 0;
  let start = sorted[0].from;
  let end = sorted[0].to;

  for (const span of sorted.slice(1)) {
    if (span.from <= end) {
      end = Math.max(end, span.to);
    } else {
      total += end - start;
      start = span.from;
      end = span.to;
    }
  }

  return (total + (end - start)) / 60000;
}

/** Rå summa av passen, i minuter. Det fakturerbara talet. */
export function summedMinutes(spans: Span[]): number {
  return (
    spans.reduce((total, span) => total + Math.max(0, span.to - span.from), 0) /
    60000
  );
}

/**
 * Hur mycket av tiden som kördes dubbelt, i minuter.
 *
 * Skillnaden mellan de två svaren ovan. Redovisas separat i vyerna så att den
 * går att förklara i stället för att se ut som ett räknefel.
 */
export function parallelMinutes(spans: Span[]): number {
  return Math.max(0, summedMinutes(spans) - mergedMinutes(spans));
}
