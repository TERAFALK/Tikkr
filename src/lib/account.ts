import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";
import { sendEmail } from "./email";
import { passwordChangedEmail } from "./emails";
import {
  clearFailedLogins,
  isLockedOut,
  LOCKED_OUT_MESSAGE,
  noteFailedLogin,
} from "./login-throttle";

/**
 * DET EGNA KONTOT: BYTA LÖSENORD OCH LOGGA UT ÖVERALLT.
 *
 * Fanns inte före 2026-10-06. Den enda vägen till ett nytt lösenord var
 * "Glömt lösenord", och det enda sättet att kasta ut en inloggning på en annan
 * dator var att byta lösenord den vägen. Den som misstänkte att någon annan
 * var inne fick alltså låtsas ha glömt sitt lösenord.
 *
 * Båda verkar genom samma mekanism som redan fanns: sessioner utfärdade före
 * en viss tidpunkt avvisas av currentAdmin(). Ett nytt lösenord flyttar
 * `passwordChangedAt`, en utloggning flyttar `sessionsRevokedAt`.
 *
 * Kontot slås upp på id ur sessionen och aldrig ur ett formulär. Det här är
 * bara ens eget konto.
 */

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

const MIN_PASSWORD_LENGTH = 10;

/** Samma räknare som inloggningen. Se login-throttle.ts. */
const THROTTLE_SCOPE = "admin";

/**
 * Byter lösenord på det egna kontot.
 *
 * Kräver det nuvarande lösenordet. En session kan vara lånad — en dator som
 * står olåst — och den som lånat den ska inte kunna låsa ute ägaren.
 *
 * Felaktiga försök räknas av samma broms som inloggningen. Annars vore rutan
 * ett sätt att gissa lösenord utan att spärren märkte det.
 *
 * Alla andra inloggningar slutar gälla. Anroparen loggar in den egna på nytt.
 */
export async function changeOwnPassword(params: {
  userId: string;
  current: string;
  next: string;
}): Promise<{ email: string }> {
  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: params.userId },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) throw new AccountError("Kontot finns inte.");

  if (isLockedOut(THROTTLE_SCOPE, user.email)) {
    throw new AccountError(LOCKED_OUT_MESSAGE);
  }

  const correct = await bcrypt.compare(params.current, user.passwordHash);
  if (!correct) {
    noteFailedLogin(THROTTLE_SCOPE, user.email);
    throw new AccountError("Det nuvarande lösenordet stämmer inte.");
  }

  clearFailedLogins(THROTTLE_SCOPE, user.email);

  if (params.next.length < MIN_PASSWORD_LENGTH) {
    throw new AccountError(
      `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`
    );
  }

  if (params.next === params.current) {
    throw new AccountError("Välj ett annat lösenord än det nuvarande.");
  }

  const passwordHash = await bcrypt.hash(params.next, 12);

  await unsafeGlobalPrisma.$transaction([
    unsafeGlobalPrisma.adminUser.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    // En återställningslänk som ligger kvar i en inkorg ska inte kunna byta
    // tillbaka lösenordet efteråt.
    unsafeGlobalPrisma.passwordReset.deleteMany({
      where: { userId: user.id, usedAt: null },
    }),
  ]);

  // Den enda signal en person får om någon annan bytt lösenordet. Ett mejl
  // som inte går fram får inte göra bytet ogjort.
  try {
    await sendEmail(passwordChangedEmail({ to: user.email }));
  } catch (error) {
    console.error("[konto] Kvittensen om nytt lösenord gick inte iväg", error);
  }

  return { email: user.email };
}

/**
 * Loggar ut det egna kontot på alla enheter, den här inräknad.
 */
export async function revokeOwnSessions(userId: string): Promise<void> {
  await unsafeGlobalPrisma.adminUser.updateMany({
    where: { id: userId },
    data: { sessionsRevokedAt: new Date() },
  });
}
