import type { Prisma, ShopOrderStatus, ShopPaymentStatus } from "@prisma/client";
import { unsafeGlobalPrisma } from "../db";
import { listPaging, type PageRequest } from "../paging";
import { orderTotals } from "./pricing";
import {
  allowedPaymentNext,
  canMove,
  notifiesCustomer,
  notifiesOnce,
  orderLabel,
  PAYMENT_LABEL,
  requiresMessage,
  STATUS_LABEL,
} from "./status";

/**
 * PLATTFORMENS SIDA AV BESTÄLLNINGARNA.
 *
 * Går medvetet utanför företagsfiltreringen, som inkorgen: vi ser alla
 * kunders beställningar. Varje funktion här kallas bara från
 * plattformspanelens sidor och åtgärder, som prövar behörigheten med
 * requirePlatformAdmin först.
 *
 * VARJE ÄNDRING PRÖVAS MOT LÄGET DEN UTGÅR FRÅN. Formuläret skickar det läge
 * sidan visade, och skrivningen sker bara om beställningen fortfarande står
 * där. Två flikar, eller ett dubbelklick, ger därför en ändring, en rad i
 * historiken och ett mejl, inte två.
 */

export class ShopActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopActionError";
  }
}

const STALE = "Beställningen har ändrats sedan sidan laddades. Ladda om och försök igen.";

export interface ShopOrderFilters extends PageRequest {
  q?: string;
  status?: ShopOrderStatus;
  payment?: ShopPaymentStatus;
  /** "att-hantera": nya, kräver åtgärd, och skickade utan faktura. */
  attention?: boolean;
  from?: Date;
  to?: Date;
}

/** Samma urval som needsAttention i status.ts, som en databasfråga. */
const ATTENTION_WHERE: Prisma.ShopOrderWhereInput = {
  OR: [
    { status: { in: ["RECEIVED", "PROBLEM"] } },
    { status: { in: ["SHIPPED", "DELIVERED"] }, paymentStatus: "NOT_INVOICED" },
  ],
};

function whereFor(filters: ShopOrderFilters): Prisma.ShopOrderWhereInput {
  const and: Prisma.ShopOrderWhereInput[] = [];
  const q = filters.q?.trim();

  if (q) {
    const number = Number(q.replace(/\D/g, ""));
    and.push({
      OR: [
        ...(Number.isInteger(number) && number > 0 && /^\D*\d+$/.test(q) ? [{ number }] : []),
        { companyName: { contains: q, mode: "insensitive" } },
        { orgNumber: { contains: q } },
      ],
    });
  }

  if (filters.status) and.push({ status: filters.status });
  if (filters.payment) and.push({ paymentStatus: filters.payment });
  if (filters.attention) and.push(ATTENTION_WHERE);
  if (filters.from) and.push({ createdAt: { gte: filters.from } });
  if (filters.to) and.push({ createdAt: { lt: filters.to } });

  return and.length > 0 ? { AND: and } : {};
}

