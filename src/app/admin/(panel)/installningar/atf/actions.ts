"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { unsafeGlobalPrisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { findAgreement } from "@/lib/collective-agreements";
import { saved, type SaveState } from "@/lib/save-state";

/**
 * Väljer kollektivavtalet som ATF-underlaget räknas efter, eller inget.
 *
 * Värdet prövas mot registret. En nyckel som inte finns där hade gett ett
 * företag som tror att det har ATF, och ett underlag som tyst saknas.
 *
 * Loggas: valet avgör en rad i löneunderlaget för varje anställd.
 */
export async function saveAtfAgreement(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { companyId } = session;

  const raw = String(formData.get("atfAgreement") ?? "").trim();
  const agreement = raw ? findAgreement(raw) : null;

  if (raw && !agreement) return { error: "Välj ett avtal i listan." };

  const atfAgreement = agreement?.key ?? null;

  const before = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { atfAgreement: true },
  });

  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: { atfAgreement },
  });

  if (before && before.atfAgreement !== atfAgreement) {
    await recordAudit(session.db, {
      companyId,
      actorEmail: session.email,
      entity: "Company",
      entityId: companyId,
      action: "update",
      before,
      after: { atfAgreement },
    });
  }

  revalidatePath("/admin/installningar/atf");
  revalidatePath("/admin/tidrapport");
  revalidatePath("/admin/anstallda");

  return saved();
}
