import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";
import { isPlatformAdmin } from "./platform-access";
import { verifyTotp } from "./totp";
import { openSecret, sealSecret } from "./totp-box.mjs";
import { enrollmentFor, newTotpSecret, type Enrollment } from "./two-step";
import {
  clearFailedLogins,
  isLockedOut,
  noteFailedLogin,
  LOCKED_OUT_MESSAGE,
} from "./login-throttle";

/**
 * INLOGGNING TILL PLATTFORMSPANELEN.
 *
 * Två oberoende villkor måste vara uppfyllda:
 *   1. Adressen står i PLATFORM_ADMIN_EMAILS på servern
 *   2. Det finns ett konto i platform_users med rätt lösenord
 *
 * Att de är åtskilda är hela poängen. Den som kommer åt databasen kan skapa
 * ett konto men inte ge det behörighet. Den som kommer åt .env kan ge
 * behörighet men inte skapa ett lösenord. Ett intrång på ett ställe räcker
 * alltså inte.
 *
 * Lösenord sätts BARA från servern, med scripts/platform-user.sh. Det finns
 * ingen registreringssida — en sådan skulle låta den som gissar en tillåten
 * adress hinna först och sätta lösenordet innan den rätta personen gjort det.
 *
 * TVÅSTEGSINLOGGNING KRÄVS (infört 2026-10-06), med samma flöde som kundernas
 * panel: lösenordet i steg ett, sedan QR-koden första gången och därefter
 * koden från appen. Se two-step.ts och login-ticket.ts. Skriptet på servern
 * nollställer om telefonen kommit bort; nästa inloggning visar då en ny
 * QR-kod.
 */

/** Hash av ett lösenord ingen har. Ger samma svarstid för okända konton. */
const UNKNOWN_ACCOUNT_HASH = bcrypt.hashSync("inget-konto-har-detta", 12);

/**
 * Bromsen delas med kundernas inloggning, se src/lib/login-throttle.ts.
 * Nyckeln håller dem åtskilda: misslyckade försök här låser aldrig ett
 * kundkonto med samma adress.
 */
const SCOPE = "platform";

/**
 * Samma besked för varje sorts fel. Ett mer hjälpsamt svar är hjälpsamt även
 * för den som inte ska in.
 */
const WRONG = "Fel adress eller lösenord.";

/* -------------------------------------------------------------------------- */

export interface LoginOutcome {
  ok: boolean;
  email?: string;
  /** Meddelande skrivet för att läsas av en människa. */
  problem?: string;
}

/** Steg 1: adress och lösenord, och att adressen har behörighet. */
export async function checkPlatformPassword(
  rawEmail: string,
  password: string
): Promise<LoginOutcome> {
  const email = rawEmail.trim().toLowerCase();

  if (!email || !password) {
    return { ok: false, problem: "Fyll i både adress och lösenord." };
  }

  if (isLockedOut(SCOPE, email)) {
    return {
      ok: false,
      problem: `${LOCKED_OUT_MESSAGE} Lösenordet kan sättas om på servern.`,
    };
  }

  const account = await unsafeGlobalPrisma.platformUser.findUnique({
    where: { email },
  });

  // Jämförelsen körs även när kontot saknas, mot en känd hash. Annars skulle
  // svarstiden avslöja vilka adresser som finns.
  const correct = await bcrypt.compare(
    password,
    account?.passwordHash ?? UNKNOWN_ACCOUNT_HASH
  );

  // Behörigheten kontrolleras EFTER lösenordet, så att svaret inte skiljer sig
  // beroende på om adressen står i listan eller inte.
  const allowed = isPlatformAdmin(email);

  if (!account || !correct || !allowed) {
    noteFailedLogin(SCOPE, email);
    return { ok: false, problem: WRONG };
  }

  // Räknaren nollställs först när koden godkänts.
  return { ok: true, email };
}

export type PlatformTwoStep =
  | { mode: "code" }
  | { mode: "enroll"; enrollment: Enrollment };

/**
 * Steg 2: vad som ska visas. QR-koden för den som inte satt upp appen, annars
 * fältet för koden. Nyckeln återanvänds tills den bekräftats, så att en
 * omladdning efter skanningen inte ger en ny.
 */
export async function platformTwoStep(
  email: string
): Promise<PlatformTwoStep | null> {
  const account = await unsafeGlobalPrisma.platformUser.findUnique({
    where: { email },
    select: { totpSecret: true, totpEnabledAt: true },
  });

  if (!account || !isPlatformAdmin(email)) return null;

  if (account.totpEnabledAt && account.totpSecret) return { mode: "code" };

  const authSecret = process.env.AUTH_SECRET ?? "";
  let secret = account.totpSecret
    ? openSecret(account.totpSecret, authSecret)
    : null;

  if (!secret) {
    secret = newTotpSecret();
    await unsafeGlobalPrisma.platformUser.update({
      where: { email },
      data: {
        totpSecret: sealSecret(secret, authSecret),
        totpEnabledAt: null,
        totpLastStep: null,
      },
    });
  }

  return { mode: "enroll", enrollment: enrollmentFor(email, secret) };
}

/**
 * Steg 2: koden. Den första godkända koden bekräftar uppsättningen.
 *
 * Behörigheten prövas igen: en adress som tagits bort ur listan mellan stegen
 * ska inte komma in.
 */
export async function verifyPlatformCode(
  email: string,
  code: string,
  now: Date = new Date()
): Promise<LoginOutcome> {
  const wrong: LoginOutcome = {
    ok: false,
    problem:
      "Koden stämmer inte. Kontrollera att telefonens klocka går rätt och försök igen.",
  };

  if (!isPlatformAdmin(email) || isLockedOut(SCOPE, email)) return wrong;

  const account = await unsafeGlobalPrisma.platformUser.findUnique({
    where: { email },
  });

  const secret = account?.totpSecret
    ? openSecret(account.totpSecret, process.env.AUTH_SECRET ?? "")
    : null;

  const step =
    account && secret
      ? verifyTotp(secret, code, now, account.totpLastStep)
      : null;

  if (!account || step === null) {
    noteFailedLogin(SCOPE, email);
    return wrong;
  }

  // Perioden skrivs med villkor, så att två inloggningar med samma kod i
  // samma ögonblick inte båda går igenom: den andra hittar ingen rad.
  const claimed = await unsafeGlobalPrisma.platformUser.updateMany({
    where: {
      email,
      OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
    },
    data: {
      totpLastStep: step,
      totpEnabledAt: account.totpEnabledAt ?? now,
      lastLoginAt: now,
    },
  });

  if (claimed.count === 0) {
    noteFailedLogin(SCOPE, email);
    return wrong;
  }

  clearFailedLogins(SCOPE, email);

  await unsafeGlobalPrisma.platformAuditLog.create({
    data: {
      actorEmail: email,
      action: account.totpEnabledAt
        ? "Loggade in i plattformspanelen"
        : "Satte upp tvåstegsinloggning och loggade in",
    },
  });

  return { ok: true, email };
}
