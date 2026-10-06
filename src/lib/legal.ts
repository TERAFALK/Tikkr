/**
 * UPPGIFTER SOM ÅTERKOMMER I DE RÄTTSLIGA DOKUMENTEN.
 *
 * Underleverantörer, datum och bolagsuppgifter står i tre dokument samtidigt.
 * Ligger de på ett ställe kan de inte hamna i otakt — och en integritetspolicy
 * som räknar upp andra underleverantörer än biträdesavtalet är värre än ingen
 * alls, eftersom motsägelsen är det första en granskare hittar.
 */

/** Datumet som visas som "senast uppdaterad" i samtliga dokument. */
export const LEGAL_UPDATED = "5 oktober 2026";

/**
 * Samma dag som raden ovan, i maskinläsbar form. Används av sitemap.
 *
 * TVÅ UPPGIFTER OM SAMMA SAK, vilket den här filen annars finns för att
 * undvika. Skälet: månadens namn på svenska kräver språkdata som en avskalad
 * container inte garanterat har, och ett datum som renderas som "August" i ett
 * juridiskt dokument är sämre än en rad till här.
 *
 * `tests/seo.test.ts` kontrollerar att dag och år stämmer mellan de två.
 */
export const LEGAL_UPDATED_AT = new Date("2026-10-05T00:00:00Z");

/**
 * Var tjänsten driftas.
 *
 * Står i klartext i både integritetspolicyn och biträdesavtalet, och MÅSTE
 * stämma med var produktionsservern faktiskt står. Byts leverantör till en i
 * ett annat land ska den här raden ändras samtidigt — ett påstående om
 * datalagring som inte längre är sant är ett avtalsbrott, inte ett skrivfel.
 */
export const HOSTING_LOCATION = "Sverige";

/**
 * Underbiträden.
 *
 * Namnen publiceras inte. Förteckningen lämnas i stället på begäran, vilket
 * biträdesavtalet anger.
 *
 * Rätten att invända mot ett byte finns kvar — den är själva poängen med
 * artikel 28, och den försvinner inte av att listan inte står på en webbsida.
 * Åtagandet att informera i förväg gäller alltså fortfarande, och listan måste
 * hållas aktuell någonstans för att kunna lämnas ut.
 */
export const SUBPROCESSOR_NOTICE_DAYS = 30;

/**
 * Bolaget bakom tjänsten.
 *
 * ORGANISATIONSNUMMER OCH POSTADRESS SKA FYLLAS I FÖRE LANSERING. Den som
 * säljer en tjänst på nätet ska enligt lagen om elektronisk handel ange dem
 * på webbplatsen, och "anges på fakturan" räcker inte. Tomma värden döljer
 * sig själva, så att en halvfylld rad aldrig visas.
 */
export const PROVIDER = {
  name: "TERAFALK AB",
  service: "Tikkr",
  support: "support@tikkr.se",
  orgNumber: "559376-1504",
  address: "Saleby Rasagården 10, 531 98 Lidköping",
} as const;

/** "TERAFALK AB, org.nr 556…, Gatan 1, 123 45 Ort" med det som är ifyllt. */
export function providerLine(): string {
  return [
    PROVIDER.name,
    PROVIDER.orgNumber && `org.nr ${PROVIDER.orgNumber}`,
    PROVIDER.address,
  ]
    .filter(Boolean)
    .join(", ");
}
