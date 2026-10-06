import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "./db";
import { resolveAppUrl } from "./app-url";
import { sendEmail } from "./email";
import { emailVerificationEmail } from "./emails";
import { normalizeEmail } from "./signup";
import {
  clearFailedLogins,
  isLockedOut,
  LOCKED_OUT_MESSAGE,
  noteFailedLogin,
} from "./login-throttle";

/**
 * BEKRÄFTELSE AV E-POSTADRESSEN (infört 2026-10-06).
 *
 * Registreringen tog emot vilken adress som helst och loggade in direkt. En
 * adress med ett stavfel märktes därför inte förrän lösenordet glömts — och
 * då gick återställningslänken till någon annans inkorg, eller ingenstans.
 *
 * Nu skickas en länk vid registreringen. Bekräftelsen SPÄRRAR INGENTING: den
 * som registrerat sig kommer in och kan arbeta, men panelen visar en remsa
 * tills länken använts. Felet syns därmed första dagen, och adressen går att
 * rätta så länge den inte är bekräftad.
 *
 * Byggd som lösenordsåterställningen: bara fingeravtrycket sparas, länken har
 * en utgångstid och går att använda en gång.
 */

export class EmailVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailVerificationError";
  }
}

/** Hur länge en länk gäller. Längre än en återställning: ingen väntar på den. */
export const VERIFY_DAYS = 7;

/** Hur ofta en ny länk får skickas. Samma skäl som för återställningen. */
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SendOutcome = "sent" | "already-verified" | "cooldown" | "failed";

/**
 * Skickar en bekräftelselänk till kontots nuvarande adress.
 *
 * Kastar aldrig. Registreringen och remsan i panelen ska fungera även när
 * mejlet inte går att skicka; utfallet säger vad som hände.
 */
export async function sendEmailVerification(userId: string): Promise<SendOutcome> {
  try {
    const user = await unsafeGlobalPrisma.adminUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        company: { select: { name: true } },
      },
    });

    if (!user) return "failed";
    if (user.emailVerifiedAt) return "already-verified";

    const recent = await unsafeGlobalPrisma.emailVerification.findFirst({
      where: {
        userId,
        usedAt: null,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (recent) return "cooldown";

    // Länken byggs ur inställningen, aldrig ur anropet. Se app-url.ts.
    const base = resolveAppUrl(process.env);
    if (!base) {
      console.error("[bekräftelse] APP_URL saknas i .env, inget mejl skickat.");
      return "failed";
    }

    const token = randomBytes(32).toString("base64url");

    await unsafeGlobalPrisma.emailVerification.create({
      data: {
        userId,
        email: user.email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VERIFY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    const result = await sendEmail(
      emailVerificationEmail({
        to: user.email,
        link: `${base}/admin/bekrafta/${token}`,
        companyName: user.company.name,
        daysValid: VERIFY_DAYS,
      })
    );

    if (!result.delivered && result.provider !== "log") {
      console.error(
        `[bekräftelse] Mejlet till ${user.email} gick inte fram: ` +
          `${result.problem ?? "okänd orsak"}`
      );
      return "failed";
    }

    return "sent";
  } catch (error) {
    console.error("[bekräftelse] Kunde inte skicka länken", error);
    return "failed";
  }
}

/**
 * Löser in en länk. Svarar med adressen som bekräftades, eller null.
 *
 * En länk gäller bara den adress den skickades till. Har adressen bytts sedan
 * dess bekräftar den gamla länken ingenting.
 */
export async function confirmEmail(token: string): Promise<string | null> {
  if (!token) return null;

  const verification = await unsafeGlobalPrisma.emailVerification.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true } } },
  });

  if (
    !verification ||
    verification.usedAt ||
    verification.expiresAt < new Date() ||
    verification.email !== verification.user.email
  ) {
    return null;
  }

  const now = new Date();

  const confirmed = await unsafeGlobalPrisma.$transaction(async (tx) => {
    const claimed = await tx.emailVerification.updateMany({
      where: { id: verification.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) return false;

    await tx.adminUser.update({
      where: { id: verification.user.id },
      data: { emailVerifiedAt: now },
    });
    return true;
  });

  return confirmed ? verification.user.email : null;
}

/**
 * Byter adress på ett konto vars adress ännu inte är bekräftad.
 *
 * Finns för stavfelet: den som skrev "chef@mekansika.se" vid registreringen
 * ska kunna rätta det själv. En BEKRÄFTAD adress går inte att byta här — den
 * är kontots identitet, och ett byte av den kräver mer än en inloggad session.
 *
 * Lösenordet krävs, och räknas av inloggningens broms. En session kan vara
 * lånad, och adressen är vart nästa återställningslänk går.
 */
export async function changeUnverifiedEmail(params: {
  userId: string;
  email: string;
  password: string;
}): Promise<void> {
  const email = normalizeEmail(params.email);

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new EmailVerificationError("Kontrollera e-postadressen.");
  }

  const user = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      companyId: true,
      email: true,
      passwordHash: true,
      emailVerifiedAt: true,
    },
  });

  if (!user) throw new EmailVerificationError("Kontot finns inte.");

  if (user.emailVerifiedAt) {
    throw new EmailVerificationError(
      "Adressen är redan bekräftad. Kontakta support@tikkr.se för att byta den."
    );
  }

  if (isLockedOut("admin", user.email)) {
    throw new EmailVerificationError(LOCKED_OUT_MESSAGE);
  }

  if (!(await bcrypt.compare(params.password, user.passwordHash))) {
    noteFailedLogin("admin", user.email);
    throw new EmailVerificationError("Lösenordet stämmer inte.");
  }
  clearFailedLogins("admin", user.email);

  if (email === user.email) return;

  const taken = await unsafeGlobalPrisma.adminUser.findUnique({
    where: { email },
    select: { id: true },
  });
  if (taken) {
    throw new EmailVerificationError("Adressen används redan av ett annat konto.");
  }

  await unsafeGlobalPrisma.$transaction(async (tx) => {
    await tx.adminUser.update({
      where: { id: user.id },
      data: { email },
    });

    // Adressen är kontots identitet och vart återställningen går. Ett byte
    // ska gå att se i efterhand.
    await tx.auditEvent.create({
      data: {
        companyId: user.companyId,
        actorEmail: user.email,
        entity: "AdminUser",
        entityId: user.id,
        action: "update",
        before: { email: user.email },
        after: { email },
      },
    });
  });
}
