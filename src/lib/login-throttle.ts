import { createHash } from "node:crypto";
import { unsafeGlobalPrisma } from "./db";

/**
 * BROMSNING AV LÖSENORDSGISSNINGAR.
 *
 * Används av båda inloggningarna — kundernas adminpanel och plattformspanelen.
 * Reglerna ska vara desamma på båda hållen: den som gissar sig fram till ett
 * kundkonto kommer åt ett företags fakturaunderlag, vilket är illa nog.
 *
 * Fem försök, sedan femton minuters låsning. Tillräckligt strängt för att göra
 * gissning meningslös, tillräckligt milt för att den som skrivit fel tre gånger
 * inte ska behöva höra av sig.
 *
 * RÄKNAS I DATABASEN (ändrat 2026-10-18, säkerhetsgranskningen). Räknaren låg
 * i minnet, och nollades därmed vid varje omstart, alltså vid varje
 * driftsättning: den som gissade på en tvåstegskod fick fem nya försök varje
 * gång en version släpptes. Minnet hade dessutom ett tak, och den som fyllde
 * det med nya nycklar kunde tränga ut en låsning som redan gällde. Tabellen
 * har inget tak, och raderna städas när de löpt ut.
 *
 * Låsningen är per e-postadress, inte per IP. Skälet: den som gissar lösenord
 * mot ETT konto byter lätt IP, medan en verkstad ofta delar en enda utgående
 * adress. En IP-baserad spärr hade alltså stängt ute hela kunden när en person
 * skrev fel. Där en IP-räknare ändå finns ligger den bredvid, med ett högre
 * tak.
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/** Meddelandet den utelåsta får se. Samma text i båda panelerna. */
export const LOCKED_OUT_MESSAGE =
  "För många misslyckade försök. Försök igen om femton minuter.";

/** Nyckeln som den lagras: e-postadresser och IP-adresser sparas inte i klartext. */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * true när nyckeln är låst just nu.
 *
 * `scope` skiljer kundinloggningen från plattformsinloggningen, så att
 * misslyckade försök på den ena aldrig låser den andra. Samma person kan ha
 * konto på båda hållen.
 *
 * `maxAttempts` behövs för räknare som gäller fler än en person, som taket per
 * IP-adress. Fem är rätt för ett konto men inte för en hel verkstad.
 */
export async function isLockedOut(
  scope: string,
  key: string,
  maxAttempts: number = MAX_ATTEMPTS,
  now: Date = new Date()
): Promise<boolean> {
  const record = await unsafeGlobalPrisma.loginThrottle.findUnique({
    where: { scope_keyHash: { scope, keyHash: hashKey(key) } },
    select: { count: true, until: true },
  });

  if (!record || record.until < now) return false;

  return record.count >= maxAttempts;
}

/**
 * Räknar upp ett misslyckat försök och förlänger låsningen.
 *
 * Svarar med räkningen EFTER det här försöket, som den blev i samma fråga.
 * Den som behöver pröva ett tak mot samtidiga anrop ska pröva det talet och
 * inte läsa om räkningen efteråt: då har andra anrop hunnit räkna upp den, och
 * fler än nödvändigt avvisas. Se registreringen.
 */
export async function noteFailedLogin(
  scope: string,
  key: string,
  now: Date = new Date()
): Promise<number> {
  const until = new Date(now.getTime() + LOCKOUT_MS);

  // Det som löpt ut tas bort först, både för den här nyckeln och för alla
  // andra. En räkning som gått ut ska börja om från ett, inte fortsätta där
  // den slutade, och tabellen ska inte växa med varje gissning som gjorts.
  await unsafeGlobalPrisma.loginThrottle.deleteMany({
    where: { until: { lt: now } },
  });

  const where = { scope_keyHash: { scope, keyHash: hashKey(key) } };

  try {
    const row = await unsafeGlobalPrisma.loginThrottle.upsert({
      where,
      create: { scope, keyHash: hashKey(key), count: 1, until },
      update: { count: { increment: 1 }, until },
      select: { count: true },
    });
    return row.count;
  } catch (error) {
    // Två misslyckanden i samma ögonblick kan båda försöka skapa raden. Den
    // som förlorar räknar upp den som vann, så att inget försök går förlorat.
    if ((error as { code?: string } | null)?.code !== "P2002") throw error;

    const row = await unsafeGlobalPrisma.loginThrottle.update({
      where,
      data: { count: { increment: 1 }, until },
      select: { count: true },
    });
    return row.count;
  }
}

/** Nollställer efter en lyckad inloggning. */
export async function clearFailedLogins(scope: string, key: string): Promise<void> {
  await unsafeGlobalPrisma.loginThrottle.deleteMany({
    where: { scope, keyHash: hashKey(key) },
  });
}

/** Nollställer allt. Används av testerna. */
export async function __resetThrottle(): Promise<void> {
  await unsafeGlobalPrisma.loginThrottle.deleteMany({});
}
