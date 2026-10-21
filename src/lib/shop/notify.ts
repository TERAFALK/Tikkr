import type { ShopOrderStatus } from "@prisma/client";
import { appUrl } from "../app-url";
import { unsafeGlobalPrisma } from "../db";
import { sendEmail } from "../email";
import { hasShopEmail, shopOrderEmail } from "../emails";
import { isProductKey, PRODUCTS } from "./catalog";
import { needsDelivery } from "./pricing";
import { notifiesOnce } from "./status";

/**
 * KUNDAVISERINGARNA FÖR EN BESTÄLLNING.
 *
 * Varje händelse som ska nå kunden får `emailState = PENDING` i samma
 * transaktion som ändringen. Utskicket sker EFTER att ändringen sparats, och
 * ett misslyckat utskick lämnar beställningen orörd: händelsen blir FAILED,
 * felet står i plattformens historik, och där finns Skicka igen.
 *
 * SAMMA MEJL GÅR INTE UT TVÅ GÅNGER.
 * - Händelsen tas med en villkorad skrivning, PENDING eller FAILED till
 *   SENDING. Två samtidiga försök kan inte båda vinna den.
 * - Ett besked som redan gått ut för beställningen skickas inte igen, se
 *   notifiesOnce i status.ts. Händelsen blir då SKIPPED.
 *
 * Läser via den ofiltrerade klienten, eftersom den kallas både från kundens
 * beställning och från plattformen. Händelsen pekas ut av sitt id, som
 * anroparen just skapat; inget id kommer från ett formulär.
 */

export type DeliveryOutcome = "sent" | "failed" | "skipped" | "none";

export async function deliverEventEmail(eventId: string): Promise<DeliveryOutcome> {
  const claimed = await unsafeGlobalPrisma.shopOrderEvent.updateMany({
    where: { id: eventId, emailState: { in: ["PENDING", "FAILED"] } },
    data: { emailState: "SENDING", emailError: null },
  });

  if (claimed.count === 0) return "none";

  const event = await unsafeGlobalPrisma.shopOrderEvent.findUnique({
    where: { id: eventId },
    select: {
      orderId: true,
      toStatus: true,
      customerMessage: true,
      order: {
        select: {
          number: true,
          email: true,
          companyName: true,
          contactName: true,
          addressLine: true,
          postalCode: true,
          city: true,
          reference: true,
          goodsOre: true,
          shippingOre: true,
          vatOre: true,
          totalOre: true,
          carrier: true,
          trackingUrl: true,
          lines: {
            orderBy: { sortOrder: "asc" },
            select: { productKey: true, name: true, quantity: true, subtotalOre: true },
          },
        },
      },
    },
  });

  const status = event?.toStatus as ShopOrderStatus | undefined;

  if (!event || !status || !hasShopEmail(status)) {
    await finish(eventId, { emailState: "SKIPPED" });
    return "skipped";
  }

  if (notifiesOnce(status)) {
    const already = await unsafeGlobalPrisma.shopOrderEvent.count({
      where: {
        orderId: event.orderId,
        toStatus: status,
        emailState: "SENT",
        id: { not: eventId },
      },
    });

    if (already > 0) {
      await finish(eventId, { emailState: "SKIPPED" });
      return "skipped";
    }
  }

  const { order } = event;

  // Leveranstiden ur katalogen, en gång per text. Två produkter med samma
  // tid ska inte ge samma mening två gånger.
  const delivery = [
    ...new Set(
      order.lines
        .map((line) => (isProductKey(line.productKey) ? PRODUCTS[line.productKey].delivery : null))
        .filter((text): text is string => Boolean(text))
    ),
  ].join(" ");

  try {
    const result = await sendEmail(
      shopOrderEmail({
        to: order.email,
        status,
        order: { ...order, ships: needsDelivery(order.lines) },
        message: event.customerMessage,
        delivery: delivery || null,
        link: `${appUrl()}/admin/butik/bestallningar`,
      })
    );

    // I labbläget skrivs mejlet i loggen i stället för att skickas. Det är
    // inget fel, och händelsen ska inte stå som misslyckad.
    if (result.delivered || result.provider === "log") {
      await finish(eventId, { emailState: "SENT", emailedAt: new Date() });
      return "sent";
    }

    await finish(eventId, {
      emailState: "FAILED",
      emailError: (result.problem ?? "Okänt fel vid utskick.").slice(0, 500),
    });
    return "failed";
  } catch (error) {
    // Ordernumret, aldrig adressen: loggen ska inte bära personuppgifter.
    console.error(`[tillbehör] Mejlet om beställning ${order.number} gick inte iväg`, error);
    await finish(eventId, {
      emailState: "FAILED",
      emailError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    });
    return "failed";
  }
}

/** Skickar allt som väntar för en beställning, i den ordning det hände. */
export async function deliverPendingForOrder(orderId: string): Promise<void> {
  const pending = await unsafeGlobalPrisma.shopOrderEvent.findMany({
    where: { orderId, emailState: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  for (const event of pending) {
    await deliverEventEmail(event.id);
  }
}

async function finish(
  eventId: string,
  data: {
    emailState: "SENT" | "FAILED" | "SKIPPED";
    emailedAt?: Date;
    emailError?: string;
  }
): Promise<void> {
  await unsafeGlobalPrisma.shopOrderEvent.update({ where: { id: eventId }, data });
}
