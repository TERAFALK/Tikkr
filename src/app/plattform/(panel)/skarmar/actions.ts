"use server";

import { revalidatePath } from "next/cache";
import type { DialogState } from "@/components/ui/ActionDialog";
import {
  recordPlatformAction,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import { KIOSK_SETTINGS, isKioskSettingKey } from "@/lib/kiosk-settings";
import { setKioskDefault } from "@/lib/kiosk-settings-store";

/**
 * SÄTTER STANDARDEN FÖR EN SKÄRMINSTÄLLNING.
 *
 * Gäller varje såld skärm hos varje kund utan eget värde, inom fem sekunder.
 * Tomt fält tar bort raden, och Tikkrs inbyggda värde gäller igen.
 */
export async function saveKioskDefault(
  _previous: DialogState,
  formData: FormData
): Promise<DialogState> {
  const { email } = await requirePlatformAdmin();

  const key = String(formData.get("key") ?? "");
  if (!isKioskSettingKey(key)) return { error: "Okänd inställning." };

  const raw = String(formData.get("value") ?? "").trim();
  const result = await setKioskDefault({
    key,
    raw: raw === "" ? null : raw,
    byEmail: email,
  });

  if ("error" in result) return { error: result.error };

  const definition = KIOSK_SETTINGS[key];
  const shown =
    result.value === null ? "Tikkrs standard" : definition.describe(result.value);

  await recordPlatformAction({
    actorEmail: email,
    action: "Ändrade skärminställning för alla",
    detail: `${definition.label}: ${shown}`,
  });

  revalidatePath("/plattform/skarmar");

  return { ok: `${definition.label}: ${shown}.` };
}
