/**
 * HJÄLPCENTRETS OMRÅDEN.
 *
 * Grupperna guiderna sorteras i. Ordningen här är ordningen på startsidan och
 * följer hur en ny kund rör sig: först uppsättningen, sedan det som händer i
 * verkstaden, sedan det som händer på kontoret, och sist tillvalen och kontot.
 *
 * Ligger i en egen fil och inte bland guiderna, eftersom samma lista bär
 * formuläret på sidan Support: ett meddelande märkt "Planering" ska betyda
 * samma sak i hjälpcentret och i inkorgen.
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

export function isHelpAreaKey(value: string): value is HelpAreaKey {
  return Object.hasOwn(HELP_AREAS, value);
}

/**
 * Vilket område en sida i panelen hör till. Förväljer området i formuläret på
 * sidan Support, när någon kommer dit från Planering eller Tidrapport.
 *
 * Inställningar delas mellan löneunderlaget och kontot och har därför bara
 * rader för sina undersidor. Översikten hör inte till något område.
 */
const AREA_BY_PATH: readonly (readonly [string, HelpAreaKey])[] = [
  ["/admin/kom-igang", "START"],
  ["/admin/skarmar", "KIOSK"],
  ["/admin/ordrar", "REGISTERS"],
  ["/admin/kunder", "REGISTERS"],
  ["/admin/anstallda", "REGISTERS"],
  ["/admin/moment", "REGISTERS"],
  ["/admin/improduktivt", "REGISTERS"],
  ["/admin/granskning", "DOCUMENTS"],
  ["/admin/stamplingar", "DOCUMENTS"],
  ["/admin/rapporter", "DOCUMENTS"],
  ["/admin/vecka", "DOCUMENTS"],
  ["/admin/installningar/tider", "DOCUMENTS"],
  ["/admin/tidrapport", "PAYROLL"],
  ["/admin/installningar/schema", "PAYROLL"],
  ["/admin/installningar/franvaro", "PAYROLL"],
  ["/admin/planering", "PLANNING"],
  ["/admin/konto", "ACCOUNT"],
  ["/admin/installningar/prenumeration", "ACCOUNT"],
  ["/admin/installningar/anvandare", "ACCOUNT"],
  ["/admin/installningar/dataskydd", "ACCOUNT"],
];

export function areaForPath(path: string | null | undefined): HelpAreaKey | null {
  if (!path) return null;
  const match = AREA_BY_PATH.find(
    ([prefix]) => path === prefix || path.startsWith(`${prefix}/`)
  );
  return match ? match[1] : null;
}
