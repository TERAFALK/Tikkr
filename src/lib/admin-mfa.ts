import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";
import {
  clearFailedLogins,
  isLockedOut,
  LOCKED_OUT_MESSAGE,
  noteFailedLogin,
} from "./login-throttle";
import { verifyTotp } from "./totp";
import { openSecret, sealSecret } from "./totp-box.mjs";
import { enrollmentFor, newTotpSecret, type Enrollment } from "./two-step";
import { sendEmail } from "./email";
import { loginCodeEmail } from "./emails";

/**
 * INLOGGNINGEN TILL ADMINPANELEN, I TVÅ STEG (infört 2026-10-06).
 *
 * Tvåstegsinloggning är obligatorisk för alla ägare och administratörer.
 * Panelen bär fakturaunderlag, löneunderlag och kunduppgifter, och ett
 * lösenord ensamt räckte för att komma åt dem — och för att ändra tid som
 * redan fakturerats.
 *
 *   Steg 1  e-post och lösenord           checkAdminPassword
 *   Steg 2  QR-kod första gången, sedan    adminTwoStep, verifyAdminCode
 *           koden från appen
 *
 * Mellan stegen bär webbläsaren en signerad lapp, se login-ticket.ts.
 *
 * Uppslaget av kontot går via den ofiltrerade klienten, av samma skäl som
 * förut: vilket företag kontot tillhör är just det inloggningen ska ta reda
 * på. Efter inloggningen går all åtkomst via forCompany().
 *
 * Antalet gissningar är begränsat, både på lösenord och på kod, med samma
 * broms och samma räknare per e-postadress. Fem fel, oavsett vilket steg,
 * och kontot vilar en kvart.
 */

/** Samma räknare som tidigare låg i auth.ts. Se login-throttle.ts. */
const THROTTLE_SCOPE = "admin";

/**
 * Spärren per IP-adress, utöver spärren per konto.
 *
 * Spärren per konto stoppar den som gissar länge på ETT konto. Den stoppar
 * inte den som prövar ett läckt lösenord mot tusen olika adresser, eftersom
 * varje adress bara får ett försök. Taket är högre: en verkstad delar ofta en
 * enda utgående adress, och tre personer som skriver fel ska inte stänga ute
 * de andra.
 */
const IP_SCOPE = "admin-ip";
const IP_MAX_FAILURES = 30;

/**
 * En riktig hash av ett lösenord ingen har. Jämförelsen tar då lika lång tid
 * oavsett om kontot finns, och svarstiden avslöjar inte vilka adresser som
 * är kunder.
 */
const UNKNOWN_USER_HASH = bcrypt.hashSync("det-har-losenordet-tillhor-ingen", 12);

export type PasswordCheck =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/** Steg 1: e-post och lösenord. */
export async function checkAdminPassword(params: {
  email: string;
  password: string;
  ip?: string;
}): Promise<PasswordCheck> {
  const email = params.email.trim().toLowerCase();
  const wrong = { ok: false as const, error: "Fel e-postadress eller lösenord." };

  if (!email || !params.password) return wrong;

  // Kontrolleras före uppslaget. Är adressen låst ska ingen tid läggas på att
  // jämföra lösenord — det är hela poängen med spärren.
  if (
    isLockedOut(THROTTLE_SCOPE, email) ||
    (params.ip && isLockedOut(IP_SCOPE, params.ip, IP_MAX_FAILURES))
  ) {
    return { ok: false, error: LOCKED_OUT_MESSAGE };
  }

  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  const correct = await bcrypt.compare(
    params.password,
    user?.passwordHash ?? UNKNOWN_USER_HASH
  );

  if (!user || !correct) {
    noteFailedLogin(THROTTLE_SCOPE, email);
    if (params.ip) noteFailedLogin(IP_SCOPE, params.ip);
    return wrong;
  }

  // Räknaren nollställs först när koden godkänts. Ett rätt lösenord följt av
  // fem felaktiga koder är fortfarande fem fel.
  return { ok: true, userId: user.id };
}

export type TwoStep =
  | { mode: "code"; email: string }
  | { mode: "enroll"; email: string; enrollment: Enrollment };

/**
 * Steg 2: vad som ska visas.
 *
 * Har kontot en bekräftad app räcker ett fält för koden. Annars visas
 * QR-koden. Nyckeln skapas första gången och återanvänds tills den
 * bekräftats, så att den som laddar om sidan efter att ha skannat inte får en
 * ny kod som appen inte känner till.
 */
