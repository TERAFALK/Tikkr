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
  customerName?: string;
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
export async function createQuickOrder(
  companyId: string,
  input: QuickOrderInput
): Promise<QuickOrder> {
  const db = forCompany(companyId);

  const customerName = input.customerName?.trim() || null;
  const orderNumber = input.orderNumber?.trim();

  if (orderNumber) {
    const existing = await db.order.findFirst({
      where: { orderNumber },
      select: { id: true, orderNumber: true, customerName: true, status: true },
    });

    if (existing) {
      if (existing.status === "CLOSED") {
        throw new QuickOrderError(
          `Order ${orderNumber} finns men är avslutad. Be en administratör ` +
            `öppna den igen.`
        );
      }
      return existing;
    }

    return db.order.create({
      data: { companyId, orderNumber, customerName, isQuickJob: true },
      select: { id: true, orderNumber: true, customerName: true },
    });
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
      return await db.order.create({
        data: {
          companyId,
          orderNumber: candidate,
          customerName,
          isQuickJob: true,
        },
        select: { id: true, orderNumber: true, customerName: true },
      });
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
 * Kundnamnen företaget använt, senast använda först.
 *
 * Underlaget för rutnätet i kiosken. Skärmen ska kunna erbjuda ett tryck i
 * stället för ett tangentbord — namnen finns ju redan.
 */
export async function recentCustomerNames(
  db: ReturnType<typeof forCompany>,
  limit = 60
): Promise<string[]> {
  const orders = await db.order.findMany({
    where: { customerName: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { customerName: true },
    // Fler rader än namn: samma kund har många ordrar, och dubbletterna
    // rensas nedan.
    take: limit * 8,
  });

  const seen = new Set<string>();

  for (const order of orders) {
    const name = order.customerName?.trim();
    if (name) seen.add(name);
    if (seen.size >= limit) break;
  }

  return [...seen];
}
