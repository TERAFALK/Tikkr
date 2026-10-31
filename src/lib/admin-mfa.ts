import { createTwoStepLogin } from "@terafalk/auth/two-step-login";
import { unsafeGlobalPrisma } from "./db";
import { sendEmail } from "./email";
import { loginCodeEmail } from "./emails";
import { clearFailedLogins, isLockedOut, noteFailedLogin } from "./login-throttle";

export { maskEmail } from "@terafalk/auth/password";
export { EMAIL_CODE_MINUTES } from "@terafalk/auth/two-step-login";
export type {
  EmailCodeOutcome,
  PasswordCheck,
  TwoStep,
} from "@terafalk/auth/two-step-login";

/**
 * INLOGGNINGEN TILL ADMINPANELEN, I TVÅ STEG.
 *
 * Reglerna ligger i @terafalk/auth, se tf-framework. Här står vad som är Tikkrs:
 * tabellen `AdminUser`, räknarnas namn, formatet `v1` på nycklarna och mejlet.
 *
 * Uppslagen går via den ofiltrerade klienten: vilket företag kontot tillhör är
 * just det inloggningen ska ta reda på. Efter inloggningen går all åtkomst via
 * forCompany().
 */

const login = createTwoStepLogin({
  issuer: "Tikkr",
  sealFormat: "v1",
  scopes: { account: "admin", passwordIp: "admin-ip", codeIp: "admin-code-ip" },
  throttle: { isLockedOut, noteFailedLogin, clearFailedLogins },

  async sendCodeEmail({ to, code, minutesValid }) {
    const result = await sendEmail(loginCodeEmail({ to, code, minutesValid }));

    if (!result.delivered && result.provider !== "log") {
      console.error(
        `[inloggningskod] Mejlet till ${to} gick inte fram: ` +
          `${result.problem ?? "okänd orsak"}`
      );
      return false;
    }

    return true;
  },

  store: {
    findByEmail: (email) =>
      unsafeGlobalPrisma.adminUser.findUnique({
        where: { email },
        select: { id: true, passwordHash: true },
      }),

    findById: (userId) =>
      unsafeGlobalPrisma.adminUser.findUnique({
        where: { id: userId },
        select: {
          email: true,
          totpSecret: true,
          totpEnabledAt: true,
          totpLastStep: true,
          emailVerifiedAt: true,
          loginCodeHash: true,
          loginCodeExpiresAt: true,
          loginCodeSentAt: true,
        },
      }),

    async saveTotpSecret(userId, sealed) {
      await unsafeGlobalPrisma.adminUser.update({
        where: { id: userId },
        data: { totpSecret: sealed, totpEnabledAt: null, totpLastStep: null },
      });
    },

    // Perioden skrivs med villkor, så att två inloggningar med samma kod i samma
    // ögonblick inte båda går igenom: den andra hittar ingen rad.
    async claimTotpStep(userId, step, enabledAt) {
      const claimed = await unsafeGlobalPrisma.adminUser.updateMany({
        where: {
          id: userId,
          OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
        },
        data: { totpLastStep: step, totpEnabledAt: enabledAt },
      });

      return claimed.count > 0;
    },

    async saveLoginCode(userId, code) {
      await unsafeGlobalPrisma.adminUser.update({
        where: { id: userId },
        data: {
          loginCodeHash: code.hash,
          loginCodeExpiresAt: code.expiresAt,
          loginCodeSentAt: code.sentAt,
        },
      });
    },

    async claimLoginCode(userId, hash) {
      const claimed = await unsafeGlobalPrisma.adminUser.updateMany({
        where: { id: userId, loginCodeHash: hash },
        data: { loginCodeHash: null, loginCodeExpiresAt: null },
      });

      return claimed.count > 0;
    },

    async resetMfa(userId, now) {
      await unsafeGlobalPrisma.adminUser.update({
        where: { id: userId },
        data: {
          totpSecret: null,
          totpEnabledAt: null,
          totpLastStep: null,
          loginCodeHash: null,
          loginCodeExpiresAt: null,
          // Avslutar också ihågkomna datorer, se trusted-device.ts.
          sessionsRevokedAt: now,
        },
      });
    },
  },
});

export const {
  checkPassword: checkAdminPassword,
  twoStep: adminTwoStep,
  verifyCode: verifyAdminCode,
  resetMfa: resetAdminMfa,
  loginAlternatives,
  sendEmailCode: sendEmailLoginCode,
  verifyEmailCode: verifyEmailLoginCode,
} = login;
