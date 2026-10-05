/**
 * TELEFONNUMMER.
 *
 * Folk skriver sitt nummer på tio sätt: "070-123 45 67", "0701234567",
 * "+46 70 123 45 67", "0046701234567", "+46 (0)70…". Alla betyder samma sak,
 * och lagrades de som de skrevs gick det varken att söka på dem eller att
 * ringa dem med ett tryck.
 *
 * Numret sparas därför i E.164 — "+46701234567" — och visas grupperat för att
 * läsas. Samma uppdelning som `CONTACT` i contact.ts: ett format för telefonen,
 * ett för ögat.
 *
 * Valideringen är medvetet rimlig och inte uttömmande. Den fångar det som är
 * uppenbart fel — för kort, bokstäver, ett nummer utan landsnummer som inte
 * börjar med 0 — och släpper resten. Den enda som med säkerhet vet om ett
 * nummer fungerar är den som svarar.
 *
 * Inga importer, så att filen går att läsa från vilken sida som helst.
 */

/** Längsta respektive kortaste antal siffror i ett E.164-nummer. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Normaliserar till E.164, eller null när numret inte går att tolka.
 *
 * Ett nummer utan landsnummer som börjar med 0 räknas som svenskt.
 */
export function normalizePhone(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  // "+46 (0)70 …" — nollan inom parentes skrivs av den som vill visa båda
  // formerna på en gång, och ska bort.
  value = value.replace(/\(0\)/g, "");

  // Mellanslag, bindestreck, punkter och parenteser är gruppering.
  value = value.replace(/[\s\-.()/]/g, "");

  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  else if (value.startsWith("0")) value = `+46${value.slice(1)}`;

  if (!/^\+\d+$/.test(value)) return null;

  // "+46070…" är en svensk vana: landsnummer OCH riktnummerets nolla.
  if (value.startsWith("+460")) value = `+46${value.slice(4)}`;

  const digits = value.length - 1;
  if (digits < MIN_DIGITS || digits > MAX_DIGITS) return null;
  if (value[1] === "0") return null;

  // Svenska nummer har 7–9 siffror efter landsnumret.
  if (value.startsWith("+46")) {
    const national = value.length - 3;
    if (national < 7 || national > 9) return null;
  }

  return value;
}

/**
 * Ett normaliserat nummer i den form det ska LÄSAS.
 *
 * Svenska mobilnummer grupperas som de brukar skrivas: "+46 70 123 45 67".
 * Övriga svenska nummer får landsnumret avskilt; riktnumren är två till fyra
 * siffror långa och går inte att skilja ut säkert utan en tabell. Utländska
 * nummer visas som de lagrats.
 */
export function formatPhone(e164: string): string {
  const mobile = /^\+46(7\d)(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (mobile) return `+46 ${mobile[1]} ${mobile[2]} ${mobile[3]} ${mobile[4]}`;

  if (e164.startsWith("+46")) return `+46 ${e164.slice(3)}`;

  return e164;
}
