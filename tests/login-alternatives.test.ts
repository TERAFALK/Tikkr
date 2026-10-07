import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import type { EmailMessage } from "@/lib/email";

/**
 * INLOGGNINGSALTERNATIVEN: KOD VIA E-POST OCH "KOM IHÅG DEN HÄR DATORN".
 *
 * Båda gör tvåstegsinloggningen lättare att leva med, och båda är därmed
 * ställen där den kan bli svagare än den ser ut. Det testerna skyddar:
 *
 *   - e-post är ett alternativ bara för ett konto med uppsatt app och
 *     bekräftad adress, och aldrig direkt efter en återställning via mejl
 *   - en kod via e-post gäller en gång och i tio minuter
 *   - en ihågkommen dator slutar gälla vid lösenordsbyte, "Logga ut på alla
 *     enheter" och nollställd tvåstegsinloggning
 */

const sent: EmailMessage[] = [];

vi.mock("@/lib/email", () => ({
  sendEmail: async (message: EmailMessage) => {
    sent.push(message);
    return { delivered: true, provider: "test" };
  },
}));

const { loginAlternatives, maskEmail, resetAdminMfa, sendEmailLoginCode, verifyEmailLoginCode } =
  await import("@/lib/admin-mfa");
const { decodeDevice, encodeDevice, isTrustedDevice } = await import(
  "@/lib/trusted-device"
);
const { unsafeGlobalPrisma } = await import("@/lib/db");
const { __resetThrottle } = await import("@/lib/login-throttle");

let userId: string;
let email: string;
let serial = 0;