export async function listShopOrders(filters: ShopOrderFilters) {
  const where = whereFor(filters);

  // Antalet först, så att ett sidnummer bortom slutet kan visa sista sidan.
  const total = await unsafeGlobalPrisma.shopOrder.count({ where });
  const paging = listPaging(total, filters);

  const rows = await unsafeGlobalPrisma.shopOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: paging.skip,
    take: paging.take,
    select: {
      id: true,
      number: true,
      companyId: true,
      companyName: true,
      status: true,
      paymentStatus: true,
      totalOre: true,
      shippingOre: true,
      createdAt: true,
      lines: { select: { name: true, quantity: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  return { rows, total, paging };
}

/** Siffran vid Beställningar i menyn. */
export async function shopAttentionCount(): Promise<number> {
  return unsafeGlobalPrisma.shopOrder.count({ where: ATTENTION_WHERE });
}

export async function getShopOrder(orderId: string) {
  const order = await unsafeGlobalPrisma.shopOrder.findUnique({
    where: { id: orderId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!order) return null;

  const notes = await unsafeGlobalPrisma.shopOrderNote.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });

  return { ...order, notes };
}

export type ShopOrderDetail = NonNullable<Awaited<ReturnType<typeof getShopOrder>>>;

/** Text till kunden. Kort nog att läsa i ett mejl. */
export const MAX_CUSTOMER_MESSAGE = 2000;

/**
 * Flyttar en beställning till ett nytt läge.
 *
 * Avgör själv om kunden ska få mejl, ur läget (status.ts), och lägger
 * händelsen som väntande. Anroparen skickar den efteråt med
 * deliverPendingForOrder, utanför transaktionen.
 */
export async function changeShopStatus(params: {
  orderId: string;
  from: ShopOrderStatus;
  to: ShopOrderStatus;
  message: string | null;
  actorEmail: string;
}): Promise<{ number: number; companyId: string; emailQueued: boolean }> {
  const { orderId, from, to, actorEmail } = params;
  const message = params.message?.trim() || null;

  if (!canMove(from, to)) {
    throw new ShopActionError(
      `${STATUS_LABEL[from]} kan inte gå till ${STATUS_LABEL[to]}.`
    );
  }
  if (requiresMessage(to) && !message) {
    throw new ShopActionError("Skriv vad kunden behöver veta.");
  }
  if (message && message.length > MAX_CUSTOMER_MESSAGE) {
    throw new ShopActionError(`Meddelandet får vara högst ${MAX_CUSTOMER_MESSAGE} tecken.`);
  }

  return unsafeGlobalPrisma.$transaction(async (tx) => {
    const moved = await tx.shopOrder.updateMany({
      where: { id: orderId, status: from },
      data: {
        status: to,
        ...(to === "SHIPPED" && { shippedAt: new Date() }),
      },
    });

    if (moved.count === 0) throw new ShopActionError(STALE);

    const order = await tx.shopOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { number: true, companyId: true },
    });

    let emailState: "PENDING" | "SKIPPED" | null = null;

    if (notifiesCustomer(to)) {
      const sentBefore =
        notifiesOnce(to) &&
        (await tx.shopOrderEvent.count({
          where: { orderId, toStatus: to, emailState: "SENT" },
        })) > 0;

      emailState = sentBefore ? "SKIPPED" : "PENDING";
    }

    await tx.shopOrderEvent.create({
      data: {
        companyId: order.companyId,
        orderId,
        kind: "STATUS",
        fromStatus: from,
        toStatus: to,
        customerMessage: message,
        actorEmail,
        emailState,
      },
    });

    await tx.platformAuditLog.create({
      data: {
        actorEmail,
        action: "Ändrade beställning",
        targetCompanyId: order.companyId,
        detail: `${orderLabel(order.number)}: ${STATUS_LABEL[from]} till ${STATUS_LABEL[to]}`,
      },
    });

    return { ...order, emailQueued: emailState === "PENDING" };
  });
}

export const MAX_CARRIER = 100;
export const MAX_TRACKING_URL = 500;

/**
 * En spårningslänk som går att lägga i ett mejl till en kund.
 *
 * Bara https, och bara en riktig adress. En länk i ett mejl från oss är en
 * länk kunden litar på, och ett javascript: eller en http-adress hör inte dit.
 */
export function cleanTrackingUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.length > MAX_TRACKING_URL) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Transportör, spårningslänk och frakt.
 *
 * Frakten räknar om beställningens summor ur dess egna rader, så att den
 * sparade totalen alltid är raderna plus frakten. Den går inte att ändra när
 * beställningen är fakturerad: då står beloppet redan på fakturan, och ett
 * annat tal här vore fel.
 */
export async function setShopShipping(params: {
  orderId: string;
  carrier: string;
  trackingUrl: string;
  /** Öre exkl. moms, eller null för okänd. */
  shippingOre: number | null;
  actorEmail: string;
}): Promise<void> {
  const carrier = params.carrier.trim() || null;
  if (carrier && carrier.length > MAX_CARRIER) {
    throw new ShopActionError(`Transportören får vara högst ${MAX_CARRIER} tecken.`);
  }

  const trackingUrl = params.trackingUrl.trim() ? cleanTrackingUrl(params.trackingUrl) : null;
  if (params.trackingUrl.trim() && !trackingUrl) {
    throw new ShopActionError("Spårningslänken ska vara en hel adress som börjar med https://.");
  }

  if (params.shippingOre !== null && (params.shippingOre < 0 || params.shippingOre > 1_000_000)) {
    throw new ShopActionError("Frakten ska vara ett belopp i kronor, t.ex. 450.");
  }

  await unsafeGlobalPrisma.$transaction(async (tx) => {
    const order = await tx.shopOrder.findUnique({
      where: { id: params.orderId },
      select: {
        number: true,
        companyId: true,
        paymentStatus: true,
        shippingOre: true,
        carrier: true,
        trackingUrl: true,
        lines: { select: { subtotalOre: true, vatOre: true } },
      },
    });

    if (!order) throw new ShopActionError("Beställningen finns inte.");

    const shippingChanged = order.shippingOre !== params.shippingOre;

    if (shippingChanged && order.paymentStatus !== "NOT_INVOICED") {
      throw new ShopActionError(
        "Beställningen är fakturerad. Frakten ändras på fakturan i Fortnox."
      );
    }

    if (!shippingChanged && order.carrier === carrier && order.trackingUrl === trackingUrl) {
      return;
    }

    const totals = orderTotals(order.lines, params.shippingOre);

    await tx.shopOrder.update({
      where: { id: params.orderId },
      data: {
        carrier,
        trackingUrl,
        shippingOre: totals.shippingOre,
        goodsOre: totals.goodsOre,
        vatOre: totals.vatOre,
        totalOre: totals.totalOre,
      },
    });

    const parts = [
      carrier ? `Transportör ${carrier}` : "Ingen transportör",
      trackingUrl ? "spårningslänk satt" : "ingen spårningslänk",
      params.shippingOre === null ? "frakt ej satt" : `frakt ${(params.shippingOre / 100).toFixed(2).replace(".", ",")} kr`,
    ];

    await tx.shopOrderEvent.create({
      data: {
        companyId: order.companyId,
        orderId: params.orderId,
        kind: "SHIPPING",
        detail: parts.join(", "),
        actorEmail: params.actorEmail,
      },
    });
  });
}

