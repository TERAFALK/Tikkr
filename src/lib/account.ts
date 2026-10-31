import { createAccount } from "@terafalk/auth/account";
import { unsafeGlobalPrisma } from "./db";
import { sendEmail } from "./email";
import { passwordChangedEmail } from "./emails";
import { clearFailedLogins, isLockedOut, noteFailedLogin } from "./login-throttle";

export { AccountError } from "@terafalk/auth/account";

/**
 * DET EGNA KONTOT: BYTA LÖSENORD OCH LOGGA UT ÖVERALLT.
 *
 * Reglerna ligger i @terafalk/auth, se tf-framework. Kontot slås upp på id ur
 * sessionen och aldrig ur ett formulär.
 */
export const { changeOwnPassword, revokeOwnSessions } = createAccount({
  // Samma räknare som inloggningen.
  scope: "admin",
  throttle: { isLockedOut, noteFailedLogin, clearFailedLogins },

  async sendChangedEmail({ to }) {
    await sendEmail(passwordChangedEmail({ to }));
  },

  store: {
    findById: (userId) =>
      unsafeGlobalPrisma.adminUser.findUnique({
        where: { id: userId },
        select: { id: true, email: true, passwordHash: true },
      }),

    async changePassword(userId, passwordHash, now) {
      await unsafeGlobalPrisma.$transaction([
        unsafeGlobalPrisma.adminUser.update({
          where: { id: userId },
          data: { passwordHash, passwordChangedAt: now },
        }),
        // En återställningslänk som ligger kvar i en inkorg ska inte kunna byta
        // tillbaka lösenordet efteråt.
        unsafeGlobalPrisma.passwordReset.deleteMany({
          where: { userId, usedAt: null },
        }),
      ]);
    },

    async revokeSessions(userId, now) {
      await unsafeGlobalPrisma.adminUser.updateMany({
        where: { id: userId },
        data: { sessionsRevokedAt: now },
      });
    },
  },
});
