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
 * Huvudstämplingarnas sammanlagda längd, i HELA minuter.
 *
 * Sorterar på starttid och sveper igenom. Ett pass som börjar innan allt
 * tidigare hunnit ta slut är ett sidojobb och hoppas över helt; övriga räknas
 * med sin fulla längd. Passen kan alltså aldrig överlappa varandra i summan.
 *
 * Sluttiden som jämförs är den SENASTE hittills sedda, inte det föregående
 * huvudpassets. Annars hade ett jobb som startade medan ett långt sidojobb
 * fortfarande pågick räknats som ett nytt huvudjobb, fastän personen redan
 * stod vid en maskin.
 *
 * ── VARFÖR HELA MINUTER ──────────────────────────────────────────────────
 *
 * En stämpling bär sekunder, eftersom den sätts när någon trycker. Summan blir
 * därmed nästan alltid brutet, och det syns ingenstans: en tidkolumn visar
 * timmar och minuter, och sekunderna försvinner i formateringen.
 *
 * Flexsaldot är undantaget. Det LAGRAS som hela minuter i
 * `employees.flex_opening_minutes` och läses tillbaka, och en justering gick
 * därför inte ihop: administratören skrev 2 och fick 1,99 tillbaka, eftersom
 * brådelen föll bort i kolumnen men fanns kvar i räkningen.
 *
 * Avrundningen sker EN gång per dag och person, här, och inte per pass —
 * annars hade felet vuxit med antalet stämplingar. Högst en halv minut per
 * dag, vilket är mindre än den tid det tar att gå fram till skärmen.
 *
 * FAKTURASIDAN RÖRS INTE. Rapporterna och efterkalkylen summerar rått med
 * `minutesBetween` och vet inte att den här filen finns. Ett belopp som redan
 * fakturerats ska inte ändras av att löneunderlaget räknar jämna minuter.
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

  return Math.round(total / 60000);
}
