/**
 * Vem som får se plattformspanelen.
 *
 * Ligger i en egen fil, fri från webbramverk och inloggning, av två skäl:
 * den går att testa utan att starta en app, och en säkerhetsregel som är
 * några rader ren logik är lättare att granska än en som ligger inbakad
 * bland annat.
 *
 * Behörigheten styrs av en miljövariabel på servern, inte av ett fält i
 * databasen. Ingen kan alltså ge sig själv den inifrån appen, ens med ett
 * kapat ägarkonto — den ändras bara av den som kommer åt servern.
 */

export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;

  // Exakt jämförelse mot hela adressen. En kontroll som accepterade
  // delsträngar skulle släppa in adi@terafalk.com.angripare.se.
  return platformAdminEmails().includes(email.trim().toLowerCase());
}
