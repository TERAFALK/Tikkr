import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { unsafeGlobalPrisma } from "./db";
import { openText, sealText } from "./secret-box";
import {
  buildConfigFile,
  resolveConfigId,
  type ConfigParts,
  type ConfigValues,
} from "./kiosk-config";

/**
 * KONFIGURATIONERNA I DATABASEN.
 *
 * Reglerna står i kiosk-config.ts. Den här filen läser, sparar och lämnar ut.
 *
 * Plattformens tabeller nås via den ofiltrerade klienten, som avtalade priser.
 * Där något rör en kund (kundens val, en skärm) pekas företaget ut av ett
 * argument ur en prövad session, och varje fråga villkoras på det.
 */

/** Hemligheternas egen nyckel, se secret-box.ts. */
const PURPOSE = "kiosk-config";

/** Hur länge en engångsadress gäller. Appen hämtar den inom sekunder. */
const DOWNLOAD_TTL_MS = 2 * 60_000;

function seal(hidden: ConfigValues): string | null {
  return Object.keys(hidden).length === 0
    ? null
    : sealText(JSON.stringify(hidden), PURPOSE);
}

function openSecrets(sealed: string | null): ConfigValues {
  if (!sealed) return {};
  const text = openText(sealed, PURPOSE);
  // Går de inte att läsa har AUTH_SECRET bytts. Då skickas filen utan dem,
  // och det appen redan har står kvar: importen rör bara det som står i den.
  if (!text) return {};
  try {
    return JSON.parse(text) as ConfigValues;
  } catch {
    return {};
  }
}

function partsOf(version: { settings: Prisma.JsonValue; secretsSealed: string | null }): ConfigParts {
  return {
    settings: (version.settings ?? {}) as ConfigValues,
    secrets: openSecrets(version.secretsSealed),
  };
}

/* -------------------------------------------------------------------------- */
/* Plattformens lista och redigering                                           */
/* -------------------------------------------------------------------------- */

export async function listConfigs() {
  const configs = await unsafeGlobalPrisma.kioskConfig.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isDefault: true,
      updatedAt: true,
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true, version: true, createdAt: true, createdByEmail: true },
      },
      _count: { select: { companies: true, devices: true } },
    },
  });

  return configs.map((config) => ({
    id: config.id,
    name: config.name,
    isDefault: config.isDefault,
    latest: config.versions[0] ?? null,
    companies: config._count.companies,
    devices: config._count.devices,
  }));
}

