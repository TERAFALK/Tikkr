"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { companyTimeZone } from "@/lib/company";
import {
  ClockError,
  createManualEntry,
  updateEntryManually,
} from "@/lib/clock";
import { parseLocalDateTime } from "@/lib/time-zone";

const PATH = "/admin/stamplingar";

export interface EntryFormState {
  error?: string;
  ok?: string;
}

function readForm(formData: FormData, timeZone: string) {
  const clockInAt = parseLocalDateTime(
    String(formData.get("clockInAt") ?? ""),
    timeZone
  );
  const clockOutAt = parseLocalDateTime(
    String(formData.get("clockOutAt") ?? ""),
    timeZone
  );

  return {
    employeeId: String(formData.get("employeeId") ?? ""),
    orderId: String(formData.get("orderId") ?? ""),
    momentId: String(formData.get("momentId") ?? ""),
    indirectMomentId: String(formData.get("indirectMomentId") ?? ""),
    kind: formData.get("kind") === "INDIRECT" ? "INDIRECT" : "ORDER",
    clockInAt,
    clockOutAt,
  };
}

export async function addEntry(
  _previous: EntryFormState,
  formData: FormData
): Promise<EntryFormState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { companyId, email } = session;
  const timeZone = await companyTimeZone(companyId);
  const input = readForm(formData, timeZone);

  if (!input.employeeId || !input.orderId || !input.momentId) {
    return { error: "Välj anställd, order och arbetsmoment." };
  }
  if (!input.clockInAt || !input.clockOutAt) {
    return { error: "Fyll i både start- och sluttid." };
  }

  try {
    await createManualEntry(companyId, {
      // Adminpanelen lägger bara in ORDERTID för hand. Improduktiv tid som
      // glömts stämplas hellre in på skärmen än skrivs in i efterhand — den
      // ska ändå inte faktureras, och en inskriven städtimme är ingen som
      // saknar den.
      kind: "ORDER",
      employeeId: input.employeeId,
      orderId: input.orderId,
      momentId: input.momentId,
      clockInAt: input.clockInAt,
      clockOutAt: input.clockOutAt,
      byEmail: email,
    });
  } catch (error) {
    // ClockError bär ett meddelande skrivet för att läsas av en människa.
    if (error instanceof ClockError) return { error: error.message };
    throw error;
  }

  revalidatePath(PATH);
  revalidatePath("/admin");
  return { ok: "Stämplingen är inlagd." };
}

/**
 * Svaret från ändra-rutan.
 *
 * `ok` i stället för `savedAt`, eftersom ActionDialog stänger sig på just det
 * fältet. Se src/components/ui/ActionDialog.tsx.
 */
export interface EditEntryState {
  error?: string;
  ok?: string;
}

/**
 * Ändrar en stämpling.
 *
 * SVARAR MED FEL, och det är nytt. Åtgärden gav tidigare ingenting tillbaka:
 * en sluttid före starttiden, en överlappande post eller en stängd order
 * ledde till att rutan stängdes och ingenting hände. Den som skrivit fel såg
 * en oförändrad lista och ingen förklaring.
 */
export async function editEntry(
  _previous: EditEntryState,
  formData: FormData
): Promise<EditEntryState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { companyId, email } = session;
  const timeZone = await companyTimeZone(companyId);

  const id = String(formData.get("id") ?? "");
  const input = readForm(formData, timeZone);

  if (!id) return { error: "Okänd post." };

  if (!input.clockInAt || !input.clockOutAt) {
    return { error: "Fyll i både start- och sluttid." };
  }

  if (input.clockOutAt <= input.clockInAt) {
    return { error: "Sluttiden måste ligga efter starttiden." };
  }

  // Posten behåller sin sort. Formuläret visar bara fälten som hör till den,
  // och ändringen får aldrig flytta en post mellan ordertid och improduktiv
  // tid — det hade ändrat vad som hamnar på ett fakturaunderlag.
  const job =
    input.kind === "INDIRECT"
      ? ({
          kind: "INDIRECT",
          indirectMomentId: input.indirectMomentId,
        } as const)
      : ({
          kind: "ORDER",
          orderId: input.orderId,
          momentId: input.momentId,
        } as const);

  const complete =
    job.kind === "INDIRECT"
      ? Boolean(job.indirectMomentId)
      : Boolean(job.orderId && job.momentId);

  if (!complete) {
    return {
      error:
        job.kind === "INDIRECT"
          ? "Välj ett improduktivt moment."
          : "Välj både order och arbetsmoment.",
    };
  }

  try {
    await updateEntryManually(companyId, id, {
      ...job,
      employeeId: input.employeeId,
      clockInAt: input.clockInAt,
      clockOutAt: input.clockOutAt,
      byEmail: email,
    });
  } catch (error) {
    // ClockError bär ett meddelande skrivet för att läsas av en människa:
    // överlappande tider, stängd order, avaktiverat moment.
    if (error instanceof ClockError) return { error: error.message };
    throw error;
  }

  revalidatePath(PATH);
  revalidatePath("/admin");
  return { ok: "Stämplingen är ändrad." };
}

/*
 * DET FINNS INGEN RADERING HÄR (borttagen 2026-09-29).
 *
 * Den fanns för felregistreringar, och gränssnittet frågade innan. Kunden bad
 * ändå att knappen skulle bort, och skälet håller: en felaktig stämpling
 * rättas genom att skrivas om, inte genom att försvinna. Tiden är både
 * fakturaunderlag och löneunderlag, en ändrad post bär spår av vem som ändrade
 * den, och en raderad post lämnar bara ett hål ingen kan förklara i efterhand.
 *
 * Ska en persons tid bort helt finns GDPR-raderingen i inställningarna, som är
 * avsiktligt svårare att nå och som tar med allt som hör personen till.
 */
