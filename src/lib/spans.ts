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
 * TIDRAPPORTEN, ÖVERSIKTEN OCH VECKOVYN räknar i stället tiden då MINST ETT
 * jobb pågick, och svarar då sju timmar: 08–15. Ett dubbeljobb lägger
 * ingenting till medan jobbet under det pågår, men tiden efter räknas.
 *
 * Ändrat 2026-11-23, pilotkundens begäran. Till dess räknades bara
 * "huvudstämplingen", jobbet som startade när ingenting annat pågick, och ett
 * dubbeljobb räknades inte alls — inte heller timmarna 12–15, när svetsen var
 * avslutad och Anna stod kvar vid fräsen. Det drog tid från flexen för någon
 * som var på jobbet.
 *
 * SAMMANRÄKNINGEN SKER ALLTID PER PERSON. Att två personer arbetar samtidigt
 * är inte överlapp — det är två personer.
 *
 * Improduktiv tid räknas med. Städning är tid på jobbet även om den aldrig
 * faktureras.
 */

/** Ett pass, som millisekunder sedan epoch. */
export interface Span {
  from: number;
  to: number;
}

/**
 * Tiden då minst ett pass pågick, i HELA minuter.
 *
 * Passen läggs ihop som intervall: sorteras på starttid och sveps igenom, och
 * den del av ett pass som ligger i tid som redan räknats hoppas över. En timme
 * räknas därför en gång hur många jobb som än löper i den, och svaret beror
 * inte på i vilken ordning passen kommer.
 *
 * Namnet är kvar från tiden då bara huvudstämplingen räknades, se ovan.
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
  let countedUntil = -Infinity;

  for (const span of sorted) {
    // Bara det som ligger efter det redan räknade. Ett jobb helt inuti ett
    // annat lägger ingenting till.
    const from = Math.max(span.from, countedUntil);
    if (span.to > from) {
      total += span.to - from;
      countedUntil = span.to;
    }
  }

  return Math.round(total / 60000);
}
