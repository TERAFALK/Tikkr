/**
 * PENGAR.
 *
 * Allt lagras i ÖREN som heltal, aldrig i kronor som decimaltal. Skälet är
 * detsamma som för att tid lagras i minuter: 182,50 går inte att spara exakt
 * i ett flyttal, och felet syns så fort hundra rader summeras. Ett belopp som
 * inte stämmer på öret i ett fakturaunderlag är ett belopp ingen litar på.
 *
 * Påslag lagras som heltalsprocent. 140 betyder ×1,40.
 */

/**
 * Ören som "1 234,50 kr".
 *
 * Tusentalsavgränsaren är ett VANLIGT mellanslag, inte det hårda som
 * `toLocaleString("sv-SE")` ger. PDF:erna skrivs med pdfkit i WinAnsi, och ett
 * tecken utanför den tabellen kan bli en fyrkant mitt i ett belopp.
 */
export function formatCurrency(ore: number): string {
  const negative = ore < 0;
  const [whole, decimals] = (Math.abs(ore) / 100).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return `${negative ? "-" : ""}${grouped},${decimals} kr`;
}

/** Påslaget som "×1,40". Visas där en summa räknas upp till ett pris. */
export function formatMarkup(percent: number): string {
  return `×${(percent / 100).toFixed(2).replace(".", ",")}`;
}

/**
 * Läser ett kronbelopp och ger ören.
 *
 * Både punkt och komma godtas som decimaltecken — ett svenskt tangentbord ger
 * komma, och att avvisa "182,50" vore att kräva att kunden skriver som datorn
 * vill. Mellanslag i "1 250" tas bort.
 *
 * Tomt fält betyder INGEN angiven kostnad, vilket är något annat än noll
 * kronor. Därför null och inte 0.
 */
export function parseOre(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");

  if (!text) return null;

  const kronor = Number(text);
  if (!Number.isFinite(kronor) || kronor < 0) return null;

  return Math.round(kronor * 100);
}

/** Minsta och största påslag som godtas, uttryckt som faktor. */
const MIN_MARKUP = 1;
const MAX_MARKUP = 10;

/**
 * Läser ett påslag skrivet som FAKTOR ("1,4") och ger procent (140).
 *
 * Faktorn och inte procenten, eftersom det är så kunden redan räknar i sitt
 * kalkylark: kostnad gånger 1,4. Att be om "40" när de tänker "1,4" är att
 * bjuda in till ett fel som blir fyrtio gånger för dyrt.
 *
 * Just därför spärren uppåt: skriver någon ändå "40" är det nästan säkert
 * procent, och då ska fältet vägra i stället för att sätta ett påslag på
 * trehundranittionio procent. Under 1 vägras också — att sälja under
 * självkostnad är inte ett påslag, och menar man det ska det inte ske genom
 * ett fält som heter så.
 *
 * Tomt fält ger null, vilket anroparen får tolka: på ordern betyder det
 * "företagets standard gäller".
 */
export function parseMarkupPercent(
  raw: FormDataEntryValue | null
): number | null {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;

  const factor = Number(text);
  if (!Number.isFinite(factor)) return null;
  if (factor < MIN_MARKUP || factor > MAX_MARKUP) return null;

  return Math.round(factor * 100);
}

/**
 * Kostnad för en tid, givet en timkostnad. Båda i ören.
 *
 * Räknar i minuter hela vägen och avrundar EN gång, sist. Att först göra om
 * minuter till decimaltimmar och sedan multiplicera hade avrundat två gånger,
 * och den andra avrundningen hade skett på ett belopp.
 */
export function costForMinutes(minutes: number, rateOre: number): number {
  return Math.round((minutes * rateOre) / 60);
}

/** Självkostnad uppräknad med påslaget. Ören in, ören ut. */
export function applyMarkup(costOre: number, markupPercent: number): number {
  return Math.round((costOre * markupPercent) / 100);
}
