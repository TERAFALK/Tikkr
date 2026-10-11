"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { FeedbackError, sendFeedback } from "@/lib/feedback";
import { saved, type SaveState } from "@/lib/save-state";

/**
 * Skickar ett meddelande till supporten.
 *
 * Företaget och avsändaren tas ur sessionen. Formuläret bär bara det kunden
 * själv skrivit och valt, och sidan hen kom ifrån. Supportläget kan inte
 * skicka: ett meddelande från oss till oss, i kundens namn, vore just den
 * sortens lånade identitet supportläget är byggt för att undvika.
 */
export async function sendFeedbackAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);

  const me = await session.db.adminUser.findFirst({
    where: { id: session.userId },
    select: { name: true },
  });

  try {
    await sendFeedback(
      {
        db: session.db,
        companyId: session.companyId,
        userId: session.userId,
        email: session.email,
        name: me?.name ?? null,
      },
      {
        kind: String(formData.get("kind") ?? ""),
        area: String(formData.get("area") ?? ""),
        page: String(formData.get("page") ?? "") || null,
        body: String(formData.get("body") ?? ""),
      }
    );
  } catch (error) {
    if (error instanceof FeedbackError) return { error: error.message };
    throw error;
  }

  revalidatePath("/admin/support");
  return saved("Meddelandet är skickat");
}
