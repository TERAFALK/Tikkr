import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  createConfig,
  createDownload,
  deleteConfig,
  getConfig,
  latestParts,
  recordAppliedVersion,
  redeemDownload,
  saveVersion,
  setCompanyConfig,
  setDefaultConfig,
  setDeviceConfig,
  versionForDevice,
} from "@/lib/kiosk-config-store";
import type { ConfigParts } from "@/lib/kiosk-config";

/**
 * KONFIGURATIONERNA I DATABASEN.
 *
 * Det som måste hålla:
 *   hemligheterna står aldrig i klartext i databasen
 *   en skärm får sin egen, annars kundens, annars standardens senaste version
 *   en engångsadress gäller en skärm, en version och en gång
 *   en annan kunds skärm kan inte välja eller hämta någon annans konfiguration
 *
 * Alla koder här är påhittade.
 */

process.env.AUTH_SECRET ??= "testhemlighet-for-konfigurationer";

const BY = "vi@tikkr.se";
const FAKE_PIN = "0000-test";

function parts(screensaver = "900", pin = FAKE_PIN): ConfigParts {
  return {
    settings: { startURL: "https://portal.tikkr.se/kiosk", timeToScreensaverV2: screensaver },
    secrets: { kioskPin: pin },
  };
}

let suffix: string;
let companyA: string;
let companyB: string;
let deviceA: string;
let deviceB: string;

async function makeConfig(name: string, p = parts()): Promise<string> {
  const result = await createConfig({ name: `${name} ${suffix}`, parts: p, byEmail: BY });
  if ("error" in result) throw new Error(result.error);
  return result.id;
}

beforeEach(async () => {
  suffix = Math.random().toString(36).slice(2, 8);
  // Standarden är en markering för hela plattformen. Testerna börjar utan.
  await unsafeGlobalPrisma.kioskConfig.updateMany({ data: { isDefault: false } });

  companyA = (await unsafeGlobalPrisma.company.create({ data: { name: `Konf A ${suffix}` } })).id;
  companyB = (await unsafeGlobalPrisma.company.create({ data: { name: `Konf B ${suffix}` } })).id;
  deviceA = (
    await unsafeGlobalPrisma.kioskDevice.create({
      data: { companyId: companyA, name: "Port", fullyVersion: "1.3e" },
    })
  ).id;
  deviceB = (
    await unsafeGlobalPrisma.kioskDevice.create({
      data: { companyId: companyB, name: "Port", fullyVersion: "1.3e" },
    })
  ).id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
  await unsafeGlobalPrisma.kioskConfig.deleteMany({ where: { name: { endsWith: suffix } } });
  await unsafeGlobalPrisma.kioskConfigDownload.deleteMany({
    where: { deviceId: { in: [deviceA, deviceB] } },
  });
});

describe("hemligheterna", () => {
  it("står aldrig i klartext i databasen, men kommer tillbaka", async () => {
    const id = await makeConfig("Hemlig");

    const row = await unsafeGlobalPrisma.kioskConfigVersion.findFirstOrThrow({
      where: { configId: id },
    });
    expect(JSON.stringify(row.settings)).not.toContain(FAKE_PIN);
    expect(row.secretsSealed).not.toContain(FAKE_PIN);

    expect((await latestParts(id))?.secrets.kioskPin).toBe(FAKE_PIN);
  });
});

