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
      sessionsRevokedAt: new Date(),
    },
  });
}
