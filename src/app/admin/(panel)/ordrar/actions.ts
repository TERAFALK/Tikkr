"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-session";
import { ClockError, closeOrder, openEntriesOnOrder } from "@/lib/clock";
import { parseMarkupPercent, parseOre } from "@/lib/money";

const PATH = "/admin/ordrar";

/**
 * Läser ett timfält och ger minuter.
 *
 * Administratören tänker i timmar, systemet räknar i minuter. Både punkt och
 * komma godtas som decimaltecken — ett svenskt tangentbord ger komma, och att
 * avvisa "7,5" hade varit att kräva att kunden skriver som datorn vill.
 *
 * Tomt fält betyder ingen beräknad tid, vilket är något annat än noll timmar.
 */
function parseHours(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!text) return null;

  const hours = Number(text);
  if (!Number.isFinite(hours) || hours <= 0) return null;

  return Math.round(hours * 60);
}

export async function createOrder(formData: FormData) {
  const { db, companyId } = await requireAdmin();

  const orderNumber = String(formData.get("orderNumber") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!orderNumber) return;

  await db.order.create({
    data: {
      companyId,
      orderNumber,
      customerName: customerName || null,
      budgetMinutes: parseHours(formData.get("budgetHours")),
    },
  });

  revalidatePath(PATH);
}

export interface OrderFormState {
  error?: string;
  /** Sattes senast sparandet gick igenom. Stänger rutan i gränssnittet. */
  savedAt?: number;
}

/**
 * Ändrar en orders uppgifter.
 *
 * Svarar med ett tillstånd i stället för att bara köra, eftersom påslaget kan
 * avvisas. Ett påslag som skrivits som "40" när man menade "1,4" ska inte
 * sparas tyst — felet syns först på en faktura, och då är det för sent.
 */
export async function updateOrder(
  _previous: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const { db } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const orderNumber = String(formData.get("orderNumber") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  if (!id) return { error: "Ingen order angiven." };
  if (!orderNumber) return { error: "Ange ett ordernummer." };

  // Tomt fält betyder "företagets standardpåslag gäller", vilket är det
  // normala. Bara ett ifyllt men obegripligt värde är ett fel.
  const rawMarkup = String(formData.get("markup") ?? "").trim();
  const markupPercent = rawMarkup === "" ? null : parseMarkupPercent(rawMarkup);

  if (rawMarkup !== "" && markupPercent === null) {
    return {
      error:
        "Skriv påslaget som en faktor mellan 1 och 10, till exempel 1,4 för " +
        "fyrtio procents påslag. Lämna tomt för företagets standard.",
    };
  }

  // Tomt betyder löpande räkning. Bara ett ifyllt men obegripligt belopp är
  // ett fel — ett fast pris som tyst blev noll vore värre än ett felmeddelande.
  const rawPrice = String(formData.get("fixedPrice") ?? "").trim();
  const fixedPriceOre = rawPrice === "" ? null : parseOre(rawPrice);

  if (rawPrice !== "" && fixedPriceOre === null) {
    return {
      error:
        "Skriv det fasta priset som ett belopp i kronor, till exempel 7350 " +
        "eller 7350,50. Lämna tomt för löpande räkning.",
    };
  }

  // updateMany och inte update: id:t kommer från formuläret och får aldrig
  // kunna peka på en annan kunds order.
  await db.order.updateMany({
    where: { id },
    data: {
      orderNumber,
      customerName: customerName || null,
      budgetMinutes: parseHours(formData.get("budgetHours")),
      markupPercent,
      fixedPriceOre,
    },
  });

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

export interface OrderToggleState {
  error?: string;
  /** Sattes senast sparandet gick igenom. Stänger rutorna i gränssnittet. */
  savedAt?: number;
  /**
   * De som står instämplade på ordern. Är den ifylld har INGENTING ändrats —
   * det är frågan tillbaka till administratören, inte ett kvitto.
   */
  blockers?: { employeeName: string; momentName: string; since: string }[];
}

/**
 * Öppnar eller stänger en order.
 *
 * Stängd order försvinner från stämplingsskärmen men behåller sin tid. Det är
 * så en färdig order avslutas — ordrar raderas aldrig, eftersom den
 * registrerade tiden är fakturaunderlag.
 *
 * Att stänga en order som någon står instämplad på gör INTE det man tror. Den
 * pågående posten fortsätter räknas upp bakom en order som ser avslutad ut,
 * och kiosken kan inte längre stämpla ut från den. Därför ett mellansteg:
 * första försöket ändrar ingenting utan lämnar tillbaka vilka som är inne.
 * Administratören får då välja att stämpla ut dem — vilket flaggar tiden för
 * granskning — eller att avbryta.
 *
 * Blockerar alltså inte. Har någon glömt stämpla ut och gått hem ska ordern
 * ändå gå att avsluta; det som inte får hända är att det sker utan att någon
 * sett det.
 */
export async function toggleOrder(
  _previous: OrderToggleState,
  formData: FormData
): Promise<OrderToggleState> {
  const { db, companyId, email } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const force = formData.get("force") === "1";
  if (!id) return { error: "Ingen order angiven." };

  // Att öppna en stängd order igen är ofarligt och sker utan frågor.
  if (status !== "OPEN") {
    // updateMany och inte update: id:t kommer från formuläret och får aldrig
    // kunna peka på en annan kunds order. Företagsfiltret ger då noll rader
    // i stället för en ändring.
    await db.order.updateMany({ where: { id }, data: { status: "OPEN" } });
    revalidatePath(PATH);
    return { savedAt: Date.now() };
  }

  const order = await db.order.findFirst({
    where: { id },
    select: { orderNumber: true },
  });

  if (!order) return { error: "Ordern finns inte längre." };

  if (!force) {
    const blockers = await openEntriesOnOrder(companyId, id);

    if (blockers.length > 0) {
      return {
        blockers: blockers.map((blocker) => ({
          employeeName: blocker.employeeName,
          momentName: blocker.momentName,
          since: blocker.clockInAt.toISOString(),
        })),
      };
    }
  }

  try {
    await closeOrder(companyId, id, { byEmail: email });
  } catch (error) {
    if (error instanceof ClockError) return { error: error.message };
    throw error;
  }

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}
