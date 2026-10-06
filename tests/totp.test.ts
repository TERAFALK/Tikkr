import { describe, it, expect, beforeEach, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import {
  base32Decode,
  base32Encode,
  codeForStep,
  stepAt,
  verifyTotp,
} from "@/lib/totp";
import { openSecret, sealSecret } from "@/lib/totp-box.mjs";
import {
  checkPlatformPassword,
  platformTwoStep,
  verifyPlatformCode,
} from "@/lib/platform-auth";
import { __resetThrottle } from "@/lib/login-throttle";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * TVÅSTEGSINLOGGNINGEN TILL PLATTFORMSPANELEN.
 *
 * Det testerna skyddar: koderna räknas exakt som standarden (RFC 6238:s egna
 * exempel), en kod går inte att använda två gånger, nyckeln går inte att läsa
 * utan AUTH_SECRET, och inloggningen släpper inte in någon utan koden.
 */

// RFC 6238, bilaga B. Nyckeln "12345678901234567890" och SHA-1. Standardens
// exempel har åtta siffror; appar och Tikkr använder de sex sista.
const RFC_SECRET = Buffer.from("12345678901234567890");

describe("koderna följer RFC 6238", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("tid %i ger %s", (seconds, code) => {
    expect(codeForStep(RFC_SECRET, stepAt(new Date(seconds * 1000)))).toBe(code);
  });
});

describe("nyckeln som text", () => {
  it("kodas och avkodas tillbaka till samma byte", () => {
    const secret = Buffer.from("12345678901234567890");
    expect(base32Encode(secret)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
  });

  it("mellanslag och gemener i en avskriven nyckel spelar ingen roll", () => {
    expect(
      base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").equals(RFC_SECRET)
    ).toBe(true);
  });
});

describe("verifyTotp", () => {
  const now = new Date(1111111111 * 1000);

  it("godtar koden för nuvarande period", () => {
    expect(verifyTotp(RFC_SECRET, "050471", now, null)).toBe(stepAt(now));
  });

  it("godtar en period åt vardera hållet, för telefonens klocka", () => {
    const previous = codeForStep(RFC_SECRET, stepAt(now) - 1);
    expect(verifyTotp(RFC_SECRET, previous, now, null)).toBe(stepAt(now) - 1);
  });

  it("avvisar en kod två perioder bort", () => {
    const old = codeForStep(RFC_SECRET, stepAt(now) - 2);
    expect(verifyTotp(RFC_SECRET, old, now, null)).toBeNull();
  });

  it("avvisar en kod som redan använts", () => {
    expect(verifyTotp(RFC_SECRET, "050471", now, stepAt(now))).toBeNull();
  });

  it("avvisar fel kod och sådant som inte är sex siffror", () => {
    expect(verifyTotp(RFC_SECRET, "000000", now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "05047", now, null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now, null)).toBeNull();
  });
});

describe("nyckeln lagras krypterad", () => {
  it("går att läsa med samma AUTH_SECRET", () => {
    const sealed = sealSecret(RFC_SECRET, "hemlig-nyckel");
    expect(sealed).not.toContain(base32Encode(RFC_SECRET));
    expect(openSecret(sealed, "hemlig-nyckel")?.equals(RFC_SECRET)).toBe(true);
  });

  it("går inte att läsa med en annan", () => {
    const sealed = sealSecret(RFC_SECRET, "hemlig-nyckel");
    expect(openSecret(sealed, "en-annan-nyckel")).toBeNull();
  });
});

describe("plattformens inloggning kräver koden", () => {
  const email = "plattform-totp-test@example.com";
  const password = "ett-mycket-langt-losenord";
  const authSecret = "test-auth-secret";
  const originalAdmins = process.env.PLATFORM_ADMIN_EMAILS;
  const originalSecret = process.env.AUTH_SECRET;

  beforeEach(async () => {
    __resetThrottle();
    process.env.PLATFORM_ADMIN_EMAILS = email;
    process.env.AUTH_SECRET = authSecret;

    const data = {
      passwordHash: await bcrypt.hash(password, 4),
      totpSecret: sealSecret(RFC_SECRET, authSecret),
      totpEnabledAt: new Date(),
      totpLastStep: null,
    };

    await unsafeGlobalPrisma.platformUser.upsert({
      where: { email },
      update: data,
      create: { email, ...data },
    });
  });

  afterAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = originalAdmins;
    process.env.AUTH_SECRET = originalSecret;
    await unsafeGlobalPrisma.platformUser.deleteMany({ where: { email } });
    await unsafeGlobalPrisma.platformAuditLog.deleteMany({
      where: { actorEmail: email },
    });
  });

  const now = new Date(1111111111 * 1000);

  it("rätt lösenord leder till steg två, men ger ingen inloggning ensamt", async () => {
    const outcome = await checkPlatformPassword(email, password);
    expect(outcome.ok).toBe(true);
    expect(await platformTwoStep(email)).toEqual({ mode: "code" });
  });

  it("fel lösenord stannar i steg ett", async () => {
    expect((await checkPlatformPassword(email, "fel")).ok).toBe(false);
  });

  it("rätt kod släpper in", async () => {
    expect((await verifyPlatformCode(email, "050471", now)).ok).toBe(true);
  });

  it("fel kod släpper inte in", async () => {
    expect((await verifyPlatformCode(email, "000000", now)).ok).toBe(false);
  });

  it("samma kod två gånger släpper bara in den första", async () => {
    expect((await verifyPlatformCode(email, "050471", now)).ok).toBe(true);
    expect((await verifyPlatformCode(email, "050471", now)).ok).toBe(false);
  });

  it("ett nollställt konto får en QR-kod, och den första koden bekräftar den", async () => {
    await unsafeGlobalPrisma.platformUser.update({
      where: { email },
      data: { totpSecret: null, totpEnabledAt: null },
    });

    const step = await platformTwoStep(email);
    expect(step?.mode).toBe("enroll");

    // Nyckeln återanvänds tills den bekräftats.
    const again = await platformTwoStep(email);
    expect(again?.mode === "enroll" && again.enrollment.key).toBe(
      step?.mode === "enroll" && step.enrollment.key
    );

    const saved = await unsafeGlobalPrisma.platformUser.findUniqueOrThrow({
      where: { email },
    });
    const secret = openSecret(saved.totpSecret!, authSecret)!;
    const code = codeForStep(secret, stepAt(new Date()));

    expect((await verifyPlatformCode(email, code)).ok).toBe(true);
    expect(await platformTwoStep(email)).toEqual({ mode: "code" });
  });
});