/** En konfiguration med sina versioner och den senastes innehåll. */
export async function getConfig(configId: string) {
  const config = await unsafeGlobalPrisma.kioskConfig.findUnique({
    where: { id: configId },
    select: {
      id: true,
      name: true,
      isDefault: true,
      versions: {
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          createdAt: true,
          createdByEmail: true,
          settings: true,
          secretsSealed: true,
        },
      },
      companies: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      devices: {
        select: { id: true, name: true, company: { select: { id: true, name: true } } },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!config) return null;

  const [latest] = config.versions;

  return {
    id: config.id,
    name: config.name,
    isDefault: config.isDefault,
    companies: config.companies,
    devices: config.devices,
    versions: config.versions.map(({ id, version, createdAt, createdByEmail }) => ({
      id,
      version,
      createdAt,
      createdByEmail,
    })),
    latest: latest ? { id: latest.id, version: latest.version, ...partsOf(latest) } : null,
  };
}

/** Innehållet i en version, med hemligheterna öppnade. */
export async function versionParts(versionId: string): Promise<ConfigParts | null> {
  const version = await unsafeGlobalPrisma.kioskConfigVersion.findUnique({
    where: { id: versionId },
    select: { settings: true, secretsSealed: true },
  });
  return version ? partsOf(version) : null;
}

/** Den senaste versionens innehåll, eller null för en ny konfiguration. */
export async function latestParts(configId: string): Promise<ConfigParts | null> {
  const version = await unsafeGlobalPrisma.kioskConfigVersion.findFirst({
    where: { configId },
    orderBy: { version: "desc" },
    select: { settings: true, secretsSealed: true },
  });
  return version ? partsOf(version) : null;
}

/**
 * Skapar en konfiguration med sin första version.
 *
 * Finns ingen standard än blir den första konfigurationen standarden: annars
 * hade varje skärm stått utan konfiguration tills någon kom ihåg att välja.
 */
export async function createConfig(params: {
  name: string;
  parts: ConfigParts;
  byEmail: string;
}): Promise<{ id: string } | { error: string }> {
  const name = params.name.trim();
  if (!name) return { error: "Ge konfigurationen ett namn." };

  const taken = await unsafeGlobalPrisma.kioskConfig.findUnique({
    where: { name },
    select: { id: true },
  });
  if (taken) return { error: "Det finns redan en konfiguration med det namnet." };

  return unsafeGlobalPrisma.$transaction(async (tx) => {
    const hasDefault = (await tx.kioskConfig.count({ where: { isDefault: true } })) > 0;

    const config = await tx.kioskConfig.create({
      data: { name, isDefault: !hasDefault },
      select: { id: true },
    });

    await tx.kioskConfigVersion.create({
      data: {
        configId: config.id,
        version: 1,
        settings: params.parts.settings,
        secretsSealed: seal(params.parts.secrets),
        createdByEmail: params.byEmail,
      },
    });

    return { id: config.id };
  });
}

/** Sparar en ny version. Den förra står kvar och går att backa till. */
export async function saveVersion(params: {
  configId: string;
  parts: ConfigParts;
  byEmail: string;
}): Promise<{ version: number }> {
  return unsafeGlobalPrisma.$transaction(async (tx) => {
    const last = await tx.kioskConfigVersion.findFirst({
      where: { configId: params.configId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const version = (last?.version ?? 0) + 1;

    await tx.kioskConfigVersion.create({
      data: {
        configId: params.configId,
        version,
        settings: params.parts.settings,
        secretsSealed: seal(params.parts.secrets),
        createdByEmail: params.byEmail,
      },
    });

    await tx.kioskConfig.update({
      where: { id: params.configId },
      data: { updatedAt: new Date() },
    });

    return { version };
  });
}

/** Gör en konfiguration till standard. Den förra standarden slutar vara det. */
export async function setDefaultConfig(configId: string): Promise<void> {
  await unsafeGlobalPrisma.$transaction([
    unsafeGlobalPrisma.kioskConfig.updateMany({
      where: { isDefault: true, NOT: { id: configId } },
      data: { isDefault: false },
    }),
    unsafeGlobalPrisma.kioskConfig.update({
      where: { id: configId },
      data: { isDefault: true },
    }),
  ]);
}

export async function renameConfig(
  configId: string,
  name: string
): Promise<{ error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Ge konfigurationen ett namn." };

  const taken = await unsafeGlobalPrisma.kioskConfig.findFirst({
    where: { name: trimmed, NOT: { id: configId } },
    select: { id: true },
  });
  if (taken) return { error: "Det finns redan en konfiguration med det namnet." };

  await unsafeGlobalPrisma.kioskConfig.update({
    where: { id: configId },
    data: { name: trimmed },
  });
  return {};
}

/**
 * Tar bort en konfiguration som ingen använder.
 *
 * Standarden och en konfiguration som en kund eller skärm pekar på går inte
 * att ta bort. Skärmarna hade då fallit tillbaka på något annat utan att
 * någon bestämt det.
 */
export async function deleteConfig(configId: string): Promise<{ error?: string }> {
  const config = await unsafeGlobalPrisma.kioskConfig.findUnique({
    where: { id: configId },
    select: { isDefault: true, _count: { select: { companies: true, devices: true } } },
  });

  if (!config) return {};
  if (config.isDefault) return { error: "Standarden går inte att ta bort. Gör en annan till standard först." };
  if (config._count.companies + config._count.devices > 0) {
    return { error: "Konfigurationen används av en kund eller skärm. Välj en annan för dem först." };
  }

  await unsafeGlobalPrisma.kioskConfig.delete({ where: { id: configId } });
  return {};
}

/* -------------------------------------------------------------------------- */
/* Kundens och skärmens val                                                    */
/* -------------------------------------------------------------------------- */

export async function setCompanyConfig(
  companyId: string,
  configId: string | null
): Promise<void> {
  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: { kioskConfigId: configId },
  });
}

/** Skärmens egen konfiguration. Bara en skärm som hör till företaget. */
export async function setDeviceConfig(
  companyId: string,
  deviceId: string,
  configId: string | null
): Promise<boolean> {
  const { count } = await unsafeGlobalPrisma.kioskDevice.updateMany({
    where: { id: deviceId, companyId },
    data: { kioskConfigId: configId },
  });
  return count > 0;
}

/* -------------------------------------------------------------------------- */
/* Skärmen                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Versionen en skärm ska ha: den senaste av skärmens, kundens eller
 * standardens konfiguration. Null när ingen konfiguration finns.
 */
export async function versionForDevice(
  companyId: string,
  deviceId: string
): Promise<string | null> {
  const [device, company, standard] = await Promise.all([
    unsafeGlobalPrisma.kioskDevice.findFirst({
      where: { id: deviceId, companyId },
      select: { kioskConfigId: true },
    }),
    unsafeGlobalPrisma.company.findUnique({
      where: { id: companyId },
      select: { kioskConfigId: true },
    }),
    unsafeGlobalPrisma.kioskConfig.findFirst({
      where: { isDefault: true },
      select: { id: true },
    }),
  ]);

  // En skärm som inte hör till företaget får ingenting, inte ens standarden.
  if (!device) return null;

  const configId = resolveConfigId(
    device.kioskConfigId,
    company?.kioskConfigId ?? null,
    standard?.id ?? null
  );
  if (!configId) return null;

  const latest = await unsafeGlobalPrisma.kioskConfigVersion.findFirst({
    where: { configId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Ger en skärm en engångsadress till filen den ska läsa in.
 *
 * Bara den version skärmen faktiskt ska ha. En skärm kan alltså inte be om
 * en annan kunds konfiguration, även om den skulle gissa ett id.
 */
export async function createDownload(params: {
  companyId: string;
  deviceId: string;
  versionId: string;
}): Promise<string | null> {
  const wanted = await versionForDevice(params.companyId, params.deviceId);
  if (!wanted || wanted !== params.versionId) return null;

  // Städar bort gamla biljetter i samma veva. Ingen behöver dem efter ett dygn.
  await unsafeGlobalPrisma.kioskConfigDownload.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
  });

  const token = randomBytes(32).toString("base64url");

  await unsafeGlobalPrisma.kioskConfigDownload.create({
    data: {
      tokenHash: hash(token),
      deviceId: params.deviceId,
      versionId: params.versionId,
      expiresAt: new Date(Date.now() + DOWNLOAD_TTL_MS),
    },
  });

  return token;
}

/**
 * Löser in en engångsadress och lämnar ut filen, eller null.
 *
 * Biljetten markeras som använd i samma fråga som den prövas, så att två
 * hämtningar i samma ögonblick inte båda får filen.
 */
export async function redeemDownload(token: string): Promise<ConfigValues | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;

  const tokenHash = hash(token);
  const now = new Date();

  const { count } = await unsafeGlobalPrisma.kioskConfigDownload.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count === 0) return null;

  const download = await unsafeGlobalPrisma.kioskConfigDownload.findUnique({
    where: { tokenHash },
    select: { versionId: true },
  });
  if (!download) return null;

  const parts = await versionParts(download.versionId);
  return parts ? buildConfigFile(parts, download.versionId) : null;
}

/** Skärmen har rapporterat vilken version den läst in. */
export async function recordAppliedVersion(params: {
  companyId: string;
  deviceId: string;
  versionId: string;
}): Promise<void> {
  const exists = await unsafeGlobalPrisma.kioskConfigVersion.findUnique({
    where: { id: params.versionId },
    select: { id: true },
  });
  if (!exists) return;

  await unsafeGlobalPrisma.kioskDevice.updateMany({
    // Bara när versionen är ny, så att tidpunkten säger när den lästes in och
    // inte när skärmen senast rapporterade. Null uttryckligen: "inte lika med"
    // släpper i SQL inte igenom en rad som saknar värde.
    where: {
      id: params.deviceId,
      companyId: params.companyId,
      OR: [
        { appliedConfigVersionId: null },
        { appliedConfigVersionId: { not: params.versionId } },
      ],
    },
    data: { appliedConfigVersionId: params.versionId, configAppliedAt: new Date() },
  });
}
