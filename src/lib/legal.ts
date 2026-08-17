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

export interface Subprocessor {
  name: string;
  /** Vad de gör för oss. Skrivs som en fullständig mening. */
  purpose: string;
  /** Var behandlingen sker. */
  location: string;
}

/**
 * Underbiträden.
 *
 * Ändras listan ska berörda kunder informeras i förväg — det står i
 * biträdesavtalet och är ett åtagande, inte en artighet.
 */
export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Hetzner Online GmbH",
    purpose: "Driftar servern där tjänsten och databasen körs.",
    location: "Tyskland",
  },
  {
    name: "Stripe Payments Europe, Ltd.",
    purpose:
      "Hanterar betalningar och prenumerationer. Behandlar kundens fakturauppgifter, inte uppgifter om anställda.",
    location: "Irland",
  },
  {
    name: "Microsoft Ireland Operations Ltd.",
    purpose:
      "Skickar systemets e-post, exempelvis återställning av lösenord och inbjudningar. Behandlar administratörers adresser, inte uppgifter om anställda.",
    location: "EU",
  },
];

/** Bolaget bakom tjänsten. */
export const PROVIDER = {
  name: "TERAFALK AB",
  service: "Tikkr",
  support: "support@tikkr.se",
} as const;
