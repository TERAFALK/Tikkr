"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import { readWeeklyHours } from "@/lib/weekly-hours";
import {
  deleteStation,
  moveBlock,
  moveStation,
  noteBlock,
  placeBlock,
  removeBlock,
  resizeBlock,
  saveStation,
  setStationActive,
} from "@/lib/planning";

/**
 * PLANERINGENS SERVERÅTGÄRDER.
 *
 * Varje åtgärd börjar med samma tre rader: sessionen, skrivspärren och
 * modulgrinden. De kontrolleras av två olika tester — support-coverage räknar
 * att skrivspärren finns lika många gånger som sessionen hämtas,
 * module-coverage att grinden står i samma funktion som sessionen.
 *
 * RADERNA STÅR INTE UTSKRIVNA HÄR, med flit. Testerna räknar förekomster i
 * hela filen, och ett exempel i en kommentar räknas med — en kommentar som
 * råkar vara obalanserad skulle då fälla ett test som inte har något fel att
 * rapportera.
 *
 * Ordningen är inte slumpmässig. Skrivspärren ligger före modulgrinden så att
 * ett supportbesök får sitt läsläges-besked i stället för en 404, och ett 404
 * på en sida som syns i menyn ser ut som ett fel i systemet.
 *
 * ALL RÄKNING OCH ALLA VILLKOR LIGGER I lib/planning.ts. Den här filen läser
 * formulär och vänder svaren till något gränssnittet kan visa. Att dela upp det
 * så är inte prydnad: villkoren vaktas på ett ställe, och en ny väg in — ett
 * annat formulär, en rutt — kan inte råka utelämna dem.
 */

const PATH = "/admin/planering";

function revalidatePlanning() {
  revalidatePath(PATH);
  revalidatePath("/admin/planering/stationer");
}

/* -------------------------------------------------------------------------- */
/* Rutorna på tavlan                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Svaret tavlan får efter en dragning.
 *
 * `ok` och inte `savedAt`: tavlan skickar sina ändringar själv och behöver
 * veta om den ska behålla sin optimistiska bild eller lägga tillbaka rutan.
 */
export interface BlockState {
  error?: string;
  ok?: string;
  /** Rutans id, så att en nyss skapad ruta kan ersätta sin tillfälliga. */
  id?: string;
}

/** Läser ett tal ur ett formulär. Ger null på något som inte är ett tal. */
function readNumber(formData: FormData, field: string): number | null {
  const value = Number(String(formData.get(field) ?? "").trim());
  return Number.isFinite(value) ? value : null;
}

/**
 * Läser en tidpunkt ur ett formulär.
 *
 * Tavlan skickar ISO med tidszon, eftersom webbläsaren räknar ut tidpunkten ur
 * ett x-läge och en dag. Servern behöver därför inte tolka ett väggklockslag —
 * och ska inte göra det, eftersom den annars hade gissat tidszonen.
 */
function readInstant(formData: FormData, field: string): Date | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return null;

  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

export async function placeBlockAction(
  _previous: BlockState,
  formData: FormData
): Promise<BlockState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const orderId = String(formData.get("orderId") ?? "");
  const momentId = String(formData.get("momentId") ?? "");
  const stationId = String(formData.get("stationId") ?? "");
  const startsAt = readInstant(formData, "startsAt");
  const minutes = readNumber(formData, "minutes");

  if (!orderId || !momentId || !stationId || !startsAt || minutes === null) {
    return { error: "Något saknades i placeringen. Försök igen." };
  }

  const timeZone = await companyTimeZone(session.companyId);

  const result = await placeBlock(session.db, session.companyId, timeZone, {
    orderId,
    momentId,
    stationId,
    startsAt,
    minutes,
    note: String(formData.get("note") ?? ""),
    byEmail: session.email,
  });

  if (result.error) return { error: result.error };

  revalidatePlanning();
  return { ok: "Jobbet är planerat.", id: result.id };
}

export async function moveBlockAction(
  _previous: BlockState,
  formData: FormData
): Promise<BlockState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const blockId = String(formData.get("blockId") ?? "");
  const stationId = String(formData.get("stationId") ?? "");
  const startsAt = readInstant(formData, "startsAt");

  if (!blockId || !stationId || !startsAt) {
    return { error: "Något saknades i flytten. Försök igen." };
  }

  const timeZone = await companyTimeZone(session.companyId);
  const result = await moveBlock(session.db, timeZone, blockId, stationId, startsAt);

  if (result.error) return { error: result.error };

  revalidatePlanning();
  return { ok: "Jobbet är flyttat." };
}

