import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * Grinden till adminpanelen.
 *
 * Sessionen är en signerad token som webbläsaren bär med sig, och den går inte
 * att ändra i efterhand. Läses bara den blir "ta bort administratör" en knapp
 * som inte gör någonting förrän token går ut — som mest trettio dagar senare.
 *
 * Testerna nedan bevisar att kontot slås upp på riktigt vid varje anrop, och
 * att det är databasens uppgifter som gäller, inte tokenens.
 *
 * next-auth mockas bort helt. Dels för att en riktig session kräver ett
 * inkommande anrop, dels för att modulen drar in next/server som inte går att
 * ladda utanför en Next-miljö.
 *
 * SUPPORTLÄGET går genom samma grind, och prövas längst ner. Cookien ersätts
 * med en burk i minnet — det är innehållet grinden ska svara på, inte hur
 * webbläsaren bär det.
 */

/** Vad den påhittade sessionen ska svara. Ändras per test. */
let sessionUserId: string | null = null;

/** När sessionen utfärdades, i sekunder. Som next-auth anger den. */
let sessionIssuedAt: number | undefined;

vi.mock("@/lib/auth", () => ({
  auth: async () =>
    sessionUserId
      ? { user: { id: sessionUserId, issuedAt: sessionIssuedAt } }
      : null,
}));

// Ersätts för att modulen hör hemma i en webbserver, inte i ett test. Ingen av
// funktionerna som prövas här omdirigerar — currentAdmin() svarar med null och
// låter anroparen bestämma vad som ska hända.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`Oväntad omdirigering till ${to}`);
  },
}));

/** Supportcookien, eller null när inget besök pågår. Ändras per test. */
let supportCookie: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "tikkr_support" && supportCookie
        ? { name, value: supportCookie }
        : undefined,
  }),
}));

const { currentAdmin, assertWritable, READ_ONLY_PATH } = await import(
  "@/lib/admin-session"
);
const { __internals } = await import("@/lib/support-session");

let companyId: string;
let otherCompanyId: string;
let ownerId: string;
let unique: string;

beforeEach(async () => {
  unique = Math.random().toString(36).slice(2, 10);
  supportCookie = null;
  process.env.AUTH_SECRET ??= "testhemlighet-for-sessionstestet";

  const [company, other] = await Promise.all([
    unsafeGlobalPrisma.company.create({
      data: { name: `Sessionstest ${unique}` },
    }),
    unsafeGlobalPrisma.company.create({
      data: { name: `Sessionstest andra ${unique}` },
    }),
  ]);

  companyId = company.id;
  otherCompanyId = other.id;

  const owner = await unsafeGlobalPrisma.adminUser.create({
    data: {
      companyId,
      email: `agare-${unique}@example.com`,
      passwordHash: await bcrypt.hash("ett-langt-losenord", 12),
      role: "OWNER",
    },
  });

  ownerId = owner.id;
  sessionUserId = owner.id;
  sessionIssuedAt = Math.floor(Date.now() / 1000);
});

