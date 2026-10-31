import { createTrustedDevices } from "@terafalk/auth/trusted-device";
import { unsafeGlobalPrisma } from "./db";

/** "Kom ihåg den här datorn". Reglerna ligger i @terafalk/auth, se tf-framework. */
export const TRUSTED_DEVICE_DAYS = 30;

export const { encodeDevice, decodeDevice, isTrustedDevice, rememberDevice, deviceCookie } =
  createTrustedDevices({
    cookie: "tikkr_betrodd_enhet",
    days: TRUSTED_DEVICE_DAYS,
    async loadAccount(userId) {
      const user = await unsafeGlobalPrisma.adminUser.findUnique({
        where: { id: userId },
        select: {
          totpEnabledAt: true,
          passwordChangedAt: true,
          sessionsRevokedAt: true,
        },
      });

      return (
        user && {
          mfaEnabled: Boolean(user.totpEnabledAt),
          revokedAt: [user.passwordChangedAt, user.sessionsRevokedAt],
        }
      );
    },
  });
