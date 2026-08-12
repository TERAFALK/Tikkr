import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  assertLicenseAvailable,
  assertLicenseCountAllowed,
  getLicenseState,
  setLicenseCount,
  LicenseError,
  TRIAL_LICENSES,
} from "@/lib/licenses";

/**
 * Licenser för stämplingsskärmar.
 *
 * Regeln som skyddar kunden: kostnaden växer aldrig av sig själv. Regeln som
 * skyddar oss: ingen kan skapa fler skärmar än de betalar för.
 */

let companyId: string;

async function addDevice(active = true) {
  return unsafeGlobalPrisma.kioskDevice.create({
    data: {
      companyId,
      name: `Skärm ${Math.random().toString(36).slice(2, 8)}`,
      tokenHash: Math.random().toString(36).slice(2),
      active,
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

describe("återkallade skärmar räknas inte", () => {
  it("en återkallad skärm frigör sin licens", async () => {
    const first = await addDevice();
    await addDevice();

    expect((await getLicenseState(companyId)).available).toBe(0);

    await unsafeGlobalPrisma.kioskDevice.update({
      where: { id: first.id },
      data: { active: false },
    });

    const state = await getLicenseState(companyId);
    expect(state.used).toBe(1);
    expect(state.available).toBe(1);
    await expect(assertLicenseAvailable(companyId)).resolves.toBeUndefined();
  });
});

describe("ändra antalet licenser", () => {
  it("går att öka", async () => {
    await expect(assertLicenseCountAllowed(companyId, 5)).resolves.toBeUndefined();
  });

  it("går inte att sänka under antalet aktiva skärmar", async () => {
    await setLicenseCount(companyId, 3);
    await addDevice();
    await addDevice();
    await addDevice();

    // Tre aktiva skärmar — två licenser skulle släcka en av dem, och kunden
    // har inte pekat ut vilken.
    await expect(assertLicenseCountAllowed(companyId, 2)).rejects.toThrow(
      LicenseError
    );

    await expect(assertLicenseCountAllowed(companyId, 3)).resolves.toBeUndefined();
  });

  it("noll eller negativa antal avvisas", async () => {
    await expect(assertLicenseCountAllowed(companyId, 0)).rejects.toThrow(
      LicenseError
    );
    await expect(assertLicenseCountAllowed(companyId, -1)).rejects.toThrow(
      LicenseError
    );
    await expect(assertLicenseCountAllowed(companyId, 1.5)).rejects.toThrow(
      LicenseError
    );
  });

  it("orimligt stora antal avvisas", async () => {
    await expect(assertLicenseCountAllowed(companyId, 500)).rejects.toThrow(
      LicenseError
    );
  });

  it("nytt antal syns direkt", async () => {
    await setLicenseCount(companyId, 7);

    const state = await getLicenseState(companyId);
    expect(state.total).toBe(7);
    expect(state.available).toBe(7);
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
