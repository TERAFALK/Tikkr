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
 */
export function isLockedOut(scope: string, email: string): boolean {
  const record = attempts.get(key(scope, email));
  if (!record) return false;

  if (record.until < Date.now()) {
    attempts.delete(key(scope, email));
    return false;
  }

  return record.count >= MAX_ATTEMPTS;
}

/** Räknar upp ett misslyckat försök och förlänger låsningen. */
export function noteFailedLogin(scope: string, email: string): void {
  const id = key(scope, email);
  const record = attempts.get(id) ?? { count: 0, until: 0 };

  record.count += 1;
  record.until = Date.now() + LOCKOUT_MS;

  attempts.set(id, record);
}

/** Nollställer efter en lyckad inloggning. */
export function clearFailedLogins(scope: string, email: string): void {
  attempts.delete(key(scope, email));
}

/** Nollställer allt. Används av testerna. */
export function __resetThrottle(): void {
  attempts.clear();
}
