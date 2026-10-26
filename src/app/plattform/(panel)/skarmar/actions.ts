"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import {
  recordPlatformAction,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import {
  SECRET_KEYS,
  configWarnings,
  parseConfigUpload,
  type ConfigParts,
  type ConfigValues,
} from "@/lib/kiosk-config";
import {
  createConfig,
  deleteConfig,
  latestParts,
  renameConfig,
  saveVersion,
  setCompanyConfig,
  setDefaultConfig,
  setDeviceConfig,
  versionParts,
} from "@/lib/kiosk-config-store";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * KONFIGURATIONERNA I PLATTFORMSPANELEN.
 *
 * Inget värde ur en konfiguration skrivs i händelseloggen, bara vad som
 * gjordes och med vilken konfiguration. Filerna bär PIN-koden och lösenorden.
 */

export interface ConfigFormState {
  error?: string;
  ok?: string;
  /** Det som kan stänga ute oss. Skickas igen med confirm=1 för att spara. */
  warnings?: string[];
}

/** Värdarna skärmarna får peka på utan varning. */
function ourHosts(): string[] {
  const hosts: string[] = [];
  if (process.env.PORTAL_HOST) hosts.push(process.env.PORTAL_HOST.trim());
  try {
    hosts.push(new URL(appUrl()).hostname);
  } catch {
    // Utan APP_URL varnas det bara inte för startadressen.
  }
  return hosts;
}

function revalidateAll(configId?: string) {
  revalidatePath("/plattform/skarmar");
  if (configId) revalidatePath(`/plattform/skarmar/${configId}`);
}

/** Skapar en konfiguration ur en uppladdad eller inklistrad export. */
export async function createKioskConfig(
  _previous: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  const { email } = await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "");
  const parts = parseConfigUpload(String(formData.get("file") ?? ""));
  if ("error" in parts) return { error: parts.error };

  const result = await createConfig({ name, parts, byEmail: email });
  if ("error" in result) return { error: result.error };

  await recordPlatformAction({
    actorEmail: email,
    action: "Skapade skärmkonfiguration",
    detail: name.trim(),
  });

  revalidateAll();
  redirect(`/plattform/skarmar/${result.id}`);
}

/**
 * Läser formuläret: inställningarna som JSON, och hemligheterna i egna fält.
 *
 * Står en hemlighet i den inklistrade texten vinner den över fältet: den som
 * klistrar in en ny export ska få exportens PIN-kod. Ett tomt fält tar bort
 * hemligheten ur filen.
 */
function readEditor(formData: FormData): ConfigParts | { error: string } {
  const parsed = parseConfigUpload(String(formData.get("settings") ?? ""));
  if ("error" in parsed) return parsed;

  const secrets: ConfigValues = {};
  for (const key of SECRET_KEYS) {
    const value = formData.get(`secret:${key}`);
    if (typeof value === "string" && value !== "") secrets[key] = value;
  }

  return {
    settings: parsed.settings,
    secrets: { ...secrets, ...parsed.secrets },
  };
}

async function saveWithWarnings(params: {
  configId: string;
  next: ConfigParts;
  confirmed: boolean;
  email: string;
  action: string;
}): Promise<ConfigFormState> {
  const config = await unsafeGlobalPrisma.kioskConfig.findUnique({
    where: { id: params.configId },
    select: { name: true },
  });
  if (!config) return { error: "Konfigurationen finns inte längre." };

  const previous = await latestParts(params.configId);
  const warnings = configWarnings(previous, params.next, ourHosts());
  if (warnings.length > 0 && !params.confirmed) return { warnings };

  const { version } = await saveVersion({
    configId: params.configId,
    parts: params.next,
    byEmail: params.email,
  });

  await recordPlatformAction({
    actorEmail: params.email,
    action: params.action,
    detail: `${config.name}, version ${version}`,
  });

  revalidateAll(params.configId);
  return { ok: `Version ${version} är sparad. Skärmarna läser in den inom någon minut.` };
}

/** Sparar redigeraren som en ny version. */
export async function saveKioskConfig(
  _previous: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  const { email } = await requirePlatformAdmin();

  const configId = String(formData.get("configId") ?? "");
  const next = readEditor(formData);
  if ("error" in next) return { error: next.error };

  return saveWithWarnings({
    configId,
    next,
    confirmed: formData.get("confirm") === "1",
    email,
    action: "Sparade skärmkonfiguration",
  });
}

