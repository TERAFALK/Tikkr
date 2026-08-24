import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * KOPPLING AV EN STÄMPLINGSSKÄRM MED ENGÅNGSKOD.
 *
 * Sex siffror är en miljon kombinationer. Det är i sig inte mycket, och koden
 * är därför bara försvarbar tillsammans med tre begränsningar: fem minuters
 * livslängd, engångsanvändning och ett tak på antalet gissningar.
 *
 * De två första prövas här. Taket prövas i login-throttle.test.ts, eftersom
 * det är samma spärr som inloggningarna använder.
 *
 * next/headers ersätts: modulen hör hemma i ett inkommande anrop. Ingen av
 * funktionerna nedan rör cookies — de tar och ger värden, och det är
 * anropande kod i webbservern som lägger token i en cookie.
 */
vi.mock("next/headers", () => ({
  cookies: async () => {
    throw new Error("Testerna ska inte röra cookies.");
  },
}));

import {
  createKioskDevice,
  deviceState,
  hashToken,
  PAIRING_CODE_MINUTES,
  redeemPairingCode,
  resolveDeviceToken,
  startPairing,
  unpairDevice,
} from "@/lib/kiosk-auth";

let companyId: string;

beforeEach(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Kopplingstest ${Math.random().toString(36).slice(2, 8)}` },
  });

  companyId = company.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({
    where: { name: { startsWith: "Kopplingstest " } },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("koden", () => {
  it("består av sex siffror och gäller fem minuter", async () => {
    const before = Date.now();
    const { pairing } = await createKioskDevice(companyId, "Verkstaden");

    expect(pairing.code).toMatch(/^\d{6}$/);

    const lifetime = pairing.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan(0);
    expect(lifetime).toBeLessThanOrEqual(PAIRING_CODE_MINUTES * 60 * 1000 + 500);
  });

  it("sparas som fingeravtryck, aldrig i klartext", async () => {
    const { device, pairing } = await createKioskDevice(companyId, "Entrén");

    const row = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({
      where: { id: device.id },
    });

    expect(row.pairingCodeHash).toBe(hashToken(pairing.code));
    expect(row.pairingCodeHash).not.toContain(pairing.code);
  });

  it("fungerar en gång, inte två", async () => {
    const { pairing } = await createKioskDevice(companyId, "Monteringen");

    const first = await redeemPairingCode(pairing.code);
    expect(first).not.toBeNull();

    // Andra försöket är någon annan som fått tag i koden. Den ska vara
    // förbrukad i samma stund den första skärmen kopplades.
    expect(await redeemPairingCode(pairing.code)).toBeNull();
  });

  it("ger en token som pekar på rätt skärm och företag", async () => {
    const { device, pairing } = await createKioskDevice(companyId, "Svetsen");

    const result = await redeemPairingCode(pairing.code);
    expect(result?.session.deviceId).toBe(device.id);
    expect(result?.session.deviceName).toBe("Svetsen");
    expect(result?.session.companyId).toBe(companyId);

    // Token duger till att slå upp skärmen efteråt. Det är den vägen varje
    // stämpling går.
    const session = await resolveDeviceToken(result!.token);
    expect(session?.deviceId).toBe(device.id);
  });

  it("en kod som gått ut avvisas", async () => {
    const { device, pairing } = await createKioskDevice(companyId, "Lagret");

    await unsafeGlobalPrisma.kioskDevice.update({
      where: { id: device.id },
      data: { pairingExpiresAt: new Date(Date.now() - 1000) },
    });

    expect(await redeemPairingCode(pairing.code)).toBeNull();
  });

  it("fel kod avvisas", async () => {
    await createKioskDevice(companyId, "Kontoret");

    expect(await redeemPairingCode("000000")).toBeNull();
    expect(await redeemPairingCode("12345")).toBeNull();
    expect(await redeemPairingCode("abcdef")).toBeNull();
  });

  it("en kod kopplar bara sin egen skärm", async () => {
    const first = await createKioskDevice(companyId, "Skärm ett");
    const second = await createKioskDevice(companyId, "Skärm två");

    const result = await redeemPairingCode(first.pairing.code);
    expect(result?.session.deviceId).toBe(first.device.id);

    // Den andra skärmen är orörd och väntar fortfarande på sin egen kod.
    const row = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({
      where: { id: second.device.id },
    });

    expect(row.tokenHash).toBeNull();
    expect(row.pairingCodeHash).toBe(hashToken(second.pairing.code));
  });
});

describe("koppla om", () => {
  it("nollar den gamla token, så en kvarglömd cookie slutar fungera", async () => {
    const { device, pairing } = await createKioskDevice(companyId, "Verkstaden");
    const paired = await redeemPairingCode(pairing.code);

    expect(await resolveDeviceToken(paired!.token)).not.toBeNull();

    // Surfplattan har kommit bort. Admin trycker Koppla om.
    const again = await startPairing(device.id);

    // Den gamla enheten är utestängd utan att någon rört den.
    expect(await resolveDeviceToken(paired!.token)).toBeNull();

    // Den nya koden kopplar samma skärm, med samma id och namn.
    const repaired = await redeemPairingCode(again.code);
    expect(repaired?.session.deviceId).toBe(device.id);
    expect(repaired?.session.deviceName).toBe("Verkstaden");
  });

  it("historiken följer med skärmen", async () => {
    const { device, pairing } = await createKioskDevice(companyId, "Verkstaden");
    await redeemPairingCode(pairing.code);

    const before = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({
      where: { id: device.id },
    });

    await startPairing(device.id);

    const after = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({
      where: { id: device.id },
    });

    expect(after.id).toBe(before.id);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
  });
});

describe("koppla loss", () => {
  it("stänger ute enheten och sätter skärmen i väntande läge", async () => {
    const { device, pairing } = await createKioskDevice(companyId, "Entrén");
    const paired = await redeemPairingCode(pairing.code);

    await unpairDevice(device.id);

    expect(await resolveDeviceToken(paired!.token)).toBeNull();

    const row = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({
      where: { id: device.id },
    });

    expect(row.tokenHash).toBeNull();
    expect(row.pairingCodeHash).toBeNull();
  });
});

describe("läget räknas fram ur databasen", () => {
  it("kopplad, väntar och utgången skiljs åt", () => {
    const soon = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 60_000);

    expect(
      deviceState({ tokenHash: "något", pairingExpiresAt: null })
    ).toBe("kopplad");

    expect(
      deviceState({ tokenHash: null, pairingExpiresAt: soon })
    ).toBe("väntar");

    expect(
      deviceState({ tokenHash: null, pairingExpiresAt: past })
    ).toBe("utgången");

    expect(
      deviceState({ tokenHash: null, pairingExpiresAt: null })
    ).toBe("utgången");
  });

  it("en kopplad skärm räknas som kopplad även med en kod kvar", () => {
    // Kan inte inträffa i dag, eftersom inlösen nollar koden. Regeln skrivs
    // ändå ned: en fungerande token väger tyngre än en kod på vift.
    expect(
      deviceState({
        tokenHash: "något",
        pairingExpiresAt: new Date(Date.now() + 60_000),
      })
    ).toBe("kopplad");
  });
});
