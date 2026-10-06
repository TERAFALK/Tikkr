import { describe, it, expect, beforeEach, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  adminTwoStep,
  checkAdminPassword,
  resetAdminMfa,
  verifyAdminCode,
} from "@/lib/admin-mfa";
import { codeForStep, stepAt } from "@/lib/totp";
import { openSecret } from "@/lib/totp-box.mjs";
import { decodeTicket, encodeTicket } from "@/lib/login-ticket";
import { __resetThrottle } from "@/lib/login-throttle";

/**
 * TVÅSTEGSINLOGGNING FÖR KUNDERNAS ADMINISTRATÖRER.
 *
 * Det testerna skyddar: ett lösenord ensamt ger aldrig en inloggning, den
 * första koden bekräftar QR-koden, en kod går inte att använda två gånger,
 * och en nollställning gör att nästa inloggning börjar om med en ny QR-kod.
 */

const PASSWORD = "ett-langt-losenord";

let userId: string;
let email: string;

beforeEach(async () => {
  __resetThrottle();
  process.env.AUTH_SECRET = "testhemlighet-for-tvasteg";

  const unique = Math.random().toString(36).slice(2, 10);
  email = `tvasteg-${unique}@example.com`;

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Tvåstegstest ${unique}` },
  });

  userId = (
    await unsafeGlobalPrisma.adminUser.create({
      data: {
        companyId: company.id,
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        role: "OWNER",
      },
    })
  ).id;
});

afterAll(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Tvåstegstest " } },
  });
});

/** Koden appen hade visat just nu, för kontots nyckel. */
async function currentCode(): Promise<string> {
  const user = await unsafeGlobalPrisma.adminUser.findUniqueOrThrow({
    where: { id: userId },
  });
  const secret = openSecret(user.totpSecret!, process.env.AUTH_SECRET!)!;
  return codeForStep(secret, stepAt(new Date()));
}

describe("steg 1: lösenordet", () => {
  it("rätt lösenord pekar ut kontot", async () => {
    expect(await checkAdminPassword({ email, password: PASSWORD })).toEqual({
      ok: true,
      userId,
    });
  });

  it("fel lösenord ger samma svar som en okänd adress", async () => {
    const wrong = await checkAdminPassword({ email, password: "fel" });
    const unknown = await checkAdminPassword({
      email: "finns-inte@example.com",
      password: PASSWORD,
    });
    expect(wrong).toEqual(unknown);
  });
});

describe("steg 2: QR-koden första gången", () => {
  it("ett konto utan app får en QR-kod", async () => {
    const step = await adminTwoStep(userId);
    expect(step?.mode).toBe("enroll");
    if (step?.mode === "enroll") {
      expect(step.enrollment.qrSvg).toContain("<svg");
      expect(step.enrollment.uri).toContain("otpauth://totp/");
    }
  });

  it("samma nyckel visas igen tills den bekräftats", async () => {
    const first = await adminTwoStep(userId);
    const second = await adminTwoStep(userId);
    expect(first?.mode === "enroll" && first.enrollment.key).toBe(
      second?.mode === "enroll" && second.enrollment.key
    );
  });

  it("den första koden bekräftar uppsättningen", async () => {
    await adminTwoStep(userId);
    expect(await verifyAdminCode(userId, await currentCode())).toBe(true);

    const user = await unsafeGlobalPrisma.adminUser.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(user.totpEnabledAt).not.toBeNull();
    expect((await adminTwoStep(userId))?.mode).toBe("code");
  });

  it("utan nyckel går ingen kod igenom", async () => {
    expect(await verifyAdminCode(userId, "123456")).toBe(false);
  });
});

describe("steg 2: koden", () => {
  it("samma kod går inte att använda två gånger", async () => {
    await adminTwoStep(userId);
    const code = await currentCode();

    expect(await verifyAdminCode(userId, code)).toBe(true);
    expect(await verifyAdminCode(userId, code)).toBe(false);
  });

  it("fel kod godtas inte", async () => {
    await adminTwoStep(userId);
    const code = await currentCode();
    const wrong = code === "000000" ? "111111" : "000000";

    expect(await verifyAdminCode(userId, wrong)).toBe(false);
  });
});

describe("nollställning från plattformen", () => {
  it("tar bort nyckeln, avslutar sessioner och ger en ny QR-kod", async () => {
    await adminTwoStep(userId);
    await verifyAdminCode(userId, await currentCode());

    await resetAdminMfa(userId);

    const user = await unsafeGlobalPrisma.adminUser.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(user.totpSecret).toBeNull();
    expect(user.totpEnabledAt).toBeNull();
    expect(user.sessionsRevokedAt).not.toBeNull();
    expect((await adminTwoStep(userId))?.mode).toBe("enroll");
  });
});

describe("lappen mellan stegen", () => {
  it("går att läsa tillbaka", () => {
    const value = encodeTicket("admin", userId, "/admin/kom-igang");
    expect(decodeTicket("admin", value)).toMatchObject({
      sub: userId,
      next: "/admin/kom-igang",
    });
  });

  it("gäller inte i plattformens inloggning", () => {
    const value = encodeTicket("admin", userId);
    expect(decodeTicket("platform", value)).toBeNull();
  });

  it("slutar gälla efter tio minuter", () => {
    const issued = new Date("2026-10-06T08:00:00Z");
    const value = encodeTicket("admin", userId, undefined, issued);
    expect(
      decodeTicket("admin", value, new Date("2026-10-06T08:11:00Z"))
    ).toBeNull();
  });

  it("går inte att ändra", () => {
    const value = encodeTicket("admin", userId);
    const [body, signature] = value.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "nagon-annan", exp: 9999999999 })
    ).toString("base64url");
    expect(decodeTicket("admin", `${forged}.${signature}`)).toBeNull();
    expect(body).toBeTruthy();
  });

  it("leder aldrig till en annan webbplats", () => {
    const value = encodeTicket("admin", userId, "https://angripare.se");
    expect(decodeTicket("admin", value)?.next).toBeUndefined();
  });
});
