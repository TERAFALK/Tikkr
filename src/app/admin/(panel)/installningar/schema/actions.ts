"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { parseMinuteOfDay } from "@/lib/schedule";

/**
 * Arbetstidsschemat.
 *
 * Hela veckan sparas i ett svep. Alternativet — en knapp per dag — skulle
 * göra det möjligt att lämna halva veckan osparad utan att det syns, och ett
 * halvt schema ger en planerad tid som ser rimlig ut men är fel.
 */

const PATH = "/admin/installningar/schema";

export interface ScheduleFormState {
  error?: string;
  savedAt?: number;
}

/** Rasterna på en dag, som de kommer från formuläret. */
function readBreaks(
  formData: FormData,
  weekday: number
): { startMinute: number; endMinute: number }[] {
  const starts = formData.getAll(`break-start-${weekday}`);
  const ends = formData.getAll(`break-end-${weekday}`);

  const breaks: { startMinute: number; endMinute: number }[] = [];

  for (const [index, rawStart] of starts.entries()) {
    const start = parseMinuteOfDay(String(rawStart ?? ""));
    const end = parseMinuteOfDay(String(ends[index] ?? ""));

    // Halvfyllda rader hoppas över. Den som tryckt på plus och ångrat sig har
    // lämnat en tom rad, inte begått ett fel.
    if (start === null || end === null) continue;
    if (end <= start) continue;

    breaks.push({ startMinute: start, endMinute: end });
  }

  return breaks;
}

export async function saveSchedule(
  _previous: ScheduleFormState,
  formData: FormData
): Promise<ScheduleFormState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId } = session;

  const days: {
    weekday: number;
    startMinute: number;
    endMinute: number;
    breaks: { startMinute: number; endMinute: number }[];
  }[] = [];

  for (let weekday = 1; weekday <= 7; weekday++) {
    // Dagen är arbetsfri när rutan inte är i. Raden skrivs då inte alls, och
    // planerad tid blir noll.
    if (formData.get(`active-${weekday}`) !== "on") continue;

    const start = parseMinuteOfDay(String(formData.get(`start-${weekday}`) ?? ""));
    const end = parseMinuteOfDay(String(formData.get(`end-${weekday}`) ?? ""));

    if (start === null || end === null) {
      return {
        error:
          "Skriv tiderna som klockslag, till exempel 06:30. Bocka ur dagen " +
          "om den är arbetsfri.",
      };
    }

    if (end <= start) {
      return { error: "Sluttiden måste ligga efter starttiden." };
    }

    const breaks = readBreaks(formData, weekday);

    const breakMinutes = breaks.reduce(
      (total, rest) => total + (rest.endMinute - rest.startMinute),
      0
    );

    if (breakMinutes >= end - start) {
      return {
        error:
          "Rasterna är längre än arbetsdagen. Kontrollera klockslagen på " +
          dayName(weekday) + ".",
      };
    }

    days.push({ weekday, startMinute: start, endMinute: end, breaks });
  }

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

function dayName(weekday: number): string {
  return [
    "måndag",
    "tisdag",
    "onsdag",
    "torsdag",
    "fredag",
    "lördag",
    "söndag",
  ][weekday - 1];
}

/* --- Rasttyper ----------------------------------------------------------- */

export async function createBreakType(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
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
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.breakType.updateMany({ where: { id }, data: { active: !active } });

  revalidatePath(PATH);
}
