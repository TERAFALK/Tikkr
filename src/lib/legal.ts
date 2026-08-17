/**
 * UPPGIFTER SOM ÅTERKOMMER I DE RÄTTSLIGA DOKUMENTEN.
 *
 * Underleverantörer, datum och bolagsuppgifter står i tre dokument samtidigt.
 * Ligger de på ett ställe kan de inte hamna i otakt — och en integritetspolicy
 * som räknar upp andra underleverantörer än biträdesavtalet är värre än ingen
 * alls, eftersom motsägelsen är det första en granskare hittar.
 */

/** Datumet som visas som "senast uppdaterad" i samtliga dokument. */
export const LEGAL_UPDATED = "12 augusti 2026";

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

/** Bolaget bakom tjänsten. */
export const PROVIDER = {
  name: "TERAFALK AB",
  service: "Tikkr",
  support: "support@tikkr.se",
} as const;
