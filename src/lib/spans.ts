/**
 * TID I ARBETE, NÄR FLERA JOBB LÖPER SAMTIDIGT.
 *
 * Sedan en operatör får köra två maskiner samtidigt finns det två riktiga svar
 * på "hur mycket tid blev det", och vilket som är rätt beror på frågan.
 *
 * RAPPORTERNA OCH EFTERKALKYLERNA summerar rakt av och ska inte röra den här
 * filen. Svetsar Anna 08–12 och kör fräsen 11–15 är det åtta maskintimmar, och
 * båda ordrarna ska betala sina fyra. Det är vad som ska faktureras.
 *
 * ÖVERSIKTEN OCH VECKOVYN räknar i stället HUVUDSTÄMPLINGEN, och svarar då
 * fyra timmar: bara svetsningen, jobbet hon började på. Fräsen är ett sidojobb
 * och räknas inte alls — inte heller timmarna 12–15, när svetsen var avslutad.
 *
 * Regeln: en stämpling räknas bara om ingenting annat pågick när den började.
 *
 * Det är med flit ett lågt tal. Vyerna finns för att se om veckan ser rimlig
 * ut, och ett sidojobb är inte en extra timme som någon varit på plats — det
 * är samma timme, bokförd på en order till. Den som vill se all tid tar en
 * rapport, som är stället där varje stämpling syns för sig.
 *
 * SAMMANRÄKNINGEN SKER ALLTID PER PERSON. Att två personer arbetar samtidigt
 * är inte överlapp — det är två personer.
 *
 * Improduktiv tid räknas med. Städning är tid på jobbet även om den aldrig
 * faktureras, och den är lika mycket en huvudstämpling som svetsning.
 */

/** Ett pass, som millisekunder sedan epoch. */
export interface Span {
  from: number;
  to: number;
}

/**
 * Huvudstämplingarnas sammanlagda längd, i minuter.
 *
 * Sorterar på starttid och sveper igenom. Ett pass som börjar innan allt
 * tidigare hunnit ta slut är ett sidojobb och hoppas över helt; övriga räknas
 * med sin fulla längd. Passen kan alltså aldrig överlappa varandra i summan.
 *
 * Sluttiden som jämförs är den SENASTE hittills sedda, inte det föregående
 * huvudpassets. Annars hade ett jobb som startade medan ett långt sidojobb
 * fortfarande pågick räknats som ett nytt huvudjobb, fastän personen redan
 * stod vid en maskin.
 */
export function mainMinutes(spans: Span[]): number {
  const sorted = spans
    .filter((span) => span.to > span.from)
    .sort((a, b) => a.from - b.from);

  let total = 0;
  let busyUntil = -Infinity;

  for (const span of sorted) {
    if (span.from < busyUntil) {
      // Sidojobb. Räknas inte, men skjuter fram när nästa jobb kan räknas som
      // ett huvudjobb — personen står ju vid den maskinen tills den är klar.
      busyUntil = Math.max(busyUntil, span.to);
      continue;
    }

    total += span.to - span.from;
    busyUntil = span.to;
  }

  return total / 60000;
}
