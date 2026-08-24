import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * KOPPLING AV EN STÄMPLINGSSKÄRM MED ENGÅNGSKOD.
 *
 * Sex siffror är en miljon kombinationer. Det är i sig inte mycket, och koden
 * är därför bara försvarbar tillsammans med tre begränsningar: fem minuters
 * livslängd, engångsanvändning och ett tak på antalet gissningar.
 *
 * Alla tre prövas här. Spärren mot gissningar är samma modul som
 * inloggningarna använder — vad den gör i sig står i login-throttle.test.ts,
 * medan det som prövas här är att kopplingen faktiskt är kopplad till den.
 *
 * next/headers och next/cache ersätts: båda hör hemma i ett inkommande anrop.
 * Cookie-burken nedan är en riktig liten attrapp och inte bara en tyst
 * placeholder — serveråtgärden ska bevisligen lägga token i en cookie, och det
 * går bara att pröva om någon skriver ned vad den satte.
 */

/** Vad kioskens cookie innehåller just nu, som pairDevice lämnat den. */
const jar = new Map<string, { value: string; options: Record<string, unknown> }>();

/** Avsändarens adress. Ändras per test för att skilja två uppringare åt. */
let callerIp = "198.51.100.1";

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const row = jar.get(name);
      return row ? { name, value: row.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown>) => {
      jar.set(name, { value, options });
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
  headers: async () => new Map([["x-forwarded-for", callerIp]]),
}));

import { pairDevice } from "@/app/kiosk/actions";
import { __resetThrottle } from "@/lib/login-throttle";
import {
  createKioskDevice,
  deviceState,
  hashToken,
  KIOSK_COOKIE,
  PAIRING_CODE_MINUTES,
  redeemPairingCode,
  resolveDeviceToken,
  startPairing,
  unpairDevice,
} from "@/lib/kiosk-auth";

let companyId: string;

beforeEach(async () => {
  jar.clear();
  __resetThrottle();
  callerIp = `198.51.100.${Math.ceil(Math.random() * 250)}`;

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

/**
 * SPÄRREN MOT ATT GISSA SIG TILL EN KOD.
 *
 * Prövas mot serveråtgärden och inte mot spärrmodulen, eftersom det som kan gå
 * fel är att någon glömmer anropa den. En kod på sex siffror utan tak är en
 * miljon kombinationer som ett skript betar av på minuter, och den som lyckas
 * kopplar en egen skärm till ett främmande företags anställda.
 *
 * Det avgörande beviset är det sista testet: när låsningen slagit till avvisas
 * även den RÄTTA koden. En spärr som släpper igenom rätt svar räknar bara
 * misslyckanden och stoppar ingen som håller på tills det lyckas.
 */
describe("tak på antalet gissningar", () => {
  it("rätt kod kopplar och lägger token i en cookie som skriptet inte når", async () => {
    const { device, pairing } = await createKioskDevice(companyId, "Verkstaden");

    const form = new FormData();
    form.set("code", pairing.code);

    const result = await pairDevice({}, form);
    expect(result.pairedAs).toBe("Verkstaden");
    expect(result.error).toBeUndefined();

    const cookie = jar.get(KIOSK_COOKIE);
    expect(cookie).toBeDefined();

    // httpOnly är det som gör att ett skript på sidan inte kan läsa ut token
    // och bära den vidare.
    expect(cookie?.options.httpOnly).toBe(true);

    const session = await resolveDeviceToken(cookie!.value);
    expect(session?.deviceId).toBe(device.id);
  });

  it("en kod som inte är sex siffror avvisas utan att röra skärmen", async () => {
    const { device, pairing } = await createKioskDevice(companyId, "Entrén");

    const form = new FormData();
    form.set("code", "123");

    expect((await pairDevice({}, form)).error).toBeTruthy();
    expect(jar.has(KIOSK_COOKIE)).toBe(false);

    // Skärmens egen kod är orörd och fungerar fortfarande.
    const row = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({
      where: { id: device.id },
    });
    expect(row.pairingCodeHash).toBe(hashToken(pairing.code));
  });

  it("femte felgissningen låser, och därefter avvisas även rätt kod", async () => {
    const { pairing } = await createKioskDevice(companyId, "Monteringen");

    // Fem gissningar som alla är fel. Att träffa rätt på måfå här är en risk
    // på en miljon per försök, och koden skapas om i varje test.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const guess = new FormData();
      guess.set("code", String(100000 + attempt));

      expect((await pairDevice({}, guess)).error).toBeTruthy();
    }

    // Den rätta koden lever fortfarande och skärmen är fortfarande väntande.
    // Det enda som ändrats är att avsändaren är utelåst.
    const form = new FormData();
    form.set("code", pairing.code);

    const result = await pairDevice({}, form);
    expect(result.pairedAs).toBeUndefined();
    expect(result.error).toContain("För många försök");
    expect(jar.has(KIOSK_COOKIE)).toBe(false);

    // Koden är inte förbrukad — den som har rätt att koppla skärmen kan göra
    // det från en annan enhet, eller när låsningen släppt.
    expect(await redeemPairingCode(pairing.code)).not.toBeNull();
  });

  it("låsningen träffar bara den som gissat", async () => {
    const { pairing } = await createKioskDevice(companyId, "Svetsen");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const guess = new FormData();
      guess.set("code", String(200000 + attempt));
      await pairDevice({}, guess);
    }

    // En verkstad delar ofta en utgående adress, men gissningarna kommer
    // någon annanstans ifrån. Den som står vid skärmen ska inte straffas.
    callerIp = "203.0.113.7";

    const form = new FormData();
    form.set("code", pairing.code);

    expect((await pairDevice({}, form)).pairedAs).toBe("Svetsen");
  });

  it("en lyckad koppling nollställer räknaren", async () => {
    const first = await createKioskDevice(companyId, "Skärm ett");

    // Fyra felslag — en person som läser fel i motljus, inte ett skript.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const guess = new FormData();
      guess.set("code", String(300000 + attempt));
      await pairDevice({}, guess);
    }

    const form = new FormData();
    form.set("code", first.pairing.code);
    expect((await pairDevice({}, form)).pairedAs).toBe("Skärm ett");

    // Nästa skärm sätts upp från samma enhet direkt efteråt. Hade räknaren
    // stått kvar hade ett enda felslag räckt för att låsa ute installatören
    // mitt i arbetet.
    const second = await createKioskDevice(companyId, "Skärm två");

    const stray = new FormData();
    stray.set("code", "400000");
    expect((await pairDevice({}, stray)).error).toBeTruthy();

    const next = new FormData();
    next.set("code", second.pairing.code);
    expect((await pairDevice({}, next)).pairedAs).toBe("Skärm två");
  });
});
