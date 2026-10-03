/**
 * VÄGARNA TILL EN MÄNNISKA.
 *
 * En verkstadschef som ska införa ett system i sin produktion vill ofta prata
 * med någon innan. Säljsidan hade bara en supportadress i foten, vilket är en
 * adress för den som redan är kund och har ett problem — inte för den som
 * funderar på att köpa.
 *
 * TOMMA VÄRDEN DÖLJER SIG SJÄLVA. Varje yta som använder filen kontrollerar att
 * strängen inte är tom innan den ritar något. En halvfylld fil ska aldrig kunna
 * visa "Ring " utan nummer, eller en knapp som leder till ingenting.
 *
 * Värdena står här och inte i en miljövariabel. Ett telefonnummer är inte en
 * hemlighet och ändras inte oftare än en driftsättning — till skillnad från
 * priserna, som hämtas från betaltjänsten just för att de ska gå att ändra utan
 * en.
 */

export const CONTACT = {
  /**
   * Telefonnummer i det format det ska LÄSAS.
   *
   * Grupperat med mellanslag. Ett nummer man ska kunna skriva ner medan någon
   * läser upp det går inte att trycka ihop till en sträng.
   */
  phone: "+46 70 868 15 61",

  /**
   * Samma nummer i det format det ska RINGAS, t.ex. "+46340123456".
   *
   * Två fält och inte ett: `tel:`-länken vill ha landsnummer utan mellanrum,
   * och det numret är obegripligt att läsa. Skrevs bara det ena fick antingen
   * ögat eller telefonen fel version.
   */
  phoneHref: "+46708681561",

  /** Länk till en bokad genomgång. Tom när ingen sådan finns. */
  bookingUrl: "",

  /** Supportadressen. Står redan i sidfoten och har alltid funnits. */
  email: "support@tikkr.se",
} as const;

/** True när det finns ett nummer att visa. Båda fälten krävs. */
export function hasPhone(): boolean {
  return CONTACT.phone.length > 0 && CONTACT.phoneHref.length > 0;
}

/** True när det finns en bokningslänk att visa. */
export function hasBooking(): boolean {
  return CONTACT.bookingUrl.length > 0;
}
