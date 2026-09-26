import { forCompany } from "./tenant";
import { isUniqueViolation } from "./clock";

/**
 * SNABBJOBB — ORDRAR SKAPADE FRÅN STÄMPLINGSSKÄRMEN.
 *
 * Arbetet börjar ibland innan kontoret hunnit lägga upp ordern. Utan en utväg
 * stämplar folk då på fel order eller inte alls, och den timmen går inte att
 * rekonstruera i efterhand — den är fakturaunderlag som försvinner.
 *
 * Ordern märks `isQuickJob`, vilket betyder "någon bör titta på den här":
 * numret kan vara avskrivet fel och kunden kan saknas. Adminpanelen listar dem
 * separat tills någon sparat orderns uppgifter.
 *
 * Kräver nät. Till skillnad från en stämpling går det inte att köa — en order
 * måste finnas på servern innan tiden kan peka på den. Skärmen säger det rakt
 * ut i stället för att låtsas.
 */

export class QuickOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickOrderError";
  }
}

/** Prefix på de nummer systemet hittar på när den anställde inte har något. */
const GENERATED_PREFIX = "SNABB-";

/** Hur många gånger ett genererat nummer får krocka innan vi ger upp. */
const NUMBER_ATTEMPTS = 10;

export interface QuickOrderInput {
  /**
   * Numret den anställde slog in. Utelämnas när hen inte har något — då
   * hittar systemet på ett, märkt så att det syns att det är påhittat.
   */
  orderNumber?: string;
  /** Kunden ur registret. Skärmen skickar aldrig ett namn, bara ett id. */
  customerId?: string;
}

export interface QuickOrder {
  id: string;
  orderNumber: string;
  customerName: string | null;
}

/**
 * Skapar ordern, eller returnerar den befintliga om numret redan finns.
 *
 * Att returnera den befintliga är med flit. Två personer kan slå in samma
 * nummer inom samma minut, och den andra ska stämpla på samma order som den
 * första — inte få ett felmeddelande eller en dubblett.
 */
/** Fälten skärmen behöver. Samlat så att de fyra uppslagen inte glider isär. */
const QUICK_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  customerId: true,
  customer: { select: { name: true } },
} as const;

function toQuickOrder(order: {
  id: string;
  orderNumber: string;
  customer: { name: string } | null;
}): QuickOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer?.name ?? null,
  };
}

export async function createQuickOrder(
  companyId: string,
  input: QuickOrderInput
): Promise<QuickOrder> {
  const db = forCompany(companyId);

  const orderNumber = input.orderNumber?.trim();

  // Kunden slås upp genom det filtrerade lagret, inte litas på rakt av. Id:t
  // kommer från en skärm, och en skärm ska inte kunna peka på en annan kunds
  // kundregister ens av misstag.
  const customerId = await resolveCustomer(db, input.customerId);

  if (orderNumber) {
    const existing = await db.order.findFirst({
      where: { orderNumber },
      select: { ...QUICK_ORDER_SELECT, status: true },
    });

    if (existing) {
      if (existing.status === "CLOSED") {
        throw new QuickOrderError(
          `Order ${orderNumber} finns men är avslutad. Be en administratör ` +
            `öppna den igen.`
        );
      }

      // KUNDEN PÅ DEN BEFINTLIGA ORDERN RÖRS INTE, även om den här
      // stämplingen pekar ut en annan. Kontoret kan ha rättat den, och en
      // skärm ska inte skriva över det.
      //
      // Saknar ordern kund och den här stämplingen har en, fylls den i — det
      // är ny uppgift, inte en ändrad. Ordern flaggas som snabbjobb igen så
      // att kontoret tittar på den.
      if (customerId && !existing.customerId) {
        return toQuickOrder(
          await db.order.update({
            where: { id: existing.id },
            data: { customerId, isQuickJob: true },
            select: QUICK_ORDER_SELECT,
          })
        );
      }

      return toQuickOrder(existing);
    }

    return toQuickOrder(
      await db.order.create({
        data: { companyId, orderNumber, customerId, isQuickJob: true },
        select: QUICK_ORDER_SELECT,
      })
    );
  }

  // Inget nummer angivet: hitta på ett. Numret räknas fram ur hur många som
  // redan finns, och krockar det provar vi nästa. En räknare i databasen hade
  // varit exaktare, men det här är ett undantagsfall och inte ett flöde som
  // körs tusen gånger om dagen.
  const taken = await db.order.count({
    where: { orderNumber: { startsWith: GENERATED_PREFIX } },
  });

  for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
    const candidate = `${GENERATED_PREFIX}${taken + attempt + 1}`;

    try {
      return toQuickOrder(
        await db.order.create({
          data: {
            companyId,
            orderNumber: candidate,
            customerId,
            isQuickJob: true,
          },
          select: QUICK_ORDER_SELECT,
        })
      );
    } catch (error) {
      // Numret hann tas av en annan skärm. Prova nästa.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  throw new QuickOrderError(
    "Kunde inte skapa ett snabbjobb just nu. Försök igen om en stund."
  );
}

/**
 * Kunderna skärmen får välja mellan.
 *
 * Kommer ur KUNDREGISTRET, inte ur ordrarnas historik. Före registret
 * plockades namnen ur de senaste ~480 ordrarna och dedupades med ett `Set` på
 * trimmad text — vilket gjorde "Volvo" och "volvo" till två kunder, och lät en
 * kund vars ordrar låg längre bak falla bort tyst.
 *
 * Avaktiverade kunder utelämnas. De behåller sina gamla ordrar, men ska inte
 * gå att stämpla på nytt.
 */
export async function pickableCustomers(
  db: ReturnType<typeof forCompany>
): Promise<{ id: string; name: string }[]> {
  return db.customer.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Kontrollerar att kunden finns och är aktiv.
 *
 * Ett id från en skärm får aldrig användas rakt av. Filtreringslagret hindrar
 * visserligen att en annan kunds rad nås, men en order som pekar på en
 * avaktiverad eller borttagen kund vore ändå skräp i underlaget.
 *
 * Okand kund ger null och inte ett fel: stämplingen ska gå igenom ändå.
 * Arbetstid som inte registreras går inte att rekonstruera, en saknad kund
 * fyller kontoret i.
 */
async function resolveCustomer(
  db: ReturnType<typeof forCompany>,
  customerId: string | undefined
): Promise<string | null> {
  if (!customerId) return null;

  const customer = await db.customer.findFirst({
    where: { id: customerId, active: true },
    select: { id: true },
  });

  return customer?.id ?? null;
}