export async function adminTwoStep(userId: string): Promise<TwoStep | null> {
  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: userId },
    select: { email: true, totpSecret: true, totpEnabledAt: true },
  });

  if (!user) return null;

  const authSecret = process.env.AUTH_SECRET ?? "";

  if (user.totpEnabledAt && user.totpSecret) {
    return { mode: "code", email: user.email };
  }

  let secret = user.totpSecret ? openSecret(user.totpSecret, authSecret) : null;

  if (!secret) {
    secret = newTotpSecret();
    await unsafeGlobalPrisma.adminUser.update({
      where: { id: userId },
      data: {
        totpSecret: sealSecret(secret, authSecret),
        totpEnabledAt: null,
        totpLastStep: null,
      },
    });
  }

  return {
    mode: "enroll",
    email: user.email,
    enrollment: enrollmentFor(user.email, secret),
  };
}

/**
 * Prövar koden från appen. Den första godkända koden bekräftar uppsättningen.
 *
 * Kallas av inloggningen i auth.ts, som skapar sessionen först när den här
 * svarat ja.
 */
export async function verifyAdminCode(
  userId: string,
  code: string,
  now: Date = new Date()
): Promise<boolean> {
  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: userId },
    select: {
      email: true,
      totpSecret: true,
      totpEnabledAt: true,
      totpLastStep: true,
    },
  });

  if (!user?.totpSecret) return false;

  if (isLockedOut(THROTTLE_SCOPE, user.email)) return false;

  const secret = openSecret(user.totpSecret, process.env.AUTH_SECRET ?? "");
  const step = secret ? verifyTotp(secret, code, now, user.totpLastStep) : null;

  if (step === null) {
    noteFailedLogin(THROTTLE_SCOPE, user.email);
    return false;
  }

  // Perioden skrivs med villkor, så att två inloggningar med samma kod i
  // samma ögonblick inte båda går igenom: den andra hittar ingen rad.
  const claimed = await unsafeGlobalPrisma.adminUser.updateMany({
    where: {
      id: userId,
      OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
    },
    data: {
      totpLastStep: step,
      totpEnabledAt: user.totpEnabledAt ?? now,
    },
  });

  if (claimed.count === 0) {
    noteFailedLogin(THROTTLE_SCOPE, user.email);
    return false;
  }

  clearFailedLogins(THROTTLE_SCOPE, user.email);
  return true;
}

/**
 * Nollställer tvåstegsinloggningen. Nästa inloggning visar en ny QR-kod.
 *
 * För den som tappat bort sin telefon. Görs från plattformspanelen, efter att
 * vi kontrollerat vem som ringer, se platform-admin.ts. Inloggade sessioner
 * avslutas samtidigt: en telefon som kommit bort kan ha hamnat hos någon som
 * redan är inne.
 */
