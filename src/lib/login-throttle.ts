import { createLoginThrottle } from "@terafalk/auth/login-throttle";
import { unsafeGlobalPrisma } from "./db";

export { LOCKED_OUT_MESSAGE } from "@terafalk/auth/login-throttle";

/** Bromsning av gissningar. Reglerna ligger i @terafalk/auth, se tf-framework. */
export const { isLockedOut, noteFailedLogin, clearFailedLogins } = createLoginThrottle(
  unsafeGlobalPrisma.loginThrottle
);

/** Nollställer allt. Används av testerna. */
export async function __resetThrottle(): Promise<void> {
  await unsafeGlobalPrisma.loginThrottle.deleteMany({});
}
