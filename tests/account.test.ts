import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "@/lib/db";
import { AccountError, changeOwnPassword, revokeOwnSessions } from "@/lib/account";
import {
  changeUnverifiedEmail,
  confirmEmail,
  EmailVerificationError,
  sendEmailVerification,
} from "@/lib/email-verification";
import { __resetThrottle } from "@/lib/login-throttle";

/**
 * DET EGNA KONTOT.
 *
 * Det testerna skyddar: lösenordet byts bara med det nuvarande, ett byte och
 * en utloggning flyttar tidpunkten som gamla sessioner prövas mot, och en
 * e-postadress bekräftas bara av en länk som skickades till just den.
 */

const PASSWORD = "ett-langt-losenord";

let companyId: string;
let userId: string;
let email: string;

beforeEach(async () => {
  __resetThrottle();
  process.env.APP_URL = "https://portal.tikkr.test";

  const unique = Math.random().toString(36).slice(2, 10);
  email = `konto-${unique}@example.com`;

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Kontotest ${unique}` },
  });
  companyId = company.id;

  userId = (
    await unsafeGlobalPrisma.adminUser.create({
      data: {
        companyId,
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        role: "OWNER",
      },
    })
  ).id;
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Kontotest " } },
  });
});

describe("byta lösenord", () => {
  it("fel nuvarande lösenord ändrar ingenting", async () => {
    await expect(
      changeOwnPassword({ userId, current: "fel", next: "ett-annat-losenord" })
    ).rejects.toThrow(AccountError);

    const user = await unsafeGlobalPrisma.adminUser.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(await bcrypt.compare(PASSWORD, user.passwordHash)).toBe(true);
    expect(user.passwordChangedAt).toBeNull();
  });

  it("rätt lösenord byter och flyttar tidpunkten för gamla sessioner", async () => {
    await changeOwnPassword({
      userId,
      current: PASSWORD,
      next: "ett-annat-losenord",
    });

    const user = await unsafeGlobalPrisma.adminUser.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(await bcrypt.compare("ett-annat-losenord", user.passwordHash)).toBe(true);
    expect(user.passwordChangedAt).not.toBeNull();
  });

  it("ett för kort lösenord avvisas", async () => {
    await expect(
      changeOwnPassword({ userId, current: PASSWORD, next: "kort" })
    ).rejects.toThrow(AccountError);
  });

  it("en återställningslänk som ligger kvar slutar gälla", async () => {
    await unsafeGlobalPrisma.passwordReset.create({
      data: {
        userId,
        tokenHash: `test-${userId}`,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    await changeOwnPassword({
      userId,
      current: PASSWORD,
      next: "ett-annat-losenord",
    });

    expect(
      await unsafeGlobalPrisma.passwordReset.count({ where: { userId } })
    ).toBe(0);
  });
});

describe("logga ut överallt", () => {
  it("flyttar tidpunkten som sessioner prövas mot", async () => {
    await revokeOwnSessions(userId);

    const user = await unsafeGlobalPrisma.adminUser.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(user.sessionsRevokedAt).not.toBeNull();
  });
});

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function link(forEmail: string, token = "token-" + Math.random()) {
  await unsafeGlobalPrisma.emailVerification.create({
    data: {
      userId,
      email: forEmail,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  return token;
}

describe("bekräftelse av e-postadressen", () => {
  it("ett obekräftat konto får en länk", async () => {
    expect(await sendEmailVerification(userId)).toBe("sent");
    expect(
      await unsafeGlobalPrisma.emailVerification.count({ where: { userId } })
    ).toBe(1);
  });

  it("två begäranden i rad ger en länk, inte två", async () => {
    await sendEmailVerification(userId);
    expect(await sendEmailVerification(userId)).toBe("cooldown");
  });

  it("utan APP_URL skickas ingen länk", async () => {
    delete process.env.APP_URL;
    expect(await sendEmailVerification(userId)).toBe("failed");
  });

  it("länken bekräftar adressen, en gång", async () => {
    const token = await link(email);

    expect(await confirmEmail(token)).toBe(email);
    expect(await confirmEmail(token)).toBeNull();

    const user = await unsafeGlobalPrisma.adminUser.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("en länk till en gammal adress bekräftar inte den nya", async () => {
    const token = await link(email);

    await changeUnverifiedEmail({
      userId,
      email: `ny-${email}`,
      password: PASSWORD,
    });

    expect(await confirmEmail(token)).toBeNull();
  });
});

describe("rätta en obekräftad adress", () => {
  it("kräver lösenordet", async () => {
    await expect(
      changeUnverifiedEmail({ userId, email: `ny-${email}`, password: "fel" })
    ).rejects.toThrow(EmailVerificationError);
  });

  it("en bekräftad adress går inte att byta här", async () => {
    await unsafeGlobalPrisma.adminUser.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    await expect(
      changeUnverifiedEmail({ userId, email: `ny-${email}`, password: PASSWORD })
    ).rejects.toThrow(EmailVerificationError);
  });

  it("bytet loggas i ändringsloggen", async () => {
    await changeUnverifiedEmail({
      userId,
      email: `ny-${email}`,
      password: PASSWORD,
    });

    const event = await unsafeGlobalPrisma.auditEvent.findFirstOrThrow({
      where: { companyId, entity: "AdminUser", entityId: userId },
    });
    expect((event.after as Record<string, unknown>).email).toBe(`ny-${email}`);
  });
});