afterEach(async () => {
  sessionUserId = null;
  sessionIssuedAt = undefined;
  // Städas på båda hållen. En kvarglömd supportcookie hade gjort nästa test
  // till ett supportbesök utan att testet nämnde något om det.
  supportCookie = null;
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Sessionstest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("inloggad administratör", () => {
  it("får sitt företag och sin roll", async () => {
    const admin = await currentAdmin();

    expect(admin?.userId).toBe(ownerId);
    expect(admin?.companyId).toBe(companyId);
    expect(admin?.role).toBe("OWNER");
    expect(admin?.companyName).toBe(`Sessionstest ${unique}`);
  });

  it("utan session ges ingen åtkomst", async () => {
    sessionUserId = null;
    expect(await currentAdmin()).toBeNull();
  });
});

describe("återkallad behörighet gäller omedelbart", () => {
  it("borttaget konto nekas trots giltig session", async () => {
    // Sessionen ligger kvar orörd — det är precis situationen: personen har
    // fortfarande sin inloggning i webbläsaren.
    await unsafeGlobalPrisma.adminUser.delete({ where: { id: ownerId } });

    expect(await currentAdmin()).toBeNull();
  });

  it("degraderad ägare får sin nya roll, inte tokenens", async () => {
    await unsafeGlobalPrisma.adminUser.update({
      where: { id: ownerId },
      data: { role: "ADMIN" },
    });

    const admin = await currentAdmin();

    // Rollen styr vem som får bjuda in och ta bort konton. Läste vi den ur
    // token skulle en degraderad ägare behålla den makten i en månad.
    expect(admin?.role).toBe("ADMIN");
  });

  it("flyttat konto följer med till sitt nya företag", async () => {
    await unsafeGlobalPrisma.adminUser.update({
      where: { id: ownerId },
      data: { companyId: otherCompanyId },
    });

    const admin = await currentAdmin();

    expect(admin?.companyId).toBe(otherCompanyId);
  });
});

describe("lösenordsbyte ogiltigförklarar äldre sessioner", () => {
  it("session utfärdad före bytet nekas", async () => {
    // Situationen: någon annan har kommit åt kontot och är inloggad. Ägaren
    // byter lösenord. Då ska inkräktarens session sluta gälla, annars var
    // bytet meningslöst.
    sessionIssuedAt = Math.floor(Date.now() / 1000) - 3600;

    await unsafeGlobalPrisma.adminUser.update({
      where: { id: ownerId },
      data: { passwordChangedAt: new Date() },
    });

    expect(await currentAdmin()).toBeNull();
  });

  it("session utfärdad efter bytet gäller", async () => {
    await unsafeGlobalPrisma.adminUser.update({
      where: { id: ownerId },
      data: { passwordChangedAt: new Date(Date.now() - 3600 * 1000) },
    });

    sessionIssuedAt = Math.floor(Date.now() / 1000);

    expect(await currentAdmin()).not.toBeNull();
  });

  it("konto som aldrig bytt lösenord påverkas inte", async () => {
    sessionIssuedAt = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;

    expect(await currentAdmin()).not.toBeNull();
  });
});

describe("företagsnamnet läses ur databasen", () => {
  it("ett byte syns utan ny inloggning", async () => {
    await unsafeGlobalPrisma.company.update({
      where: { id: companyId },
      data: { name: `Sessionstest ${unique} omdöpt` },
    });

    const admin = await currentAdmin();

    expect(admin?.companyName).toBe(`Sessionstest ${unique} omdöpt`);
  });
});

describe("supportläge", () => {
  /**
   * Leverantören ser kundens panel utan kundens lösenord. Grinden måste då
   * lämna en session för KUNDENS företag men med LEVERANTÖRENS adress, och en
   * databasklient som inte kan skriva.
   *
   * Går något av det fel blir felet tyst: panelen ser ut att fungera, och
   * antingen skrivs kundens data av någon utifrån, eller så står leverantörens
   * ändringar som kundens egna i loggen.
   */

  /** Sätter en giltig supportcookie för ett företag. */
  async function enterSupport(target = companyId) {
    const visit = await unsafeGlobalPrisma.supportVisit.create({
      data: { companyId: target, email: "adi@terafalk.se" },
    });

    supportCookie = __internals.encode({
      companyId: target,
      email: "adi@terafalk.se",
      visitId: visit.id,
      exp: Math.floor(Date.now() / 1000) + 600,
    });

    return visit;
  }

  it("ger en session för kundens företag med leverantörens adress", async () => {
    await enterSupport();

    const session = await currentAdmin();

    expect(session?.companyId).toBe(companyId);
    // Inget kundkonto lånas. Står kundens adress här skulle allt som skrivs
    // ner under besöket påstå att de gjorde det.
    expect(session?.email).toBe("adi@terafalk.se");
    expect(session?.role).toBe("SUPPORT");
    expect(session?.support).toBeTruthy();
  });

  it("databasklienten kan läsa men inte skriva", async () => {
    await enterSupport();

    const session = await currentAdmin();

    expect(await session!.db.employee.count()).toBe(0);
    await expect(
      session!.db.employee.create({ data: { companyId, name: "Ny" } })
    ).rejects.toThrow();
  });

  it("assertWritable stoppar åtgärder som ändrar data", async () => {
    await enterSupport();

    const session = await currentAdmin();

    // Omdirigerar, kastar inte. Ett väntat nej ska inte bli ramverkets råa
    // felsida. Mocken av next/navigation kastar med adressen i meddelandet,
    // vilket är hur omdirigeringen går att kontrollera här.
    expect(() => assertWritable(session!)).toThrow(READ_ONLY_PATH);
  });

  it("assertWritable släpper igenom kundens egen inloggning", async () => {
    sessionUserId = ownerId;

    const session = await currentAdmin();

    expect(session?.support).toBeUndefined();
    expect(() => assertWritable(session!)).not.toThrow();
  });

  it("supportcookien vinner över en samtidig kundsession", async () => {
    // Att låta kundsessionen vinna hade gett SKRIVRÄTT i ett läge som ser ut
    // som läsläge — det värsta av de två utfallen.
    sessionUserId = ownerId;
    await enterSupport(otherCompanyId);

    const session = await currentAdmin();

    expect(session?.companyId).toBe(otherCompanyId);
    expect(session?.support).toBeTruthy();
  });

  it("ett besök hos ett raderat företag ger ingen session", async () => {
    // GILTIG cookie, borta företag. Grinden faller INTE tillbaka på kundens
    // egen session här — beforeEach har lagt en sådan, och den vore fel svar:
    // ett uttryckligt supportbesök ska inte tyst bli en vanlig inloggning.
    await enterSupport();
    await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });

    expect(await currentAdmin()).toBeNull();
  });

  /** En utgången cookie som pekar på ett riktigt besök. */
  async function expiredCookie() {
    const visit = await unsafeGlobalPrisma.supportVisit.create({
      data: { companyId, email: "adi@terafalk.se" },
    });

    supportCookie = __internals.encode({
      companyId,
      email: "adi@terafalk.se",
      visitId: visit.id,
      exp: Math.floor(Date.now() / 1000) - 1,
    });
  }

  it("en utgången cookie ger inget supportläge", async () => {
    sessionUserId = null;
    await expiredCookie();

    expect(await currentAdmin()).toBeNull();
  });

  it("en utgången cookie låser inte ut dig ur ditt eget konto", async () => {
    // Skillnaden mot testet ovan: en UTGÅNGEN cookie är inte ett pågående
    // besök, den är skräp i webbläsaren. Då ska den egna inloggningen gälla.
    // Ett raderat företag under ett GILTIGT besök är något annat, och ger null.
    //
    // beforeEach har redan lagt en kundsession, men den sätts här igen så att
    // testet inte vilar på något som står femtio rader bort.
    sessionUserId = ownerId;
    await expiredCookie();

    const session = await currentAdmin();

    expect(session?.companyId).toBe(companyId);
    expect(session?.support).toBeUndefined();
  });
});
