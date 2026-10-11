/**
 * HJÄLPCENTRETS OMRÅDEN.
 *
 * Grupperna guiderna sorteras i. Ordningen här är ordningen på startsidan och
 * följer hur en ny kund rör sig: först uppsättningen, sedan det som händer i
 * verkstaden, sedan det som händer på kontoret, och sist tillvalen och kontot.
 *
 * Ligger i en egen fil och inte bland guiderna, eftersom samma lista ska bära
 * formuläret för fel och förslag i nästa steg: ett meddelande märkt
 * "Planering" ska betyda samma sak i hjälpcentret och i inkorgen.
 *
 * Inga importer, så att filen kan läsas från vilket håll som helst.
 */

export const HELP_AREAS = {
  START: { label: "Kom igång" },
  KIOSK: { label: "Stämplingsskärmen" },
  REGISTERS: { label: "Ordrar och register" },
  DOCUMENTS: { label: "Granskning och underlag" },
  PAYROLL: { label: "Löneunderlag" },
  PLANNING: { label: "Planering" },
  ACCOUNT: { label: "Konto och prenumeration" },
} as const;

export type HelpAreaKey = keyof typeof HELP_AREAS;

export const HELP_AREA_KEYS = Object.keys(HELP_AREAS) as HelpAreaKey[];
