"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { createDefaultAbsenceReasons } from "@/lib/absence";
import { saved, type SaveState } from "@/lib/save-state";

/**
 * FRÅNVAROORSAKERNA, SOM KUNDEN LÄGGER UPP SJÄLV.
 *
 * Var en enum i koden tills 2026-10-01. En kund som behövde "arbetsskada"
 * fick vänta på en driftsättning, vilket är fel sorts beroende: orsakerna hör
 * till deras verksamhet och ändras med deras kollektivavtal, inte med vår
 * kod.
 *
 * Hör till löneunderlaget och är därför grindat. Frånvaro finns bara i
 * tidrapporten, som är modulens egen sida.
 */

const PATH = "/admin/installningar/franvaro";

/**
 * Svaret från rutan som lägger till en orsak.
 *
 * `ok` och inte `savedAt`, eftersom ActionDialog stänger sig på just det
 * fältet. Se src/components/ui/ActionDialog.tsx.
 */
export interface ReasonState {
  error?: string;
  ok?: string;
}

export async function addAbsenceReason(
  _previous: ReasonState,
  formData: FormData
): Promise<ReasonState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId } = session;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ange ett namn." };

  // Sist i listan. Ordningen ändras med pilarna, och en ny orsak ska inte
  // hamna överst bara för att den är ny.
  const count = await db.absenceReason.count();

  try {
    await db.absenceReason.create({
      data: {
        companyId,
        name,
        sortOrder: count,
        countsAsComp: formData.get("countsAsComp") === "on",
      },
    });
  } catch (error) {
    // P2002: namnet är unikt per företag.
    if ((error as { code?: string } | null)?.code === "P2002") {
      return { error: "Det finns redan en orsak med det namnet." };
    }
    throw error;
  }

  revalidatePath(PATH);
  revalidatePath("/admin/tidrapport");
  return { ok: "Orsaken är tillagd." };
}

/**
 * Byter namn på en orsak.
 *
 * Namnet, och ingenting annat. Kryssrutan som drar på komptidssaldot sätts när
 * orsaken läggs upp och ändras inte i efterhand: den styr en RÄKNING, och
 * frånvaro som redan registrerats har skrivit sina komprader utifrån det läge
 * som gällde då. Att vända den i efterhand hade gjort gamla poster
 * oförklarliga utan att röra en siffra på skärmen. Är den fel läggs orsaken
 * upp på nytt och den gamla avaktiveras.
 *
 * Omdöpningen når varje post som redan ligger på orsaken, eftersom frånvaron
 * pekar på raden och inte bär en kopia av namnet. Det är meningen: ett stavfel
 * ska gå att rätta en gång, inte post för post.
 */
export async function renameAbsenceReason(
  _previous: ReasonState,
  formData: FormData
): Promise<ReasonState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!id) return { error: "Ingen orsak vald." };
  if (!name) return { error: "Ange ett namn." };

  try {
    // updateMany och inte update: `where` får då företagsfiltret med sig, och
    // ett id från ett annat företag träffar ingenting. Samma skäl som i
    // toggleAbsenceReason nedan.
    const { count } = await db.absenceReason.updateMany({
      where: { id },
      data: { name },
    });

    if (count === 0) return { error: "Orsaken finns inte längre." };
  } catch (error) {
    // P2002: namnet är unikt per företag.
    if ((error as { code?: string } | null)?.code === "P2002") {
      return { error: "Det finns redan en orsak med det namnet." };
    }
    throw error;
  }

  revalidatePath(PATH);
  revalidatePath("/admin/tidrapport");
  return { ok: "Namnet är ändrat." };
}

/**
 * Avaktiverar eller återaktiverar en orsak.
 *
 * Raderar aldrig. En orsak med registrerad frånvaro hör till poster som ska
 * gå att läsa om ett år, och databasen vägrar dessutom (onDelete: Restrict).
 * Avaktiverad betyder "går inte att välja längre", inget mer.
 */
export async function toggleAbsenceReason(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;

  await db.absenceReason.updateMany({
    where: { id },
    data: { active: !active },
  });

  revalidatePath(PATH);
  revalidatePath("/admin/tidrapport");
}

/**
 * Flyttar en orsak uppåt eller nedåt i listan.
 *
 * Ordningen är den i rullgardinen när frånvaro registreras, och den vanligaste
 * orsaken ska stå först. Byter plats med grannen i stället för att skriva om
 * hela listan: två rader rörs, och två rader går att följa i efterhand.
 */
export async function moveAbsenceReason(formData: FormData) {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db } = session;

  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;
  if (!id) return;

  const all = await db.absenceReason.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });

  const index = all.findIndex((reason) => reason.id === id);
  const target = index + direction;

  // Redan först eller sist. Knappen är då släckt i gränssnittet, men ett
  // anrop ska ändå inte kunna skriva utanför listan.
  if (index === -1 || target < 0 || target >= all.length) return;

  // Hela listan skrivs om med sin nya ordning. Listan är kort, och en
  // omskrivning kan inte lämna två rader med samma nummer.
  const reordered = [...all];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved);

  await db.$transaction(
    reordered.map((reason, order) =>
      db.absenceReason.updateMany({
        where: { id: reason.id },
        data: { sortOrder: order },
      })
    )
  );

  revalidatePath(PATH);
  revalidatePath("/admin/tidrapport");
}

/**
 * Lägger upp standardorsakerna.
 *
 * Finns för den kund som börjat utan dem, och för den som råkat avaktivera
 * allt. Skriver ingenting om det redan finns orsaker — listan är kundens, och
 * en återställning som dyker upp av sig själv vore en överraskning.
 */
export async function addDefaultAbsenceReasons(
  _previous: SaveState,
  _formData: FormData
): Promise<SaveState> {
  const session = await requireAdmin();
  await assertWritable(session);
  await requireModule(session, "PAYROLL");
  const { db, companyId } = session;

  const created = await createDefaultAbsenceReasons(db, companyId);

  if (created === 0) {
    return { error: "Det finns redan orsaker upplagda." };
  }

  revalidatePath(PATH);
  revalidatePath("/admin/tidrapport");
  return saved(`${created} orsaker upplagda.`);
}
