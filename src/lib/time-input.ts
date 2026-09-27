/**
 * KLOCKSLAG SOM SKRIVS FÖR HAND.
 *
 * Ett schema fylls i med fyra siffror i taget, och kolonet är ett tecken man
 * inte kan skriva utan att flytta handen från siffrorna. Därför sätts det dit
 * av sig självt medan man skriver: "0630" blir "06:30", "9" blir "09:".
 *
 * Masken ligger här och inte i komponenten, av två skäl. Servern måste tolka
 * samma sträng likadant — ett formulär kan skickas utan att JavaScript hunnit
 * köra, och då kommer "0630" fram som det skrevs. Och en mask som gissar fel
 * ska gissa fel på ett enda ställe.
 */

/**
 * Formaterar det som står i fältet medan det skrivs.
 *
 * `deleting` är sant när tryckningen tog bort tecken. Utan den skulle ett
 * kolon som masken själv satt dit komma tillbaka direkt efter backsteg, och
 * fältet gick inte att tömma.
 */
export function maskTimeInput(raw: string, deleting = false): string {
  const cleaned = raw.replace(/[^\d:.]/g, "");
  const separator = cleaned.search(/[:.]/);

  if (separator !== -1) {
    const hour = cleaned.slice(0, separator).replace(/\D/g, "").slice(0, 2);
    const minute = cleaned
      .slice(separator + 1)
      .replace(/\D/g, "")
      .slice(0, 2);
    return `${hour}:${minute}`;
  }

  const digits = cleaned.slice(0, 4);

  switch (digits.length) {
    case 0:
      return "";
    // En sjua kan bara vara klockan sju — inget klockslag börjar på 7 och har
    // en siffra till. Alltså fylls nollan och kolonet i direkt.
    case 1:
      return !deleting && digits > "2" ? `0${digits}:` : digits;
    case 2:
      return deleting ? digits : `${digits}:`;
    // Tre siffror utan kolon uppstår vid inklistring: "630" är 6:30, medan
    // "123" rimligare är 12:3 på väg mot 12:30.
    case 3:
      return Number(digits.slice(0, 2)) <= 23
        ? `${digits.slice(0, 2)}:${digits.slice(2)}`
        : `${digits.slice(0, 1)}:${digits.slice(1)}`;
    default:
      return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }
}

/**
 * "630", "6.30", "6:30" → "06:30". Ger null på något som inte är ett klockslag.
 *
 * Enbart timme räknas som hel timme: "9" är 09:00.
 */
export function normalizeTimeOfDay(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  // Minuterna får saknas: "9" blir "09:" av masken, och den som skrivit så
  // och sparar menar klockan nio. Halva timmar skrivs ut, hela gör man inte.
  const withSeparator = /^(\d{1,2})[:.](\d{0,2})$/.exec(trimmed);
  const digitsOnly = /^(\d{1,4})$/.exec(trimmed);

  let hour: number;
  let minute: number;

  if (withSeparator) {
    hour = Number(withSeparator[1]);
    minute = withSeparator[2] === "" ? 0 : Number(withSeparator[2]);
  } else if (digitsOnly) {
    const digits = digitsOnly[1];
    if (digits.length <= 2) {
      hour = Number(digits);
      minute = 0;
    } else {
      hour = Number(digits.slice(0, digits.length - 2));
      minute = Number(digits.slice(-2));
    }
  } else {
    return null;
  }

  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