/** Sparar en äldre version som en ny. Den nyaste står kvar. */
export async function restoreKioskVersion(
  _previous: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  const { email } = await requirePlatformAdmin();

  const configId = String(formData.get("configId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");

  const version = await unsafeGlobalPrisma.kioskConfigVersion.findFirst({
    where: { id: versionId, configId },
    select: { id: true },
  });
  if (!version) return { error: "Versionen finns inte." };

  const parts = await versionParts(versionId);
  if (!parts) return { error: "Versionen finns inte." };

  return saveWithWarnings({
    configId,
    next: parts,
    confirmed: formData.get("confirm") === "1",
    email,
    action: "Återställde skärmkonfiguration",
  });
}

export async function makeDefaultKioskConfig(
  _previous: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  const { email } = await requirePlatformAdmin();
  const configId = String(formData.get("configId") ?? "");

  const config = await unsafeGlobalPrisma.kioskConfig.findUnique({
    where: { id: configId },
    select: { name: true },
  });
  if (!config) return { error: "Konfigurationen finns inte längre." };

  await setDefaultConfig(configId);
  await recordPlatformAction({
    actorEmail: email,
    action: "Gjorde skärmkonfiguration till standard",
    detail: config.name,
  });

  revalidateAll(configId);
  return { ok: `${config.name} är standard.` };
}

export async function renameKioskConfig(
  _previous: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  const { email } = await requirePlatformAdmin();
  const configId = String(formData.get("configId") ?? "");
  const name = String(formData.get("name") ?? "");

  const result = await renameConfig(configId, name);
  if (result.error) return { error: result.error };

  await recordPlatformAction({
    actorEmail: email,
    action: "Döpte om skärmkonfiguration",
    detail: name.trim(),
  });

  revalidateAll(configId);
  return { ok: "Namnet är ändrat." };
}

export async function deleteKioskConfig(
  _previous: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  const { email } = await requirePlatformAdmin();
  const configId = String(formData.get("configId") ?? "");

  const config = await unsafeGlobalPrisma.kioskConfig.findUnique({
    where: { id: configId },
    select: { name: true },
  });

  const result = await deleteConfig(configId);
  if (result.error) return { error: result.error };

  await recordPlatformAction({
    actorEmail: email,
    action: "Tog bort skärmkonfiguration",
    detail: config?.name,
  });

  revalidateAll();
  redirect("/plattform/skarmar");
}

/** Kundens konfiguration. Tomt val ger standarden. */
export async function chooseCompanyConfig(
  _previous: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  const { email } = await requirePlatformAdmin();
  const companyId = String(formData.get("companyId") ?? "");
  const configId = String(formData.get("configId") ?? "") || null;

  const [company, config] = await Promise.all([
    unsafeGlobalPrisma.company.findUnique({ where: { id: companyId }, select: { id: true } }),
    configId
      ? unsafeGlobalPrisma.kioskConfig.findUnique({ where: { id: configId }, select: { name: true } })
      : null,
  ]);
  if (!company) return { error: "Okänt företag." };
  if (configId && !config) return { error: "Konfigurationen finns inte längre." };

  await setCompanyConfig(companyId, configId);
  await recordPlatformAction({
    actorEmail: email,
    action: "Valde skärmkonfiguration",
    targetCompanyId: companyId,
    detail: config?.name ?? "Standard",
  });

  revalidatePath(`/plattform/kunder/${companyId}`);
  revalidateAll(configId ?? undefined);
  return { ok: "Sparat. Skärmarna läser in den inom någon minut." };
}

/** En enskild skärms konfiguration, för att prova. Tomt val ger kundens. */
export async function chooseDeviceConfig(
  _previous: ConfigFormState,
  formData: FormData
): Promise<ConfigFormState> {
  const { email } = await requirePlatformAdmin();
  const companyId = String(formData.get("companyId") ?? "");
  const deviceId = String(formData.get("deviceId") ?? "");
  const configId = String(formData.get("configId") ?? "") || null;

  const config = configId
    ? await unsafeGlobalPrisma.kioskConfig.findUnique({
        where: { id: configId },
        select: { name: true },
      })
    : null;
  if (configId && !config) return { error: "Konfigurationen finns inte längre." };

  const ok = await setDeviceConfig(companyId, deviceId, configId);
  if (!ok) return { error: "Okänd skärm." };

  await recordPlatformAction({
    actorEmail: email,
    action: "Valde skärmkonfiguration för en skärm",
    targetCompanyId: companyId,
    detail: config?.name ?? "Kundens",
  });

  revalidatePath(`/plattform/kunder/${companyId}`);
  revalidateAll(configId ?? undefined);
  return { ok: "Sparat." };
}
