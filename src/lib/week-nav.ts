import { isoWeekNumber } from "./week";
import { addDaysInZone, startOfWeekIn, toDateInput } from "./time-zone";

/**
 * EN VECKA BAKÅT OCH EN FRAMÅT, FÖR EN SIDA SOM FILTRERAR PÅ `from` OCH `to`.
 *
 * Rapporter, Stämplingar och Tidrapport har samma datumfilter och ska därmed
 * ha samma reglage. Räkningen ligger här och inte på var sida, eftersom tre
 * kopior av "flytta perioden sju dagar" hinner börja flytta olika mycket —
 * och det syns först som en vecka som hoppar över en dag.
 *
 * HELA PERIODEN FLYTTAS, lika lång som den var. Den som valt en månad behåller
 * sin månad, förskjuten en vecka. Att i stället hoppa till en hel vecka hade
 * varit att kasta bort ett filter någon just ställt in.
 *
 * Saknas datum gäller innevarande vecka, och pilarna går därifrån. En sida
 * utan filter visar allt, och "föregående vecka" har då ingen annan rimlig
 * utgångspunkt.
 *
 * Övriga filter följer med oförändrade. Den som valt en anställd och bläddrar
 * en vecka bakåt vill se samma person.
 */
export function weekStep(
  basePath: string,
  search: Record<string, string | undefined>,
  timeZone: string
): { backHref: string; forwardHref: string; label: string } {
  const thisMonday = startOfWeekIn(new Date(), timeZone);

  const from = search.from || toDateInput(thisMonday, timeZone);

  // Ett startdatum utan slutdatum betyder sju dagar framåt, inte innevarande
  // vecka. Samma regel som sidorna själva använder när de läser filtret.
  const to =
    search.to ||
    (search.from
      ? shift(search.from, 6, timeZone)
      : toDateInput(addDaysInZone(thisMonday, 6, timeZone), timeZone));

  const href = (days: number) => {
    const next = new URLSearchParams();

    for (const [key, value] of Object.entries(search)) {
      if (value && key !== "from" && key !== "to") next.set(key, value);
    }

    next.set("from", shift(from, days, timeZone));
    next.set("to", shift(to, days, timeZone));

    return `${basePath}?${next.toString()}`;
  };

  return {
    backHref: href(-7),
    forwardHref: href(7),
    label: weekLabel(from, to, timeZone),
  };
}

/** "2026-10-05" plus ett antal dagar, räknat i företagets tidszon. */
function shift(date: string, days: number, timeZone: string): string {
  // Middagstid: datumet pekar ut en dag, och natten då klockan ställs om
  // saknar midnatt i vissa tidszoner. Samma skäl som i parseLocalDate.
  const noon = new Date(`${date}T12:00:00Z`);

  return toDateInput(addDaysInZone(noon, days, timeZone), timeZone);
}

/**
 * "Vecka 41", eller "Vecka 41–43" när perioden spänner över flera.
 *
 * En period som inte är en vecka ska inte få heta en vecka. Den som valt en
 * månad ser då att pilarna flyttar något större än det reglaget antyder.
 */
function weekLabel(from: string, to: string, timeZone: string): string {
  const first = isoWeekNumber(new Date(`${from}T12:00:00Z`), timeZone);
  const last = isoWeekNumber(new Date(`${to}T12:00:00Z`), timeZone);

  return first === last ? `Vecka ${first}` : `Vecka ${first}–${last}`;
}