async function createUser(data: {
  emailVerifiedAt?: Date | null;
  totpEnabledAt?: Date | null;
}): Promise<void> {
  serial += 1;
  const unique = `${Math.random().toString(36).slice(2, 8)}${serial}`;
  email = `alternativ-${unique}@example.com`;

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Alternativtest ${unique}` },
  });

  userId = (
    await unsafeGlobalPrisma.adminUser.create({
      data: {
        companyId: company.id,
        email,
        passwordHash: await bcrypt.hash("ett-langt-losenord", 4),
        role: "OWNER",
        emailVerifiedAt: "emailVerifiedAt" in data ? data.emailVerifiedAt : new Date(),
        totpEnabledAt: "totpEnabledAt" in data ? data.totpEnabledAt : new Date(),
      },
    })
  ).id;
}

/** Koden ur det senast skickade mejlet. */
function lastCode(): string {
  const match = sent.at(-1)?.subject.match(/(\d{6})$/);
  if (!match) throw new Error("Inget mejl med kod skickades.");
  return match[1];
}

beforeEach(async () => {
  __resetThrottle();
  sent.length = 0;
  process.env.AUTH_SECRET = "testhemlighet-for-alternativ";
  await createUser({});
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Alternativtest " } },
  });
});

describe("vem som får välja e-post", () => {
  it("ett konto med app och bekräftad adress", async () => {
    expect(await loginAlternatives(userId, false)).toEqual({
      email: maskEmail(email),
    });
  });

  it("inte med obekräftad adress", async () => {
    await createUser({ emailVerifiedAt: null });
    expect(await loginAlternatives(userId, false)).toEqual({ email: null });
    expect(await sendEmailLoginCode(userId, false)).toBe("unavailable");
    expect(sent).toHaveLength(0);
  });

  it("inte utan uppsatt app", async () => {
    await createUser({ totpEnabledAt: null });
    expect(await loginAlternatives(userId, false)).toEqual({ email: null });
  });

  it("inte direkt efter en återställning via mejl", async () => {
    expect(await loginAlternatives(userId, true)).toEqual({ email: null });
    expect(await sendEmailLoginCode(userId, true)).toBe("unavailable");
  });

  it("adressen visas maskerad", () => {
    expect(maskEmail("anna@mekaniska.se")).toBe("a•••@mekaniska.se");
  });
});

describe("koden via e-post", () => {
  it("skickas och godtas", async () => {
    expect(await sendEmailLoginCode(userId, false)).toBe("sent");
    expect(sent[0].to).toBe(email);
    expect(await verifyEmailLoginCode(userId, lastCode(), false)).toBe(true);
  });

  it("gäller bara en gång", async () => {
    await sendEmailLoginCode(userId, false);
    const code = lastCode();
    expect(await verifyEmailLoginCode(userId, code, false)).toBe(true);
    expect(await verifyEmailLoginCode(userId, code, false)).toBe(false);
  });

  it("slutar gälla efter tio minuter", async () => {
    await sendEmailLoginCode(userId, false);
    const later = new Date(Date.now() + 11 * 60 * 1000);
    expect(await verifyEmailLoginCode(userId, lastCode(), false, later)).toBe(false);
  });

  it("fel kod godtas inte", async () => {
    await sendEmailLoginCode(userId, false);
    const wrong = lastCode() === "000000" ? "111111" : "000000";
    expect(await verifyEmailLoginCode(userId, wrong, false)).toBe(false);
  });

  it("godtas inte efter en återställning, fast den stämmer", async () => {
    await sendEmailLoginCode(userId, false);
    expect(await verifyEmailLoginCode(userId, lastCode(), true)).toBe(false);
  });

  it("en ny kod kan inte begäras inom en minut", async () => {
    expect(await sendEmailLoginCode(userId, false)).toBe("sent");
    expect(await sendEmailLoginCode(userId, false)).toBe("cooldown");
    expect(sent).toHaveLength(1);
  });

  it("nollställd tvåstegsinloggning tar bort en skickad kod", async () => {
    await sendEmailLoginCode(userId, false);
    const code = lastCode();
    await resetAdminMfa(userId);
    expect(await verifyEmailLoginCode(userId, code, false)).toBe(false);
  });
});

describe("ihågkommen dator", () => {
  it("gäller för kontot den utfärdades till", async () => {
    expect(await isTrustedDevice(encodeDevice(userId), userId)).toBe(true);
  });

  it("gäller inte för ett annat konto", async () => {
    const value = encodeDevice(userId);
    await createUser({});
    expect(await isTrustedDevice(value, userId)).toBe(false);
  });

  it("slutar gälla efter 30 dagar", () => {
    const issued = new Date("2026-10-01T08:00:00Z");
    const value = encodeDevice(userId, issued);
    expect(decodeDevice(value, new Date("2026-10-30T08:00:00Z"))).not.toBeNull();
    expect(decodeDevice(value, new Date("2026-11-01T08:00:00Z"))).toBeNull();
  });

  it("går inte att ändra", () => {
    const [body, signature] = encodeDevice(userId).split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "annat-konto", iat: 0, exp: 9_999_999_999 })
    ).toString("base64url");
    expect(decodeDevice(`${forged}.${signature}`)).toBeNull();
    expect(decodeDevice(`${body}.${signature}x`)).toBeNull();
  });

  it("slutar gälla vid nytt lösenord", async () => {
    const value = encodeDevice(userId, new Date(Date.now() - 60_000));
    await unsafeGlobalPrisma.adminUser.update({
      where: { id: userId },
      data: { passwordChangedAt: new Date() },
    });
    expect(await isTrustedDevice(value, userId)).toBe(false);
  });

  it("slutar gälla vid utloggning på alla enheter", async () => {
    const value = encodeDevice(userId, new Date(Date.now() - 60_000));
    await unsafeGlobalPrisma.adminUser.update({
      where: { id: userId },
      data: { sessionsRevokedAt: new Date() },
    });
    expect(await isTrustedDevice(value, userId)).toBe(false);
  });

  it("slutar gälla när tvåstegsinloggningen nollställs", async () => {
    const value = encodeDevice(userId, new Date(Date.now() - 60_000));
    await resetAdminMfa(userId);
    expect(await isTrustedDevice(value, userId)).toBe(false);
  });
});
