import bcrypt from "bcryptjs";
import { createEmailVerification } from "@terafalk/auth/email-verification";
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

export { VERIFY_DAYS } from "@terafalk/auth/email-verification";
export type { SendOutcome } from "@terafalk/auth/email-verification";

/**
 * BEKRÄFTELSE AV E-POSTADRESSEN.
 *
 * Reglerna för länken ligger i @terafalk/auth, se tf-framework. Här står Tikkrs
 * tabeller, adress och mejl, och rättningen av en felskriven adress.
 *
 * Bekräftelsen spärrar den nyregistrerade tills länken använts, se CLAUDE.md § 4
 * punkt 5.
 */

export class EmailVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailVerificationError";
  }
}

export const { sendEmailVerification, confirmEmail } = createEmailVerification({
  onError: (error) => console.error("[bekräftelse]", error),

  linkFor(token) {
    // Länken byggs ur inställningen, aldrig ur anropet. Se app-url.ts.
    const base = resolveAppUrl(process.env);
    return base ? `${base}/admin/bekrafta/${token}` : null;
  },

  async sendEmail({ to, link, userId, daysValid }) {
    const user = await unsafeGlobalPrisma.adminUser.findUnique({
      where: { id: userId },
      select: { company: { select: { name: true } } },
    });

    const result = await sendEmail(
      emailVerificationEmail({
        to,
        link,
        companyName: user?.company.name ?? "",
        daysValid,
      })
    );

    if (!result.delivered && result.provider !== "log") {
      console.error(
        `[bekräftelse] Mejlet till ${to} gick inte fram: ` +
          `${result.problem ?? "okänd orsak"}`
      );
      return false;
    }

    return true;
  },

  store: {
    async findUser(userId) {
      const user = await unsafeGlobalPrisma.adminUser.findUnique({
        where: { id: userId },
        select: { email: true, emailVerifiedAt: true },
      });

      return user && { email: user.email, verifiedAt: user.emailVerifiedAt };
    },

    async hasRecentRequest(userId, since) {
      const recent = await unsafeGlobalPrisma.emailVerification.findFirst({
        where: { userId, usedAt: null, createdAt: { gt: since } },
        select: { id: true },
      });

      return recent !== null;
    },

    async createRequest(row) {
      await unsafeGlobalPrisma.emailVerification.create({ data: row });
    },

    findRequest: (tokenHash) =>
      unsafeGlobalPrisma.emailVerification.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          email: true,
          usedAt: true,
          expiresAt: true,
          user: { select: { id: true, email: true } },
        },
      }),

    confirm: (requestId, userId, now) =>
      unsafeGlobalPrisma.$transaction(async (tx) => {
        const claimed = await tx.emailVerification.updateMany({
          where: { id: requestId, usedAt: null },
          data: { usedAt: now },
        });
        if (claimed.count === 0) return false;

        await tx.adminUser.update({
          where: { id: userId },
          data: { emailVerifiedAt: now },
        });
        return true;
      }),
  },
});

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

  if (await isLockedOut("admin", user.email)) {
    throw new EmailVerificationError(LOCKED_OUT_MESSAGE);
  }

  if (!(await bcrypt.compare(params.password, user.passwordHash))) {
    await noteFailedLogin("admin", user.email);
    throw new EmailVerificationError("Lösenordet stämmer inte.");
  }
  await clearFailedLogins("admin", user.email);

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
