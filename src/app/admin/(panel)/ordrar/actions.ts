"use server";

import { revalidatePath } from "next/cache";
import { assertWritable, requireAdmin } from "@/lib/admin-session";
import { resolveCustomerId } from "@/lib/customers";
import { ClockError, closeOrder, openEntriesOnOrder } from "@/lib/clock";
import { parseMarkupPercent, parseOre } from "@/lib/money";
import { readBudgetRows, saveOrderBudgets } from "@/lib/order-budget";

const PATH = "/admin/ordrar";

export interface OrderFormState {
  error?: string;
  /** Sattes senast sparandet gick igenom. Stänger rutan i gränssnittet. */
  savedAt?: number;
}

/** Orderns uppgifter, färdigtolkade ur formuläret. */
interface OrderFields {
  orderNumber: string;
  markupPercent: number | null;
  fixedPriceOre: number | null;
}

/**
 * Läser och kontrollerar fälten som är gemensamma för att skapa och ändra.
 *
 * Ligger på ett ställe eftersom det gjorde det tidigare bara vid ändring:
 * skapa-rutan saknade både påslag och fast pris, och den som la upp en
 * fastprisorder fick lägga upp den först och rätta den sedan. Två formulär mot
 * samma tabell ska tolkas av samma kod, annars glider de isär igen.
 *
 * Ger antingen ett fel att visa eller färdiga värden — aldrig både och.
 */
function readOrderFields(
  formData: FormData
): { error: string } | { values: OrderFields } {
  const orderNumber = String(formData.get("orderNumber") ?? "").trim();
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

  return { values: { orderNumber, markupPercent, fixedPriceOre } };
}

/**
 * Lägger upp en ny order.
 *
 * Svarar med ett tillstånd av samma skäl som updateOrder: ett påslag som
 * skrivits som "40" när man menade "1,4" ska inte sparas tyst — felet syns
 * först på en faktura, och då är det för sent.
 */
export async function createOrder(
  _previous: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId } = session;

  const fields = readOrderFields(formData);
  if ("error" in fields) return fields;

  const order = await db.order.create({
    data: {
      companyId,
      orderNumber: fields.values.orderNumber,
      customerId: await resolveCustomerId(db, formData.get("customerId")),
      markupPercent: fields.values.markupPercent,
      fixedPriceOre: fields.values.fixedPriceOre,
    },
  });

  // Efter ordern och inte i samma anrop: raderna pekar på ordern, som får sitt
  // id först när den finns. Se src/lib/order-budget.ts.
  await saveOrderBudgets(db, companyId, order.id, readBudgetRows(formData));

  revalidatePath(PATH);
  return { savedAt: Date.now() };
}

/**
 * Ändrar en orders uppgifter.
 *
 * Samma fält och samma kontroller som när ordern skapas — se readOrderFields.
 */
export async function updateOrder(
  _previous: OrderFormState,
  formData: FormData
): Promise<OrderFormState> {
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId } = session;

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Ingen order angiven." };

  const fields = readOrderFields(formData);
  if ("error" in fields) return fields;

  // updateMany och inte update: id:t kommer från formuläret och får aldrig
  // kunna peka på en annan kunds order.
  await db.order.updateMany({
    where: { id },
    data: {
      orderNumber: fields.values.orderNumber,
      customerId: await resolveCustomerId(db, formData.get("customerId")),
      markupPercent: fields.values.markupPercent,
      fixedPriceOre: fields.values.fixedPriceOre,
      // Att spara uppgifterna ÄR kvittot på att någon tittat. Ett snabbjobb
      // skapat i verkstaden slutar därmed vara en uppgift att göra, utan att
      // det behövs en egen knapp för "jag har sett den".
      isQuickJob: false,
    },
  });

  // Ligger utanför updateMany eftersom beräkningen är egna rader, inte fält på
  // ordern. Hör ordern till ett annat företag skrev updateMany ingenting, och
  // saveOrderBudgets hittar den av samma skäl inte heller.
  await saveOrderBudgets(db, companyId, id, readBudgetRows(formData));

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
  const session = await requireAdmin();
  await assertWritable(session);
  const { db, companyId, email } = session;

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
