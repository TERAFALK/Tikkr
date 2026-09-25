import { redirect } from "next/navigation";
import { auth } from "./auth";
import { unsafeGlobalPrisma } from "./db";
import { forCompany, type CompanyDb } from "./tenant";
import { readSupportSession } from "./support-session";

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
 *
 * SUPPORTLÄGET går också genom den här grinden. Finns en giltig supportcookie
 * lämnas en session för kundens företag, men med LEVERANTÖRENS adress och en
 * databasklient som vägrar skriva. Se support-session.ts för varför inget
 * kundkonto lånas.
 */

export interface AdminSession {
  userId: string;
  email: string;
  companyId: string;
  companyName: string;
  role: string;
  /** Databasklient låst till användarens företag. */
  db: CompanyDb;
  /**
   * Satt när detta är ett SUPPORTBESÖK och inte kundens egen inloggning.
   *
   * `db` vägrar då skriva. Sidor som skriver utanför det lagret — alltså via
   * `unsafeGlobalPrisma` — måste kalla `assertWritable()` först.
   */
  support?: SupportContext;
}

export interface SupportContext {
  /** Besökets rad i support_visits. */
  visitId: string;
}

/** Sidan som förklarar att supportläget bara får läsa. */
export const READ_ONLY_PATH = "/admin/lasage";

/**
 * VAKTEN FÖR SKRIVNINGAR I SUPPORTLÄGE.
 *
 * `session.db` vägrar redan skriva, så det mesta är täckt utan att någon behöver
 * tänka på det. Men två vägar går runt den:
 *
 *   - `Company` kan inte filtreras på sig själv och nås via `unsafeGlobalPrisma`.
 *   - `clock.ts`, `admin-users.ts` och `quick-order.ts` tar ett companyId och
 *     bygger sin EGEN klient.
 *
 * Därför ska VARJE serveråtgärd i panelen börja med den här raden. Att det inte
 * glöms bevisas av tests/support-coverage.test.ts, som läser källfilerna.
 *
 * OMDIRIGERAR, KASTAR INTE.
 *
 * Först kastade den ett undantag. Adminpanelen saknade felgräns, så resultatet
 * blev ramverkets råa felsida — engelsk text och ett spårnings-id, i praktiken
 * "något gick sönder". Men ingenting gick sönder: systemet gjorde precis det det
 * skulle. Ett VÄNTAT nej hör inte till felhanteringen.
 *
 * redirect() fungerar i alla åtgärder oavsett form, både de som returnerar ett
 * tillstånd till useActionState och de som inte returnerar något. Ett svar per
 * åtgärdsform hade blivit fjorton olika sätt att säga samma sak.
 */
export function assertWritable(session: AdminSession): void {
  if (session.support) redirect(READ_ONLY_PATH);
}

/**
 * Den inloggade administratören, eller null.
 *
 * Används där ett utkast till inloggningssidan vore fel svar — i API-rutter,
 * som ska svara med en statuskod i stället för en omdirigering.
 */
export async function currentAdmin(): Promise<AdminSession | null> {
  // SUPPORTBESÖKET GÅR FÖRST. Finns båda cookiarna är avsikten otvetydig: den
  // som just startat ett supportbesök vill se kundens panel, inte sin egen.
  // Att låta kundsessionen vinna hade dessutom gett skrivrätt i ett läge som
  // ser ut som läsläge, vilket är det värsta av de två utfallen.
  const support = await readSupportSession();
  if (support) return supportAdmin(support);

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

/**
 * Kundens panel sedd av leverantören.
 *
 * Företagsnamnet slås upp för att bannern ska kunna säga vems panel det är —
 * ett supportläge som inte skriver ut kundens namn är ett läge man glömmer att
 * man är i.
 *
 * Saknas företaget är besöket ogiltigt. Kan hända om kunden raderats under
 * besöket; då är rätt svar ingen session alls.
 */
async function supportAdmin(
  support: NonNullable<Awaited<ReturnType<typeof readSupportSession>>>
): Promise<AdminSession | null> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: support.companyId },
    select: { name: true },
  });

  if (!company) return null;

  await touchVisit(support.visitId);

  return {
    // Inget kundkonto lånas. Id:t pekar ut besöket, så att en rad som ändå
    // skulle skrivas går att spåra till rätt tillfälle.
    userId: `support:${support.visitId}`,
    email: support.email,
    companyId: support.companyId,
    companyName: company.name,
    // Rollen är inte OWNER. Sidor som gömmer knappar för icke-ägare gömmer dem
    // då även här, vilket är rätt håll att fela på.
    role: "SUPPORT",
    db: forCompany(support.companyId, { readOnly: true }),
    support: { visitId: support.visitId },
  };
}

/**
 * Skriver ner att besöket fortfarande pågår.
 *
 * Högst en gång per minut. En halvtimme i panelen är många sidladdningar, och
 * loggen behöver veta hur länge besöket varade — inte varje klick.
 *
 * Fel sväljs. Ett besök som inte hinner uppdatera sin tidsstämpel är ett
 * mindre problem än en supportsida som inte går att öppna när kunden ringer.
 */
async function touchVisit(visitId: string): Promise<void> {
  try {
    await unsafeGlobalPrisma.supportVisit.updateMany({
      where: {
        id: visitId,
        lastSeenAt: { lt: new Date(Date.now() - 60_000) },
      },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // Tyst med flit. Se kommentaren ovan.
  }
}

export async function requireAdmin(): Promise<AdminSession> {
  const admin = await currentAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  return admin;
}