describe("versioner och standard", () => {
  it("den första konfigurationen blir standard, och varje sparning en ny version", async () => {
    const id = await makeConfig("Första");
    expect((await getConfig(id))?.isDefault).toBe(true);

    expect((await saveVersion({ configId: id, parts: parts("60"), byEmail: BY })).version).toBe(2);
    const config = await getConfig(id);
    expect(config?.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(config?.latest?.settings.timeToScreensaverV2).toBe("60");
  });

  it("bara en standard i taget", async () => {
    const first = await makeConfig("Ett");
    const second = await makeConfig("Två");
    await setDefaultConfig(second);

    expect((await getConfig(first))?.isDefault).toBe(false);
    expect((await getConfig(second))?.isDefault).toBe(true);
  });

  it("standarden och en använd konfiguration går inte att ta bort", async () => {
    const standard = await makeConfig("Standard");
    const used = await makeConfig("Använd");
    await setCompanyConfig(companyA, used);

    expect((await deleteConfig(standard)).error).toBeTruthy();
    expect((await deleteConfig(used)).error).toBeTruthy();
  });
});

describe("vilken version en skärm ska ha", () => {
  it("skärmens går före kundens, som går före standarden", async () => {
    const standard = await makeConfig("Standard");
    const customer = await makeConfig("Kund");
    const trial = await makeConfig("Prov");

    const latest = async (configId: string) =>
      (await unsafeGlobalPrisma.kioskConfigVersion.findFirstOrThrow({
        where: { configId },
        orderBy: { version: "desc" },
      })).id;

    expect(await versionForDevice(companyA, deviceA)).toBe(await latest(standard));

    await setCompanyConfig(companyA, customer);
    expect(await versionForDevice(companyA, deviceA)).toBe(await latest(customer));
    // Den andra kunden påverkas inte.
    expect(await versionForDevice(companyB, deviceB)).toBe(await latest(standard));

    await setDeviceConfig(companyA, deviceA, trial);
    expect(await versionForDevice(companyA, deviceA)).toBe(await latest(trial));

    // En ny version når skärmen direkt.
    await saveVersion({ configId: trial, parts: parts("60"), byEmail: BY });
    expect(await versionForDevice(companyA, deviceA)).toBe(await latest(trial));
  });

  it("en kund kan inte sätta konfiguration på en annan kunds skärm", async () => {
    const config = await makeConfig("Fel kund");
    expect(await setDeviceConfig(companyA, deviceB, config)).toBe(false);

    const device = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({
      where: { id: deviceB },
    });
    expect(device.kioskConfigId).toBeNull();
  });
});

describe("engångsadressen", () => {
  async function wantedVersion() {
    await makeConfig("Standard");
    return (await versionForDevice(companyA, deviceA))!;
  }

  it("lämnar ut filen, med hemligheterna och märket", async () => {
    const versionId = await wantedVersion();
    const token = await createDownload({ companyId: companyA, deviceId: deviceA, versionId });
    expect(token).toBeTruthy();

    const file = await redeemDownload(token!);
    expect(file?.kioskPin).toBe(FAKE_PIN);
    expect(file?.customVariable).toBe(`tikkr-config:${versionId}`);
  });

  it("går att hämta igen strax efter, som appen gör", async () => {
    // Appen gav "file download failed with 404" när adressen bara gick att
    // använda en gång.
    const versionId = await wantedVersion();
    const token = await createDownload({ companyId: companyA, deviceId: deviceA, versionId });

    expect(await redeemDownload(token!)).not.toBeNull();
    expect(await redeemDownload(token!)).not.toBeNull();
  });

  it("men inte en minut efter första hämtningen", async () => {
    const versionId = await wantedVersion();
    const token = await createDownload({ companyId: companyA, deviceId: deviceA, versionId });
    await redeemDownload(token!);

    await unsafeGlobalPrisma.kioskConfigDownload.updateMany({
      where: { deviceId: deviceA },
      data: { usedAt: new Date(Date.now() - 61_000) },
    });

    expect(await redeemDownload(token!)).toBeNull();
  });

  it("ges bara för den version skärmen ska ha", async () => {
    const versionId = await wantedVersion();
    const other = await makeConfig("Annan");
    const otherVersion = (await latestVersionId(other))!;

    expect(
      await createDownload({ companyId: companyA, deviceId: deviceA, versionId: otherVersion })
    ).toBeNull();
    // Och inte för en skärm som hör till ett annat företag.
    expect(
      await createDownload({ companyId: companyB, deviceId: deviceA, versionId })
    ).toBeNull();
  });

  it("slutar gälla", async () => {
    const versionId = await wantedVersion();
    const token = await createDownload({ companyId: companyA, deviceId: deviceA, versionId });

    await unsafeGlobalPrisma.kioskConfigDownload.updateMany({
      where: { deviceId: deviceA },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await redeemDownload(token!)).toBeNull();
  });

  it("en gissad adress ger ingenting", async () => {
    await wantedVersion();
    expect(await redeemDownload("a".repeat(43))).toBeNull();
    expect(await redeemDownload("../../etc")).toBeNull();
  });
});

describe("vad skärmen rapporterar", () => {
  it("skriver versionen och tidpunkten när den är ny", async () => {
    const versionId = await (async () => {
      await makeConfig("Standard");
      return (await versionForDevice(companyA, deviceA))!;
    })();

    await recordAppliedVersion({ companyId: companyA, deviceId: deviceA, versionId });
    const first = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({ where: { id: deviceA } });
    expect(first.appliedConfigVersionId).toBe(versionId);
    expect(first.configAppliedAt).not.toBeNull();

    await recordAppliedVersion({ companyId: companyA, deviceId: deviceA, versionId });
    const second = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({ where: { id: deviceA } });
    expect(second.configAppliedAt?.getTime()).toBe(first.configAppliedAt?.getTime());
  });

  it("en okänd version eller en annan kunds skärm skrivs inte", async () => {
    await recordAppliedVersion({ companyId: companyA, deviceId: deviceA, versionId: "finnsinte12345" });
    await makeConfig("Standard");
    const versionId = (await versionForDevice(companyB, deviceB))!;
    await recordAppliedVersion({ companyId: companyA, deviceId: deviceB, versionId });

    const a = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({ where: { id: deviceA } });
    const b = await unsafeGlobalPrisma.kioskDevice.findUniqueOrThrow({ where: { id: deviceB } });
    expect(a.appliedConfigVersionId).toBeNull();
    expect(b.appliedConfigVersionId).toBeNull();
  });
});

async function latestVersionId(configId: string): Promise<string | null> {
  const row = await unsafeGlobalPrisma.kioskConfigVersion.findFirst({
    where: { configId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}
