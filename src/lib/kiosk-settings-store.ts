import { unsafeGlobalPrisma } from "./db";
import {
  parseKioskSetting,
  resolveKioskSettings,
  type KioskSettingKey,
  type KioskSettings,
} from "./kiosk-settings";

/**
 * SKÄRMINSTÄLLNINGARNA I DATABASEN.
 *
 * Registret och reglerna står i kiosk-settings.ts. Den här filen läser och
 * skriver raderna.
 *
 * Går via den ofiltrerade klienten, som avtalade priser: plattformspanelen
 * skriver, och stämplingsskärmens rutt läser utan en inloggad användare.
 * Företaget pekas alltid ut av argumentet, och argumentet kommer från en
 * prövad session, aldrig ur ett anrop.
 */

function toRecord(rows: { key: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/** Plattformens standardvärden, som de står i databasen. */
export async function storedKioskDefaults(): Promise<Record<string, string>> {
  return toRecord(
    await unsafeGlobalPrisma.kioskSettingDefault.findMany({
      select: { key: true, value: true },
    })
  );
}

/** En kunds egna värden, som de står i databasen. */
export async function storedCompanyKioskSettings(
  companyId: string
): Promise<Record<string, string>> {
  return toRecord(
    await unsafeGlobalPrisma.companyKioskSetting.findMany({
      where: { companyId },
      select: { key: true, value: true },
    })
  );
}

/**
 * Vad som gäller för en kunds skärmar.
 *
 * Anropas av skärmens rutt var femte sekund. Två små uppslag, i samma anda
 * som ljusstyrkan, hellre än ett eget anrop till för samma sak.
 */
export async function kioskSettingsFor(companyId: string): Promise<KioskSettings> {
  const [defaults, overrides] = await Promise.all([
    storedKioskDefaults(),
    storedCompanyKioskSettings(companyId),
  ]);

  return resolveKioskSettings(defaults, overrides);
}

/**
 * Sätter plattformens standard för en inställning.
 *
 * Ett ogiltigt värde sparas inte, och felet lämnas tillbaka i stället för att
 * kastas, så att formuläret kan visa det.
 */
export async function setKioskDefault(params: {
  key: KioskSettingKey;
  /** Null tar bort raden, och registrets värde gäller igen. */
  raw: string | null;
  byEmail: string;
}): Promise<{ value: string | null } | { error: string }> {
  if (params.raw === null) {
    await unsafeGlobalPrisma.kioskSettingDefault.deleteMany({
      where: { key: params.key },
    });
    return { value: null };
  }

  const parsed = parseKioskSetting(params.key, params.raw);
  if ("error" in parsed) return parsed;

  await unsafeGlobalPrisma.kioskSettingDefault.upsert({
    where: { key: params.key },
    update: { value: parsed.value, updatedByEmail: params.byEmail },
    create: { key: params.key, value: parsed.value, updatedByEmail: params.byEmail },
  });

  return parsed;
}

/**
 * Sätter eller tar bort en kunds eget värde.
 *
 * `raw` null tar bort raden, och kunden följer då standarden igen.
 */
export async function setCompanyKioskSetting(params: {
  companyId: string;
  key: KioskSettingKey;
  raw: string | null;
  byEmail: string;
}): Promise<{ value: string | null } | { error: string }> {
  const { companyId, key, byEmail } = params;

  if (params.raw === null) {
    await unsafeGlobalPrisma.companyKioskSetting.deleteMany({
      where: { companyId, key },
    });
    return { value: null };
  }

  const parsed = parseKioskSetting(key, params.raw);
  if ("error" in parsed) return parsed;

  await unsafeGlobalPrisma.companyKioskSetting.upsert({
    where: { companyId_key: { companyId, key } },
    update: { value: parsed.value, updatedByEmail: byEmail },
    create: { companyId, key, value: parsed.value, updatedByEmail: byEmail },
  });

  return parsed;
}
