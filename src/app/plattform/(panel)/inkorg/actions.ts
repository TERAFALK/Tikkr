"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { FeedbackError, markFeedbackDone } from "@/lib/feedback";

export interface DoneFormState {
  error?: string;
  ok?: string;
}

/** Klarmarkerar ett meddelande med en anteckning och flyttar det till arkivet. */
export async function markDoneAction(
  _previous: DoneFormState,
  formData: FormData
): Promise<DoneFormState> {
  const { email } = await requirePlatformAdmin();

  try {
    await markFeedbackDone({
      id: String(formData.get("id") ?? ""),
      note: String(formData.get("note") ?? ""),
      byEmail: email,
    });
  } catch (error) {
    if (error instanceof FeedbackError) return { error: error.message };
    throw error;
  }

  revalidatePath("/plattform/inkorg");
  return { ok: "Klarmarkerad" };
}
