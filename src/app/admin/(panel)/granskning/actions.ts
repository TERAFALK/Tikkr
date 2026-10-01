"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { instantFromWallTime } from "@/lib/time-zone";

const PATH = "/admin/granskning";

/**
 * GRANSKAR EN POST SYSTEMET RÄKNAT FRAM SLUTTIDEN PÅ.
 *
 * EN knapp, två utfall. Servern jämför tiden i fältet med den som står på
 * posten och avgör vilket det blev:
 *
 *   Orörd tid  → posten godkänns. `source` förblir AUTO_CLOSE, alltså räknad
 *                av systemet och nu bekräftad av en människa.
 *   Ändrad tid → posten rättas och märks ADMIN_MANUAL, alltså inskriven av
 *                någon.
 *
 * Skillnaden mellan de två syns i rapporterna och spelar roll den dag någon
 * ifrågasätter en faktura: en tid en människa skrivit in ska aldrig gå att
 * förväxla med en riktig stämpling.
 *
 * Tidigare låg utfallen på varsin knapp, vilket lade ett val på användaren som
 * servern kan göra själv — och som var lätt att göra fel, eftersom knapparna
 * såg ut att göra samma sak. Den som granskar ska svara på en fråga: när
 * slutade arbetet?
 */
export interface ReviewState {
  error?: string;
  /** Sattes senast en post godkändes. Rensar felet i rutan. */
  savedAt?: number;
}

export async function reviewEntry(
  _previous: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId, email } = session;

  const id = String(formData.get("id") ?? "");
  const value = String(formData.get("clockOutAt") ?? "");
  if (!id) return { error: "Okänd post." };
  if (!value) return { error: "Ange en sluttid." };

  // Fältet ger klockslag som det står på väggen, utan tidszon. Det måste
  // tolkas i företagets tidszon — annars hamnar en rättning gjord i juli en
  // timme fel mot en gjord i januari.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { error: "Sluttiden går inte att läsa." };

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  if (!company) return { error: "Företaget kunde inte läsas." };

  const clockOutAt = instantFromWallTime(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
    },
    company.timezone
  );

  const entry = await db.timeEntry.findFirst({ where: { id } });
  if (!entry) return { error: "Posten finns inte kvar." };

  // EN SLUTTID FÖRE STARTTIDEN ÄR EN NEGATIV ARBETSDAG.
  //
  // Returnerade tyst tidigare. Posten stod då kvar i listan, utan att något
  // hänt och utan att något sades — den som skrivit 07:00 i stället för
  // 17:00 trodde att knappen var trasig.
  if (clockOutAt <= entry.clockInAt) {
    return {
      error: "Sluttiden måste ligga efter starttiden.",
    };
  }

  // Jämförs på MINUTEN, eftersom fältet inte har sekunder. Utan avrundningen
  // hade varje godkännande räknats som en ändring, och då vore hela poängen
  // med att skilja på de två borta.
  const sameMinute =
    entry.clockOutAt !== null &&
    toMinute(entry.clockOutAt) === toMinute(clockOutAt);

  await db.timeEntry.update({
    where: { id },
    data: sameMinute
      ? {
          needsReview: false,
          reviewNote: `Granskad och godkänd av ${email}.`,
        }
      : {
          clockOutAt,
          source: "ADMIN_MANUAL",
          needsReview: false,
          reviewNote: `Rättad av ${email}.`,
        },
  });

  revalidatePath(PATH);
  revalidatePath("/admin");
  return { savedAt: Date.now() };
}

/** Tidpunkten avrundad till hel minut, som millisekunder. */
function toMinute(value: Date): number {
  return Math.floor(value.getTime() / 60_000);
}
