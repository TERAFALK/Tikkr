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
 * RÄKNAS I MINNET, inte i databasen. Det räcker så länge appen kör som en
 * process, vilket den gör i dagens uppsättning. Körs den någon gång i flera
 * processer eller på flera servrar nollas räknaren per process, och skyddet
 * försvagas i motsvarande grad — då ska räkningen flyttas till databasen.
 * Noterat här så att det inte glöms bort.
 *
 * Låsningen är per e-postadress, inte per IP. Skälet: den som gissar lösenord
 * mot ETT konto byter lätt IP, medan en verkstad ofta delar en enda utgående
 * adress. En IP-baserad spärr hade alltså stängt ute hela kunden när en person
 * skrev fel.
 */

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/** Meddelandet den utelåsta får se. Samma text i båda panelerna. */
export const LOCKED_OUT_MESSAGE =
  "För många misslyckade försök. Försök igen om femton minuter.";

/**
 * Högsta antalet nycklar räknaren håller.
 *
 * Nycklarna kommer utifrån — en e-postadress, en IP — och den som skickar en
 * ny för varje anrop fyller annars minnet tills processen dör. Vid taket rensas
 * först det som löpt ut, sedan de äldsta. Att glömma en gammal räkning ger en
 * gissare ett par försök till; att krascha ger alla kunder ett avbrott.
 */
const MAX_KEYS = 10_000;

const attempts = new Map<string, { count: number; until: number }>();

function key(scope: string, email: string): string {
  return `${scope}:${email}`;
}

/**
 * true när adressen är låst just nu.
 *
 * `scope` skiljer kundinloggningen från plattformsinloggningen, så att
 * misslyckade försök på den ena aldrig låser den andra. Samma person kan ha
 * konto på båda hållen.
 *
 * `maxAttempts` behövs för räknare som gäller fler än en person, som det
 * gemensamma taket för kopplingskoder. Fem är rätt för ett konto men inte för
 * en hel installation.
 */
export function isLockedOut(
  scope: string,
  email: string,
  maxAttempts: number = MAX_ATTEMPTS
): boolean {
  const record = attempts.get(key(scope, email));
  if (!record) return false;

  if (record.until < Date.now()) {
    attempts.delete(key(scope, email));
    return false;
  }

  return record.count >= maxAttempts;
}

/** Räknar upp ett misslyckat försök och förlänger låsningen. */
export function noteFailedLogin(scope: string, email: string): void {
  const id = key(scope, email);
  const record = attempts.get(id) ?? { count: 0, until: 0 };

  record.count += 1;
  record.until = Date.now() + LOCKOUT_MS;

  // Tas bort och läggs in igen, så att kartans ordning blir "senast rörd sist"
  // och rensningen nedan tar de äldsta först.
  attempts.delete(id);
  attempts.set(id, record);

  if (attempts.size > MAX_KEYS) prune();
}

function prune(): void {
  const now = Date.now();

  for (const [id, record] of attempts) {
    if (record.until < now) attempts.delete(id);
  }

  for (const id of attempts.keys()) {
    if (attempts.size <= MAX_KEYS) break;
    attempts.delete(id);
  }
}

/** Nollställer efter en lyckad inloggning. */
export function clearFailedLogins(scope: string, email: string): void {
  attempts.delete(key(scope, email));
}

/** Nollställer allt. Används av testerna. */
export function __resetThrottle(): void {
  attempts.clear();
}
