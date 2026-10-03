/**
 * SÄLJSIDANS LÄNKAR, SOM REN DATA.
 *
 * Ligger i en egen fil och inte i `SiteChrome.tsx` eftersom tre komponenter
 * behöver dem: skalet (en serverkomponent), menyn (en klientkomponent) och
 * sidfoten. Låg de kvar i skalet skulle menyn importera från en fil som
 * importerar menyn.
 */

export interface SiteLink {
  href: string;
  label: string;
}

/**
 * Adresserna inleds med snedstreck.
 *
 * Ett ensamt "#pris" betyder "avsnittet pris på DEN HÄR sidan". Står man på
 * villkorssidan finns inget sådant avsnitt, och länken leder till
 * /villkor#pris där ingenting händer. Med "/#pris" går den alltid till
 * startsidan först.
 */
export const NAV: SiteLink[] = [
  { href: "/#sa-funkar-det", label: "Så fungerar det" },
  { href: "/#underlag", label: "Dokument" },
  { href: "/#funktioner", label: "Innehåll" },
  { href: "/#pris", label: "Pris" },
  { href: "/#fragor", label: "Frågor" },
];

/**
 * De rättsliga sidorna.
 *
 * Länkas i foten på varje sida. Adresserna anges också i betaltjänstens
 * kundportal, som kräver att villkor och integritetspolicy går att nå.
 */
export const LEGAL: SiteLink[] = [
  { href: "/villkor", label: "Användarvillkor" },
  { href: "/integritetspolicy", label: "Integritetspolicy" },
  { href: "/personuppgiftsbitradesavtal", label: "Biträdesavtal" },
];