export async function resetAdminMfa(userId: string): Promise<void> {
  await unsafeGlobalPrisma.adminUser.update({
    where: { id: userId },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      totpLastStep: null,
      loginCodeHash: null,
      loginCodeExpiresAt: null,
      // Avslutar också ihågkomna datorer, se trusted-device.ts.
      sessionsRevokedAt: new Date(),
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Inloggningsalternativ: kod via e-post (infört 2026-10-07)                   */
/* -------------------------------------------------------------------------- */

/** Hur länge en kod via e-post gäller. */
export const EMAIL_CODE_MINUTES = 10;

/** Hur ofta en ny kod får skickas. Annars blir knappen ett sätt att fylla
 *  någons inkorg. */
const EMAIL_CODE_COOLDOWN_MS = 60 * 1000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** "anna@mekaniska.se" som "a•••@mekaniska.se". Visas innan koden skickas. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local[0]}•••@${domain}`;
}

/**
 * Vilka alternativ till appen kontot har just nu.
 *
 * Appen är obligatorisk och sätts alltid upp först (beslutat 2026-10-07).
 * E-post är ett ALTERNATIV vid inloggningen, som Microsofts "Logga in på ett
 * annat sätt", för dagen telefonen ligger hemma. Två villkor:
 *
 *   1. Adressen är bekräftad. En obekräftad adress kan ha ett stavfel, och
 *      koden skulle då gå till någon annan.
 *   2. Lösenordet har inte just återställts via mejl. Annars hade den som
 *      kommit åt inkorgen kunnat byta lösenordet OCH ta emot koden, och
 *      tvåstegsinloggningen skyddat mot ingenting. Efter en återställning
 *      krävs appen.
 */
export async function loginAlternatives(
  userId: string,
  afterReset: boolean
): Promise<{ email: string | null }> {
  if (afterReset) return { email: null };

  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true, totpEnabledAt: true },
  });

  if (!user?.totpEnabledAt || !user.emailVerifiedAt) return { email: null };
  return { email: maskEmail(user.email) };
}

export type EmailCodeOutcome = "sent" | "cooldown" | "unavailable" | "failed";

/**
 * Skickar en sexsiffrig kod till kontots adress.
 *
 * Anroparen har redan kontrollerat lösenordet (lappen i login-ticket.ts) och
 * att alternativet är tillåtet. Villkoren prövas ändå här igen: en funktion
 * som skickar koder ska inte lita på att den anropats från rätt ställe.
 */
export async function sendEmailLoginCode(
  userId: string,
  afterReset: boolean
): Promise<EmailCodeOutcome> {
  const allowed = await loginAlternatives(userId, afterReset);
  if (!allowed.email) return "unavailable";

  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: userId },
    select: { email: true, loginCodeSentAt: true },
  });
  if (!user) return "unavailable";

  if (
    user.loginCodeSentAt &&
    Date.now() - user.loginCodeSentAt.getTime() < EMAIL_CODE_COOLDOWN_MS
  ) {
    return "cooldown";
  }

  // randomInt ger jämn fördelning, vilket modulo på ett slumptal inte gör.
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();

  await unsafeGlobalPrisma.adminUser.update({
    where: { id: userId },
    data: {
      loginCodeHash: hashCode(code),
      loginCodeExpiresAt: new Date(now.getTime() + EMAIL_CODE_MINUTES * 60 * 1000),
      loginCodeSentAt: now,
    },
  });

  const result = await sendEmail(
    loginCodeEmail({ to: user.email, code, minutesValid: EMAIL_CODE_MINUTES })
  );

  if (!result.delivered && result.provider !== "log") {
    console.error(
      `[inloggningskod] Mejlet till ${user.email} gick inte fram: ` +
        `${result.problem ?? "okänd orsak"}`
    );
    return "failed";
  }

  return "sent";
}

/**
 * Prövar en kod som skickats via e-post. Används en gång, sedan töms den.
 *
 * Felaktiga försök räknas av samma broms som lösenord och appkoder: fem fel
 * och kontot vilar en kvart. Sex siffror är en miljon kombinationer, och utan
 * bromsen vore tio minuter gott om tid.
 */
export async function verifyEmailLoginCode(
  userId: string,
  code: string,
  afterReset: boolean,
  now: Date = new Date()
): Promise<boolean> {
  if (afterReset) return false;

  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: userId },
    select: {
      email: true,
      loginCodeHash: true,
      loginCodeExpiresAt: true,
      emailVerifiedAt: true,
      totpEnabledAt: true,
    },
  });

  if (!user?.loginCodeHash || !user.loginCodeExpiresAt) return false;
  if (!user.emailVerifiedAt || !user.totpEnabledAt) return false;
  if (isLockedOut(THROTTLE_SCOPE, user.email)) return false;

  const given = code.replace(/\s/g, "");
  const expected = Buffer.from(user.loginCodeHash);
  const actual = Buffer.from(hashCode(given));

  const correct =
    /^\d{6}$/.test(given) &&
    user.loginCodeExpiresAt > now &&
    expected.length === actual.length &&
    timingSafeEqual(expected, actual);

  if (!correct) {
    noteFailedLogin(THROTTLE_SCOPE, user.email);
    return false;
  }

  // Töms med villkor på samma fingeravtryck, så att två inloggningar med
  // samma kod i samma ögonblick inte båda går igenom.
  const claimed = await unsafeGlobalPrisma.adminUser.updateMany({
    where: { id: userId, loginCodeHash: user.loginCodeHash },
    data: { loginCodeHash: null, loginCodeExpiresAt: null },
  });

  if (claimed.count === 0) return false;

  clearFailedLogins(THROTTLE_SCOPE, user.email);
  return true;
}
