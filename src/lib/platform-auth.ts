import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";
import { isPlatformAdmin } from "./platform-access";
import { verifyTotp } from "./totp";
import { openSecret } from "./totp-box.mjs";
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
 * TVÅSTEGSINLOGGNING KRÄVS (infört 2026-10-06). Utöver lösenordet en kod från
 * en autentiseringsapp, se totp.ts. Nyckeln sätts upp från servern med samma
 * skript, så att ett stulet lösenord inte räcker för att koppla in en annan
 * telefon. Ett konto utan nyckel kommer inte in alls.
 */

/** Hash av ett lösenord ingen har. Ger samma svarstid för okända konton. */
const UNKNOWN_ACCOUNT_HASH = bcrypt.hashSync("inget-konto-har-detta", 12);

/**
 * Bromsen delas med kundernas inloggning, se src/lib/login-throttle.ts.
 * Nyckeln håller dem åtskilda: misslyckade försök här låser aldrig ett
 * kundkonto med samma adress.
 */
const SCOPE = "platform";

/* -------------------------------------------------------------------------- */

export interface LoginOutcome {
  ok: boolean;
  email?: string;
  /** Meddelande skrivet för att läsas av en människa. */
  problem?: string;
}

/** Samma besked för varje sorts fel. Se nedan. */
const WRONG = "Fel adress, lösenord eller kod.";

export async function verifyPlatformLogin(
  rawEmail: string,
  password: string,
  code: string,
  now: Date = new Date()
): Promise<LoginOutcome> {
  const email = rawEmail.trim().toLowerCase();

  if (!email || !password) {
    return { ok: false, problem: "Fyll i adress, lösenord och kod." };
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

    // Samma meddelande oavsett vad som var fel. Ett mer hjälpsamt svar är
    // hjälpsamt även för den som inte ska in.
    return { ok: false, problem: WRONG };
  }

  // Den här raden når bara den som redan kan lösenordet. Att den säger rakt
  // ut vad som saknas avslöjar alltså ingenting för en främling, och utan den
  // står den rätta personen utelåst utan att förstå varför.
  const secret = account.totpSecret
    ? openSecret(account.totpSecret, process.env.AUTH_SECRET ?? "")
    : null;

  if (!secret) {
    return {
      ok: false,
      problem:
        "Tvåstegsinloggning är inte uppsatt för kontot. Kör " +
        `./scripts/platform-user.sh ${email} --kod på servern.`,
    };
  }

  const step = verifyTotp(secret, code, now, account.totpLastStep);

  if (step === null) {
    noteFailedLogin(SCOPE, email);
    return { ok: false, problem: WRONG };
  }

  // Perioden skrivs med villkor, så att två inloggningar med samma kod i
  // samma ögonblick inte båda går igenom: den andra hittar ingen rad.
  const claimed = await unsafeGlobalPrisma.platformUser.updateMany({
    where: {
      email,
      OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
    },
    data: { totpLastStep: step, lastLoginAt: now },
  });

  if (claimed.count === 0) {
    noteFailedLogin(SCOPE, email);
    return { ok: false, problem: WRONG };
  }

  clearFailedLogins(SCOPE, email);

  await unsafeGlobalPrisma.platformAuditLog.create({
    data: { actorEmail: email, action: "Loggade in i plattformspanelen" },
  });

  return { ok: true, email };
}