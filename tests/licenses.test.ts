import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  assertLicenseAvailable,
  getLicenseState,
  setLicenseCount,
  LicenseError,
  TRIAL_LICENSES,
} from "@/lib/licenses";

/**
 * Licenser för stämplingsskärmar.
 *
 * Regeln som skyddar kunden: antalet ändras bara när de själva ändrar det hos
 * Stripe, och en sänkning stänger aldrig en skärm. Regeln som skyddar oss:
 * ingen kan skapa fler skärmar än de betalar för.
 */

let companyId: string;

async function addDevice() {
  return unsafeGlobalPrisma.kioskDevice.create({
    data: {
      companyId,
      name: `Skärm ${Math.random().toString(36).slice(2, 8)}`,
      tokenHash: Math.random().toString(36).slice(2),
    },
  });
}

beforeEach(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Licenstest ${Math.random().toString(36).slice(2, 8)}` },
  });
  companyId = company.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Licenstest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("provperioden", () => {
  it("ger två licenser från start", async () => {
    const state = await getLicenseState(companyId);

    expect(TRIAL_LICENSES).toBe(2);
    expect(state.total).toBe(2);
    expect(state.used).toBe(0);
    expect(state.available).toBe(2);
  });

  it("två skärmar går att skapa, den tredje inte", async () => {
    await addDevice();
    await assertLicenseAvailable(companyId);

    await addDevice();
    await expect(assertLicenseAvailable(companyId)).rejects.toThrow(
      LicenseError
    );
  });
});

describe("en skärm upptar sin licens tills den raderas", () => {
  it("radering frigör licensen", async () => {
    const first = await addDevice();
    await addDevice();

    expect((await getLicenseState(companyId)).available).toBe(0);

    await unsafeGlobalPrisma.kioskDevice.delete({ where: { id: first.id } });

    const state = await getLicenseState(companyId);
    expect(state.used).toBe(1);
    expect(state.available).toBe(1);
    await expect(assertLicenseAvailable(companyId)).resolves.toBeUndefined();
  });

  it("en skärm som väntar på sin kod räknas ändå", async () => {
    // Det är kunden som bestämt att skärmen ska finnas. Att den ännu inte
    // knappat in sin kod gör den inte gratis — annars skulle en installation
    // kunna byggas ut obegränsat genom att aldrig koppla färdigt.
    await unsafeGlobalPrisma.kioskDevice.create({
      data: { companyId, name: "Väntar på kod" },
    });

    const state = await getLicenseState(companyId);
    expect(state.used).toBe(1);
    expect(state.available).toBe(1);
  });
});

describe("ändra antalet licenser", () => {
  it("nytt antal syns direkt", async () => {
    await setLicenseCount(companyId, 7);

    const state = await getLicenseState(companyId);
    expect(state.total).toBe(7);
    expect(state.available).toBe(7);
  });

  it("antalet kan aldrig bli noll", async () => {
    // Stripe ska inte kunna skicka ned oss till noll licenser, oavsett vad
    // som händer där. En kund utan licenser vore en kund utan stämpling.
    await setLicenseCount(companyId, 0);

    const state = await getLicenseState(companyId);
    expect(state.total).toBe(1);
  });

  it("färre licenser än upplagda skärmar stänger ingen skärm", async () => {
    await setLicenseCount(companyId, 3);
    const first = await addDevice();
    await addDevice();
    await addDevice();

    // Kunden sänker till en licens hos Stripe. Vi kan inte hindra det, och
    // ska inte gissa vilken av de tre skärmarna som ska bort.
    await setLicenseCount(companyId, 1);

    const state = await getLicenseState(companyId);
    expect(state.total).toBe(1);
    expect(state.used).toBe(3);

    // Inget negativt tal, och inga lediga licenser att skapa fler på.
    expect(state.available).toBe(0);
    await expect(assertLicenseAvailable(companyId)).rejects.toThrow(
      LicenseError
    );

    // Skärmarna är kvar och fungerar. En token som finns kvar är just det som
    // gör att skärmen fortsätter stämpla.
    const device = await unsafeGlobalPrisma.kioskDevice.findUnique({
      where: { id: first.id },
      select: { tokenHash: true },
    });
    expect(device?.tokenHash).toBe(first.tokenHash);
  });
});

describe("isolering", () => {
  it("ett annat företags skärmar räknas inte", async () => {
    const other = await unsafeGlobalPrisma.company.create({
      data: { name: "Licenstest grannen" },
    });

    await unsafeGlobalPrisma.kioskDevice.createMany({
      data: [
        { companyId: other.id, name: "A", tokenHash: "grann-a" },
        { companyId: other.id, name: "B", tokenHash: "grann-b" },
      ],
    });

    const state = await getLicenseState(companyId);
    expect(state.used).toBe(0);
    expect(state.available).toBe(2);
  });
});
