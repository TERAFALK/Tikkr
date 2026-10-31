import { createPasswordReset } from "@terafalk/auth/password-reset";
import { after } from "next/server";
import { unsafeGlobalPrisma } from "./db";
import { sendEmail } from "./email";
import { passwordChangedEmail, passwordResetEmail } from "./emails";
import { clearFailedLogins, isLockedOut, noteFailedLogin } from "./login-throttle";

export { PasswordResetError, RESET_MINUTES } from "@terafalk/auth/password-reset";

/**
 * ÅTERSTÄLLNING AV GLÖMT LÖSENORD.
 *
 * Reglerna ligger i @terafalk/auth, se tf-framework: länken går att lösa in en
 * gång, den gäller en timme, och bytet loggar ut alla enheter. Här står Tikkrs
 * tabeller, adress och mejl.
 *
 * ARBETET GÖRS EFTER SVARET (ändrat 2026-10-31). Svaret väntade på utskicket till
 * Microsoft, men bara när kontot fanns, så svarstiden avslöjade vilka adresser som
 * är kunder. Utanför ett anrop finns inget svar att vänta in, och då görs arbetet
 * direkt.
 */
function deferred(work: () => Promise<void>): void | Promise<void> {
  try {
    after(work);
  } catch {
    return work();
  }
}

function flow(baseUrl: string) {
  return createPasswordReset({
    defer: deferred,
    throttle: { isLockedOut, noteFailedLogin, clearFailedLogins },
    linkFor: (token) => `${baseUrl}/admin/aterstall/${token}`,

    async sendResetEmail({ to, link, minutesValid }) {
      const result = await sendEmail(passwordResetEmail({ to, link, minutesValid }));

      // Ett driftfel, inte ett användarfel. Det syns i loggen, och kvittensen till
      // besökaren ändras inte.
      if (!result.delivered && result.provider !== "log") {
        console.error(
          `[losenordsaterstallning] Mejlet till ${to} gick inte fram: ` +
            `${result.problem ?? "okänd orsak"}`
        );
      }
    },

    async sendChangedEmail({ to }) {
      await sendEmail(passwordChangedEmail({ to }));
    },

    store: {
      findUserByEmail: (email) =>
        unsafeGlobalPrisma.adminUser.findUnique({
          where: { email },
          select: { id: true, email: true },
        }),

      async hasRecentRequest(userId, since) {
        const recent = await unsafeGlobalPrisma.passwordReset.findFirst({
          where: { userId, usedAt: null, createdAt: { gt: since } },
          select: { id: true },
        });

        return recent !== null;
      },

      async createRequest({ userId, tokenHash, expiresAt, ip }) {
        await unsafeGlobalPrisma.passwordReset.create({
          data: { userId, tokenHash, expiresAt, requestedFromIp: ip },
        });
      },

      findRequest: (tokenHash) =>
        unsafeGlobalPrisma.passwordReset.findUnique({
          where: { tokenHash },
          select: {
            id: true,
            usedAt: true,
            expiresAt: true,
            user: { select: { id: true, email: true } },
          },
        }),

      redeem: ({ requestId, userId, passwordHash, now }) =>
        unsafeGlobalPrisma.$transaction(async (tx) => {
          const claimed = await tx.passwordReset.updateMany({
            where: { id: requestId, usedAt: null },
            data: { usedAt: now },
          });

          // Hann någon annan lösa in den mellan uppslaget och nu blir count noll.
          if (claimed.count === 0) return false;

          await tx.adminUser.update({
            where: { id: userId },
            // Länken kom till adressen, alltså fungerar den.
            data: { passwordHash, passwordChangedAt: now, emailVerifiedAt: now },
          });

          // Bad någon om två i rad ska den äldre inte gå att använda efteråt.
          await tx.passwordReset.deleteMany({ where: { userId, usedAt: null } });

          return true;
        }),
    },
  });
}

/** Begär en återställning. Svaret är detsamma oavsett om kontot fanns. */
export function requestPasswordReset(params: {
  email: string;
  /** Ur inställningen, aldrig ur anropet. Se app-url.ts. */
  baseUrl: string;
  ip?: string | null;
}): Promise<void> {
  return flow(params.baseUrl).requestPasswordReset(params);
}

/** Slår upp en länk utan att förbruka den. Används för att visa formuläret. */
export function findPasswordReset(token: string) {
  return flow("").findPasswordReset(token);
}

/** Sätter det nya lösenordet. */
export function redeemPasswordReset(token: string, password: string) {
  return flow("").redeemPasswordReset(token, password);
}
