"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { companyTimeZone } from "@/lib/company";
import {
  ClockError,
  createManualEntry,
  deleteEntryManually,
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

  // ORDERTID ELLER IMPRODUKTIV TID (ändrat 2026-10-13, kundens begäran).
  // Rutan lade bara in ordertid, med skälet att glömd improduktiv tid hellre
  // stämplas på skärmen. Med löneunderlaget ÄR den saknade städtimmen någons
  // arbetstid, och utan den här vägen fick den bokas på en order — precis det
  // som gör den ordern dyrare än den var. Se avgränsningen i CLAUDE.md § 1.
  const job =
    input.kind === "INDIRECT"
      ? ({ kind: "INDIRECT", indirectMomentId: input.indirectMomentId } as const)
      : ({ kind: "ORDER", orderId: input.orderId, momentId: input.momentId } as const);

  if (!input.employeeId) return { error: "Välj en anställd." };

  if (job.kind === "INDIRECT" ? !job.indirectMomentId : !job.orderId || !job.momentId) {
    return {
      error:
        job.kind === "INDIRECT"
          ? "Välj ett improduktivt moment."
          : "Välj både order och arbetsmoment.",
    };
  }
  if (!input.clockInAt || !input.clockOutAt) {
    return { error: "Fyll i både start- och sluttid." };
  }

  try {
    await createManualEntry(companyId, {
      ...job,
      employeeId: input.employeeId,
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

/**
 * Tar bort en avslutad stämpling (tillagt igen 2026-10-13, kundens begäran).
 *
 * Togs bort 2026-09-29, eftersom en raderad post lämnade ett hål ingen kunde
 * förklara. Sedan dess skriver ändringsloggen hela posten som den såg ut och
 * vem som tog bort den, se deleteEntryManually.
 *
 * Felet visas inte i en ruta: knappen frågar innan, och det enda som kan gå
 * fel är att posten redan är borta eller fortfarande pågår, vilket listan
 * visar så fort sidan laddas om.
 */
export async function deleteEntry(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  try {
    await deleteEntryManually(session.companyId, id, session.email);
  } catch (error) {
    if (!(error instanceof ClockError)) throw error;
  }

  revalidatePath(PATH);
  revalidatePath("/admin");
}
