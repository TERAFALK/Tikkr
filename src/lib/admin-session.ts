import { redirect } from "next/navigation";
import { auth } from "./auth";
import { unsafeGlobalPrisma } from "./db";
import { forCompany, type CompanyDb } from "./tenant";

/**
 * Grinden till adminpanelen.
 *
 * Varje adminsida och varje serveråtgärd ska börja med `requireAdmin()`. Den
 * gör två saker i ett svep: kastar ut den som inte är inloggad, och lämnar
 * tillbaka en databasklient som är låst till just den personens företag.
 *
 * Poängen är att det ska vara enklare att göra rätt än fel. Den som skriver en
 * ny adminsida får företagsfiltreringen på köpet — det finns ingen genväg
 * förbi som råkar bli den bekväma vägen.
 *
 * KONTOT SLÅS UPP VID VARJE ANROP, inte bara vid inloggning.
 *
 * Sessionen är en signerad token som webbläsaren bär med sig, och den kan inte
 * ändras i efterhand. Läste vi bara den skulle "ta bort administratör" inte
 * återkalla någonting — personen vore kvar tills token gick ut, som mest
 * trettio dagar senare. Samma sak med en ägare som degraderats: token skulle
 * fortsätta hävda OWNER, och rollen är det som styr vem som får bjuda in och
 * ta bort konton.
 *
 * Uppslaget är en fråga på primärnyckel, alltså i samma storleksordning som
 * allt annat en sidladdning ändå gör. Plattformspanelen har kontrollerat sin
 * behörighet på det här sättet från början — se requirePlatformAdmin().
 */

export interface AdminSession {
  userId: string;
  email: string;
  companyId: string;
  companyName: string;
  role: string;
  /** Databasklient låst till användarens företag. */
  db: CompanyDb;
}

/**
 * Den inloggade administratören, eller null.
 *
 * Används där ett utkast till inloggningssidan vore fel svar — i API-rutter,
 * som ska svara med en statuskod i stället för en omdirigering.
 */
export async function currentAdmin(): Promise<AdminSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Går via den ofiltrerade klienten: vilket företag kontot tillhör är just
  // det vi håller på att ta reda på, och får därför inte antas av frågan.
  const account = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      role: true,
      companyId: true,
      passwordChangedAt: true,
      company: { select: { name: true } },
    },
  });

  if (!account) return null;

  // En session som utfärdades före det senaste lösenordsbytet gäller inte.
  // Annars vore det meningslöst att byta lösenord när man misstänker att någon
  // annan är inne — den andras inloggning skulle fortsätta fungera.
  //
  // Utfärdandetiden räknas i hela sekunder. En marginal på en sekund gör att
  // den som byter sitt eget lösenord och loggas in på nytt i samma ögonblick
  // inte råkar kastas ut av sin egen ändring.
  if (account.passwordChangedAt && session.user.issuedAt) {
    const issued = session.user.issuedAt * 1000;
    if (issued < account.passwordChangedAt.getTime() - 1000) return null;
  }

  // Allt kommer från databasen, inget från token. Ett företagsnamn som ändrats
  // under Inställningar slår därmed igenom direkt i stället för vid nästa
  // inloggning.
  return {
    userId: account.id,
    email: account.email,
    companyId: account.companyId,
    companyName: account.company.name,
    role: account.role,
    db: forCompany(account.companyId),
  };
}

export async function requireAdmin(): Promise<AdminSession> {
  const admin = await currentAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  return admin;
}
