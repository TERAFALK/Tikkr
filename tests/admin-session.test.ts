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
 */

/** Vad den påhittade sessionen ska svara. Ändras per test. */
let sessionUserId: string | null = null;

vi.mock("@/lib/auth", () => ({
  auth: async () =>
    sessionUserId ? { user: { id: sessionUserId } } : null,
}));

// Ersätts för att modulen hör hemma i en webbserver, inte i ett test. Ingen av
// funktionerna som prövas här omdirigerar — currentAdmin() svarar med null och
// låter anroparen bestämma vad som ska hända.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`Oväntad omdirigering till ${to}`);
  },
}));

const { currentAdmin } = await import("@/lib/admin-session");

let companyId: string;
let otherCompanyId: string;
let ownerId: string;
let unique: string;

beforeEach(async () => {
  unique = Math.random().toString(36).slice(2, 10);

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
});

afterEach(async () => {
  sessionUserId = null;
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
