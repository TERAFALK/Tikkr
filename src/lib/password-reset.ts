import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";
import { sendEmail } from "./email";
import { passwordChangedEmail, passwordResetEmail } from "./emails";
import { normalizeEmail } from "./signup";

/**
 * ÅTERSTÄLLNING AV GLÖMT LÖSENORD.
 *
 * Byggd som inbjudningarna i admin-users.ts: bara fingeravtrycket av länken
 * sparas, den har en utgångstid, och den går att lösa in exakt en gång.
 *
 * Tre saker skiljer den från en inbjudan, och alla tre är avsiktliga:
 *
 * 1. **En timme, inte en vecka.** Den som glömt sitt lösenord sitter framför
 *    datorn just nu. En länk som ligger kvar i en inkorg i en vecka är en väg
 *    in för den som kommer åt inkorgen senare.
 *
 * 2. **Svaret avslöjar aldrig om adressen finns.** Formuläret svarar likadant
 *    oavsett. Ett formulär som säger "adressen finns inte" är ett sätt att
 *    kartlägga vilka företag som är kunder, gratis och utan inloggning.
 *
 * 3. **Bytet loggar ut alla enheter.** Byter man lösenord för att man
 *    misstänker att någon annan kommit åt kontot vore det meningslöst om den
 *    andra sessionen fick fortsätta.
 */

export class PasswordResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordResetError";
  }
}

/** Hur länge en länk gäller. */
export const RESET_MINUTES = 60;

/**
 * Hur ofta en ny länk får begäras för samma konto.
 *
 * Utan spärren blir formuläret ett sätt att fylla någon annans inkorg: den som
 * kan en kunds adress kan skicka hur många mejl som helst dit, i vårt namn.
 */
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;

const MIN_PASSWORD_LENGTH = 10;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Begär en återställning.
 *
 * Returnerar ingenting som skiljer sig beroende på om kontot fanns. Anroparen
 * visar samma kvittens oavsett.
 */
export async function requestPasswordReset(params: {
  email: string;
  /** Adressen bygger länken, så att den pekar dit anropet kom ifrån. */
  baseUrl: string;
  ip?: string | null;
}): Promise<void> {
  const email = normalizeEmail(params.email);
  if (!email) return;

  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  // Tyst avslut. Ur anroparens synvinkel gick det lika bra som annars.
  if (!user) return;

  const recent = await unsafeGlobalPrisma.passwordReset.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
    select: { id: true },
  });

  if (recent) return;

  const token = randomBytes(32).toString("base64url");

  const expiresAt = new Date(Date.now() + RESET_MINUTES * 60 * 1000);

  await unsafeGlobalPrisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      requestedFromIp: params.ip ?? null,
    },
  });

  const link = `${params.baseUrl}/admin/aterstall/${token}`;

  const result = await sendEmail(
    passwordResetEmail({ to: user.email, link, minutesValid: RESET_MINUTES })
  );

  // Går utskicket inte fram är det ett driftfel, inte ett användarfel. Det ska
  // synas i loggen — men kvittensen till besökaren ändras inte, eftersom den
  // annars skulle avslöja att adressen finns.
  if (!result.delivered && result.provider !== "log") {
    console.error(
      `[losenordsaterstallning] Mejlet till ${user.email} gick inte fram: ` +
        `${result.problem ?? "okänd orsak"}`
    );
  }
}

export interface PendingReset {
  email: string;
}

/** Slår upp en länk utan att förbruka den. Används för att visa formuläret. */
export async function findPasswordReset(
  token: string
): Promise<PendingReset | null> {
  if (!token) return null;

  const reset = await unsafeGlobalPrisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { email: true } } },
  });

  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return null;

  return { email: reset.user.email };
}

/**
 * Sätter det nya lösenordet.
 *
 * Allt sker i en transaktion: länken förbrukas, lösenordet byts, övriga
 * väntande länkar för kontot slängs, och tidpunkten skrivs ned så att gamla
 * sessioner slutar gälla. Halvvägs är inget godtagbart läge för något av det.
 */
export async function redeemPasswordReset(
  token: string,
  password: string
): Promise<{ email: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordResetError(
      `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`
    );
  }

  const reset = await unsafeGlobalPrisma.passwordReset.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    throw new PasswordResetError(
      "Länken är ogiltig eller har upphört att gälla. Begär en ny."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  await unsafeGlobalPrisma.$transaction(async (tx) => {
    const claimed = await tx.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: now },
    });

    // Hann någon annan lösa in den mellan uppslaget och nu blir count noll.
    if (claimed.count === 0) {
      throw new PasswordResetError("Länken är redan använd.");
    }

    await tx.adminUser.update({
      where: { id: reset.user.id },
      data: { passwordHash, passwordChangedAt: now },
    });

    // Övriga väntande länkar för kontot slängs. Bad någon om två i rad ska den
    // äldre inte gå att använda efteråt.
    await tx.passwordReset.deleteMany({
      where: { userId: reset.user.id, usedAt: null },
    });
  });

  // Skickas efter bytet och är den enda signal en person får om någon annan
  // bytt lösenord på deras konto.
  await sendEmail(passwordChangedEmail({ to: reset.user.email }));

  return { email: reset.user.email };
}
