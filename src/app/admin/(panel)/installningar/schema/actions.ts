"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { readScheduleDays } from "@/lib/schedule";

/**
 * Arbetstidsschemat.
 *
 * Hela veckan sparas i ett svep. Alternativet — en knapp per dag — skulle
 * göra det möjligt att lämna halva veckan osparad utan att det syns, och ett
 * halvt schema ger en planerad tid som ser rimlig ut men är fel.
 *
 * Fälten läses av `readScheduleDays` i lib/schedule.ts, som också läser rutan
 * med egna tider under Anställda. Samma formulärfält på två ställen ska tolkas
 * av samma kod.
 */

const PATH = "/admin/installningar/schema";

export interface ScheduleFormState {
  error?: string;
  savedAt?: number;
}

export async function saveSchedule(
  _previous: ScheduleFormState,
  formData: FormData
): Promise<ScheduleFormState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId } = session;

  const read = readScheduleDays(formData);
  if ("error" in read) return read;
  const days = read.days;

  const existing = await db.workSchedule.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });

  // Dagarna skrivs om från grunden i stället för att jämföras rad för rad.
  // Ett schema är litet, och en omskrivning kan inte lämna kvar en dag som
  // tagits bort i gränssnittet.
  await db.$transaction(async (tx) => {
    const scheduleId =
      existing?.id ??
      (
        await tx.workSchedule.create({
          data: { companyId, name: "Normalarbetstid", isDefault: true },
        })
      ).id;

    await tx.scheduleDay.deleteMany({ where: { scheduleId } });

    for (const day of days) {
      await tx.scheduleDay.create({
        data: {
          companyId,
          scheduleId,
          weekday: day.weekday,
          startMinute: day.startMinute,
          endMinute: day.endMinute,
          breaks: {
            create: day.breaks.map((rest) => ({
              companyId,
              startMinute: rest.startMinute,
              endMinute: rest.endMinute,
            })),
          },
        },
      });
    }
  });

  revalidatePath(PATH);
  revalidatePath("/admin/tidrapport");
  return { savedAt: Date.now() };
}

/* --- Rasttyper ----------------------------------------------------------- */

export async function createBreakType(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId } = session;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const count = await db.breakType.count();

  await db.breakType.create({
    data: { companyId, name, sortOrder: count },
  });

  revalidatePath(PATH);
}

export async function toggleBreakType(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.breakType.updateMany({ where: { id }, data: { active: !active } });

  revalidatePath(PATH);
}