export const MAX_INVOICE_NUMBER = 40;

/**
 * Betalstatusen, så som fakturan står i Fortnox.
 *
 * Fakturerad kräver fakturanummer och datum, och Betald kräver datum. Utan
 * dem vore statusen ett påstående som ingen kan kontrollera. Går den bakåt
 * för att rätta ett misstag töms uppgifterna som inte längre gäller.
 */
export async function setShopPayment(params: {
  orderId: string;
  from: ShopPaymentStatus;
  to: ShopPaymentStatus;
  invoiceNumber: string;
  date: Date | null;
  actorEmail: string;
}): Promise<void> {
  const { from, to } = params;

  if (!allowedPaymentNext(from).includes(to)) {
    throw new ShopActionError(`${PAYMENT_LABEL[from]} kan inte gå till ${PAYMENT_LABEL[to]}.`);
  }

  const invoiceNumber = params.invoiceNumber.trim();

  if (to === "INVOICED" && from === "NOT_INVOICED") {
    if (!invoiceNumber) throw new ShopActionError("Skriv fakturanumret från Fortnox.");
    if (invoiceNumber.length > MAX_INVOICE_NUMBER) {
      throw new ShopActionError(`Fakturanumret får vara högst ${MAX_INVOICE_NUMBER} tecken.`);
    }
    if (!params.date) throw new ShopActionError("Ange fakturadatum.");
  }

  if (to === "PAID" && !params.date) {
    throw new ShopActionError("Ange vilket datum betalningen kom in.");
  }

  const data: Prisma.ShopOrderUpdateManyMutationInput = { paymentStatus: to };

  if (to === "NOT_INVOICED") {
    Object.assign(data, { invoiceNumber: null, invoicedAt: null, paidAt: null });
  } else if (to === "INVOICED" && from === "NOT_INVOICED") {
    Object.assign(data, { invoiceNumber, invoicedAt: params.date });
  } else if (to === "INVOICED" && from === "PAID") {
    Object.assign(data, { paidAt: null });
  } else if (to === "PAID") {
    Object.assign(data, { paidAt: params.date });
  }

  await unsafeGlobalPrisma.$transaction(async (tx) => {
    const moved = await tx.shopOrder.updateMany({
      where: { id: params.orderId, paymentStatus: from },
      data,
    });

    if (moved.count === 0) throw new ShopActionError(STALE);

    const order = await tx.shopOrder.findUniqueOrThrow({
      where: { id: params.orderId },
      select: { number: true, companyId: true, invoiceNumber: true },
    });

    const detail = [
      `${PAYMENT_LABEL[from]} till ${PAYMENT_LABEL[to]}`,
      to === "INVOICED" && order.invoiceNumber ? `faktura ${order.invoiceNumber}` : null,
      params.date && (to === "PAID" || (to === "INVOICED" && from === "NOT_INVOICED"))
        ? params.date.toISOString().slice(0, 10)
        : null,
    ]
      .filter(Boolean)
      .join(", ");

    await tx.shopOrderEvent.create({
      data: {
        companyId: order.companyId,
        orderId: params.orderId,
        kind: "PAYMENT",
        detail,
        actorEmail: params.actorEmail,
      },
    });

    await tx.platformAuditLog.create({
      data: {
        actorEmail: params.actorEmail,
        action: "Ändrade betalning",
        targetCompanyId: order.companyId,
        detail: `${orderLabel(order.number)}: ${detail}`,
      },
    });
  });
}

export const MAX_NOTE = 4000;

/** En intern anteckning. Syns aldrig för kunden och går aldrig i ett mejl. */
export async function addShopNote(params: {
  orderId: string;
  body: string;
  actorEmail: string;
}): Promise<void> {
  const body = params.body.trim();
  if (!body) throw new ShopActionError("Skriv anteckningen.");
  if (body.length > MAX_NOTE) {
    throw new ShopActionError(`Anteckningen får vara högst ${MAX_NOTE} tecken.`);
  }

  const order = await unsafeGlobalPrisma.shopOrder.findUnique({
    where: { id: params.orderId },
    select: { companyId: true },
  });
  if (!order) throw new ShopActionError("Beställningen finns inte.");

  await unsafeGlobalPrisma.shopOrderNote.create({
    data: {
      orderId: params.orderId,
      targetCompanyId: order.companyId,
      body,
      authorEmail: params.actorEmail,
    },
  });
}
