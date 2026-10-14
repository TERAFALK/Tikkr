"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { unsafeGlobalPrisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { isPlanningMode } from "@/lib/planning-modes";
import { saved, type SaveState } from "@/lib/save-state";

/**
 * Väljer planeringsläget, se src/lib/planning-modes.ts.
 *
 * Värdet prövas mot registret och inte bara mot enumen: ett formulär kan
 * skickas av annat än sidan, och ett läge koden inte känner hade gett en tavla
 * utan vyer.
 *
 * ATT BYTA LÄGE RÖR INGEN PLANERAD TID. Stationerna och deras rutor ligger
 * kvar och står där igen om läget byts tillbaka, samma hållning som att stänga
 * av ett tillval (CLAUDE.md § 3.1).
 *
 * Loggas: läget avgör vad tavlan visar för alla i arbetsytan.
 */
export async function savePlanningMode(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");
  const { companyId } = session;

  const planningMode = String(formData.get("planningMode") ?? "").trim();

  if (!isPlanningMode(planningMode)) return { error: "Välj ett läge." };

  const before = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { planningMode: true },
  });

  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: { planningMode },
  });

  if (before && before.planningMode !== planningMode) {
    await recordAudit(session.db, {
      companyId,
      actorEmail: session.email,
      entity: "Company",
      entityId: companyId,
      action: "update",
      before,
      after: { planningMode },
    });
  }

  revalidatePath("/admin/installningar/planering");
  revalidatePath("/admin/planering");

  return saved();
}
