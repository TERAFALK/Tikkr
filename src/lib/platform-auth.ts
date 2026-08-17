import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";
import { isPlatformAdmin } from "./platform-access";
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

export async function verifyPlatformLogin(
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

    // Samma meddelande oavsett vad som var fel. Ett mer hjälpsamt svar är
    // hjälpsamt även för den som inte ska in.
    return { ok: false, problem: "Fel adress eller lösenord." };
  }

  clearFailedLogins(SCOPE, email);

  await unsafeGlobalPrisma.platformUser.update({
    where: { email },
    data: { lastLoginAt: new Date() },
  });

  await unsafeGlobalPrisma.platformAuditLog.create({
    data: { actorEmail: email, action: "Loggade in i plattformspanelen" },
  });

  return { ok: true, email };
}