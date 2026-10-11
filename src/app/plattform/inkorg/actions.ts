"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  FeedbackError,
  isFeedbackStatus,
  replyToFeedback,
  setFeedbackStatus,
} from "@/lib/feedback";
import { saved, type SaveState } from "@/lib/save-state";

const PATH = "/plattform/inkorg";

/** Svarar kunden. Svaret syns under meddelandet på kundens sida Support. */
export async function replyAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const { email } = await requirePlatformAdmin();

  try {
    await replyToFeedback({
      id: String(formData.get("id") ?? ""),
      body: String(formData.get("body") ?? ""),
      byEmail: email,
    });
  } catch (error) {
    if (error instanceof FeedbackError) return { error: error.message };
    throw error;
  }

  revalidatePath(PATH);
  return saved("Svaret är skickat");
}

export async function setStatusAction(formData: FormData) {
  const { email } = await requirePlatformAdmin();

  const status = String(formData.get("status") ?? "");
  if (!isFeedbackStatus(status)) return;

  await setFeedbackStatus({
    id: String(formData.get("id") ?? ""),
    status,
    byEmail: email,
  });

  revalidatePath(PATH);
}
