"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  archiveNotice,
  createNotice,
  NoticeError,
  type NoticeKind,
} from "@/lib/notices";
import {
  sendBroadcast,
  BroadcastError,
  type BroadcastAudience,
} from "@/lib/platform-broadcast";
import { unsafeGlobalPrisma } from "@/lib/db";

const PATH = "/plattform/meddelanden";

export interface NoticeFormState {
  error?: string;
  ok?: string;
}

/**
 * Tolkar ett datetime-local-fält.
 *
 * Fältet ger klockslag utan tidszon, tolkat som serverns. Det är rätt här:
 * den som planerar underhållet och servern som visar bannern befinner sig i
 * samma tidszon, till skillnad från stämplingarna där varje kund har sin egen.
 */
function parseMoment(value: FormDataEntryValue | null): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return new Date(text);
}

export async function addNotice(
  _previous: NoticeFormState,
  formData: FormData
): Promise<NoticeFormState> {
  const { email } = await requirePlatformAdmin();

  const startsAt = parseMoment(formData.get("startsAt")) ?? new Date();

  try {
    const notice = await createNotice({
      kind: String(formData.get("kind") ?? "MAINTENANCE") as NoticeKind,
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
      startsAt,
      endsAt: parseMoment(formData.get("endsAt")),
      showInAdmin: formData.get("showInAdmin") === "on",
      showOnKiosk: formData.get("showOnKiosk") === "on",
      showOnSite: formData.get("showOnSite") === "on",
      createdByEmail: email,
    });

    await unsafeGlobalPrisma.platformAuditLog.create({
      data: {
        actorEmail: email,
        action: "Skapade driftmeddelande",
        detail: `"${notice.title}" (${notice.kind})`,
      },
    });
  } catch (error) {
    if (error instanceof NoticeError) return { error: error.message };
    throw error;
  }

  revalidatePath(PATH);
  return { ok: "Meddelandet är inlagt." };
}

export async function removeNotice(formData: FormData) {
  const { email } = await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");

  await archiveNotice(id);

  await unsafeGlobalPrisma.platformAuditLog.create({
    data: {
      actorEmail: email,
      action: "Arkiverade driftmeddelande",
      detail: id,
    },
  });

  revalidatePath(PATH);
}

export interface BroadcastFormState {
  error?: string;
  ok?: string;
}

/**
 * Skickar utskicket.
 *
 * Kräver att antalet mottagare skrivs in för hand i ett bekräftelsefält. Ett
 * massutskick går inte att ta tillbaka, och en felskickad rad når varenda kund
 * samtidigt — den extra sekunden är billig i jämförelse.
 */
export async function broadcast(
  _previous: BroadcastFormState,
  formData: FormData
): Promise<BroadcastFormState> {
  const { email } = await requirePlatformAdmin();

  const audience = String(
    formData.get("audience") ?? "all"
  ) as BroadcastAudience;

  const expected = String(formData.get("expected") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();

  if (confirm !== expected) {
    return {
      error: `Skriv antalet mottagare (${expected}) i bekräftelsefältet för att skicka.`,
    };
  }

  try {
    const result = await sendBroadcast({
      audience,
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
      actorEmail: email,
    });

    revalidatePath(PATH);

    if (result.failed.length > 0) {
      return {
        error:
          `${result.delivered} av ${result.attempted} mejl gick fram. ` +
          `Misslyckades: ${result.failed.join(", ")}.`,
      };
    }

    return { ok: `Utskicket gick till ${result.delivered} mottagare.` };
  } catch (error) {
    if (error instanceof BroadcastError) return { error: error.message };
    throw error;
  }
}