export async function resizeBlockAction(
  _previous: BlockState,
  formData: FormData
): Promise<BlockState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const blockId = String(formData.get("blockId") ?? "");
  const minutes = readNumber(formData, "minutes");

  if (!blockId || minutes === null) {
    return { error: "Något saknades i ändringen. Försök igen." };
  }

  const timeZone = await companyTimeZone(session.companyId);
  const result = await resizeBlock(session.db, timeZone, blockId, minutes);

  if (result.error) return { error: result.error };

  revalidatePlanning();
  return { ok: "Tiden är ändrad." };
}

export async function noteBlockAction(
  _previous: BlockState,
  formData: FormData
): Promise<BlockState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const blockId = String(formData.get("blockId") ?? "");
  if (!blockId) return { error: "Rutan kunde inte hittas." };

  const result = await noteBlock(
    session.db,
    blockId,
    String(formData.get("note") ?? "")
  );

  if (result.error) return { error: result.error };

  revalidatePlanning();
  return { ok: "Anteckningen är sparad." };
}

export async function removeBlockAction(
  _previous: BlockState,
  formData: FormData
): Promise<BlockState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const blockId = String(formData.get("blockId") ?? "");
  if (!blockId) return { error: "Rutan kunde inte hittas." };

  const result = await removeBlock(session.db, blockId);
  if (result.error) return { error: result.error };

  revalidatePlanning();
  return { ok: "Jobbet är borttaget från tavlan." };
}

/* -------------------------------------------------------------------------- */
/* Stationsregistret                                                           */
/* -------------------------------------------------------------------------- */

/** Svaret stationsrutan får. `ok` stänger rutan, se ActionDialog. */
export interface StationState {
  error?: string;
  ok?: string;
}

export async function saveStationAction(
  _previous: StationState,
  formData: FormData
): Promise<StationState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const read = readWeeklyHours(formData);
  if ("error" in read) return { error: read.error };

  const stationId = String(formData.get("stationId") ?? "").trim();

  const result = await saveStation(session.db, session.companyId, {
    stationId: stationId || null,
    name: String(formData.get("name") ?? ""),
    momentId: String(formData.get("momentId") ?? ""),
    days: read.days,
  });

  if (result.error) return { error: result.error };

  revalidatePlanning();
  return { ok: stationId ? "Stationen är sparad." : "Stationen är upplagd." };
}

export async function toggleStationAction(
  _previous: StationState,
  formData: FormData
): Promise<StationState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const stationId = String(formData.get("stationId") ?? "");
  if (!stationId) return { error: "Stationen kunde inte hittas." };

  // Fältet bär NUVARANDE läge, som i Arbetsmoment. Skickar man det önskade
  // läget i stället blir två tryck i snabb följd två likadana skrivningar.
  const active = formData.get("active") !== "true";

  const timeZone = await companyTimeZone(session.companyId);
  const result = await setStationActive(session.db, timeZone, stationId, active);

  if (result.error) return { error: result.error };

  revalidatePlanning();
  return { ok: active ? "Stationen är öppen." : "Stationen är stängd." };
}

/**
 * Raderar en station.
 *
 * Egen åtgärd och inte ett läge på toggleStationAction, eftersom de två
 * betyder olika saker: stänga är "inte just nu", radera är "den här skulle
 * aldrig ha funnits". En knapp som gör det ena eller det andra beroende på ett
 * dolt fält är en knapp man trycker fel på.
 *
 * Rutorna följer med, och deras tid dyker upp i Oplacerat igen. Svaret säger
 * hur många det blev, så att den som tryckte får veta vad som hände i stället
 * för att upptäcka det på tavlan.
 */
export async function deleteStationAction(
  _previous: StationState,
  formData: FormData
): Promise<StationState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const stationId = String(formData.get("stationId") ?? "");
  if (!stationId) return { error: "Stationen kunde inte hittas." };

  const result = await deleteStation(session.db, stationId);
  if (result.error) return { error: result.error };

  revalidatePlanning();

  const removed = result.removedBlocks ?? 0;

  return {
    ok:
      removed === 0
        ? "Stationen är borttagen."
        : removed === 1
          ? "Stationen är borttagen. Ett planerat jobb gick tillbaka till Oplacerat."
          : `Stationen är borttagen. ${removed} planerade jobb gick tillbaka till Oplacerat.`,
  };
}

export async function moveStationAction(
  _previous: StationState,
  formData: FormData
): Promise<StationState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PLANNING");

  const stationId = String(formData.get("stationId") ?? "");
  const direction = formData.get("direction") === "up" ? "up" : "down";

  if (!stationId) return { error: "Stationen kunde inte hittas." };

  const result = await moveStation(session.db, stationId, direction);
  if (result.error) return { error: result.error };

  revalidatePlanning();
  return { ok: "Ordningen är ändrad." };
}
