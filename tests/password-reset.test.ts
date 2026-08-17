import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * Återställning av glömt lösenord.
 *
 * Reglerna som skyddas här är de som avgör om funktionen är en hjälp eller ett
 * hål: länken går att lösa in exakt en gång, den slutar gälla, den avslöjar
 * aldrig vilka adresser som finns, och ett byte gör gamla sessioner ogiltiga.
 *
 * Utskicken fångas upp i stället för att skickas. Testerna ska inte bero på
 * Microsoft, och länken plockas ur mejlet — precis som en riktig mottagare gör.
 */

const sent: { to: string; subject: string; text: string }[] = [];

vi.mock("@/lib/email", () => ({
  sendEmail: async (message: { to: string; subject: string; text: string }) => {
    sent.push(message);
    return { delivered: true, provider: "test" };
  },
}));

const {
  findPasswordReset,
  redeemPasswordReset,
  requestPasswordReset,
  PasswordResetError,
  RESET_MINUTES,
} = await import("@/lib/password-reset");

const BASE = "https://portal.example.se";

let companyId: string;
let userId: string;
let email: string;
let unique: string;

/** Plockar återställningslänkens token ur det senast skickade mejlet. */
function tokenFromLastEmail(): string {
  const last = sent.at(-1);
  const match = last?.text.match(/\/admin\/aterstall\/([\w-]+)/);
  if (!match) throw new Error("Ingen återställningslänk i mejlet.");
  return match[1];
}

beforeEach(async () => {
  sent.length = 0;
  unique = Math.random().toString(36).slice(2, 10);
  email = `glomsk-${unique}@example.com`;

  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Aterstallningstest ${unique}` },
  });
  companyId = company.id;

  const user = await unsafeGlobalPrisma.adminUser.create({
    data: {
      companyId,
      email,
      passwordHash: await bcrypt.hash("det-gamla-losenordet", 12),
      role: "OWNER",
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Aterstallningstest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("begära en länk", () => {
  it("skickar ett mejl med en länk till kontots adress", async () => {
    await requestPasswordReset({ email, baseUrl: BASE });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].text).toContain(`${BASE}/admin/aterstall/`);
  });

  it("okänd adress ger varken mejl eller fel", async () => {
    // Tystnaden är poängen. Ett svar som skiljer sig avslöjar vilka adresser
    // som finns, alltså vilka företag som är kunder.
    await expect(
      requestPasswordReset({ email: "finns.inte@example.com", baseUrl: BASE })
    ).resolves.toBeUndefined();

    expect(sent).toHaveLength(0);
  });

  it("bara fingeravtrycket av länken sparas", async () => {
    await requestPasswordReset({ email, baseUrl: BASE });
    const token = tokenFromLastEmail();

    const rows = await unsafeGlobalPrisma.passwordReset.findMany({
      where: { userId },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].tokenHash).toBe(
      createHash("sha256").update(token).digest("hex")
    );
  });

  it("en ny begäran direkt efter den förra skickar inget nytt mejl", async () => {
    // Annars blir formuläret ett sätt att fylla någon annans inkorg i vårt namn.
    await requestPasswordReset({ email, baseUrl: BASE });
    await requestPasswordReset({ email, baseUrl: BASE });

    expect(sent).toHaveLength(1);
  });
});

describe("lösa in länken", () => {
  it("sätter det nya lösenordet och loggar ut gamla sessioner", async () => {
    await requestPasswordReset({ email, baseUrl: BASE });
    const token = tokenFromLastEmail();

    const before = new Date();
    await redeemPasswordReset(token, "ett-helt-nytt-losenord");

    const user = await unsafeGlobalPrisma.adminUser.findUnique({
      where: { id: userId },
      select: { passwordHash: true, passwordChangedAt: true },
    });

    expect(await bcrypt.compare("ett-helt-nytt-losenord", user!.passwordHash)).toBe(
      true
    );
    expect(await bcrypt.compare("det-gamla-losenordet", user!.passwordHash)).toBe(
      false
    );

    // Tidpunkten är det som gör äldre sessioner ogiltiga.
    expect(user!.passwordChangedAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000
    );
  });

  it("samma länk fungerar inte två gånger", async () => {
    await requestPasswordReset({ email, baseUrl: BASE });
    const token = tokenFromLastEmail();

    await redeemPasswordReset(token, "ett-helt-nytt-losenord");

    await expect(
      redeemPasswordReset(token, "ytterligare-ett-losenord")
    ).rejects.toThrow(PasswordResetError);
  });

  it("utgången länk avvisas", async () => {
    await requestPasswordReset({ email, baseUrl: BASE });
    const token = tokenFromLastEmail();

    // Flyttar utgången bakåt i tiden i stället för att vänta en timme.
    await unsafeGlobalPrisma.passwordReset.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      redeemPasswordReset(token, "ett-helt-nytt-losenord")
    ).rejects.toThrow(PasswordResetError);

    expect(await findPasswordReset(token)).toBeNull();
  });

  it("påhittad länk avvisas", async () => {
    await expect(
      redeemPasswordReset("inte-en-riktig-token", "ett-helt-nytt-losenord")
    ).rejects.toThrow(PasswordResetError);
  });

  it("för kort lösenord avvisas", async () => {
    await requestPasswordReset({ email, baseUrl: BASE });
    const token = tokenFromLastEmail();

    await expect(redeemPasswordReset(token, "kort")).rejects.toThrow(
      PasswordResetError
    );

    // Länken ska vara kvar och gå att använda med ett dugligt lösenord.
    expect(await findPasswordReset(token)).not.toBeNull();
  });

  it("en äldre väntande länk slutar gälla när en nyare lösts in", async () => {
    await requestPasswordReset({ email, baseUrl: BASE });
    const first = tokenFromLastEmail();

    // Kringgår spärren mot att skicka två i rad, som inte är det som prövas här.
    await unsafeGlobalPrisma.passwordReset.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
    });

    await requestPasswordReset({ email, baseUrl: BASE });
    const second = tokenFromLastEmail();

    expect(second).not.toBe(first);

    await redeemPasswordReset(second, "ett-helt-nytt-losenord");

    expect(await findPasswordReset(first)).toBeNull();
  });
});

describe("bekräftelse efter bytet", () => {
  it("ett mejl går till kontot om att lösenordet ändrats", async () => {
    await requestPasswordReset({ email, baseUrl: BASE });
    const token = tokenFromLastEmail();

    await redeemPasswordReset(token, "ett-helt-nytt-losenord");

    // Är det inte kontots ägare som bytt är det här enda signalen de får.
    const last = sent.at(-1);
    expect(last?.to).toBe(email);
    expect(last?.subject).toContain("ändrats");
  });
});

describe("giltighetstiden", () => {
  it("är en timme", () => {
    // Kort med flit: den som glömt sitt lösenord sitter framför datorn nu.
    expect(RESET_MINUTES).toBe(60);
  });
});
