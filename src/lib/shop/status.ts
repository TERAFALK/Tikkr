import type { ShopOrderStatus, ShopPaymentStatus } from "@prisma/client";

/**
 * BESTÄLLNINGENS LÄGEN, OCH VAD SOM FÅR FÖLJA PÅ VAD.
 *
 * Orderstatus och betalstatus är två saker. Var skärmen är och om fakturan
 * är betald ändras av olika händelser, och ett enda fält hade tvingat fram
 * lägen som "skickad men obetald" som egna värden.
 *
 * Inga databasanrop, så att reglerna går att pröva utan databas. Bevisas av
 * tests/shop-status.test.ts.
 */

export const STATUS_LABEL: Record<ShopOrderStatus, string> = {
  RECEIVED: "Mottagen",
  CONFIRMED: "Bekräftad",
  IN_PRODUCTION: "Under tillverkning",
  READY: "Klar för leverans",
  SHIPPED: "Skickad",
  DELIVERED: "Levererad",
  CANCELED: "Avbruten",
  PROBLEM: "Kräver åtgärd",
};

export const PAYMENT_LABEL: Record<ShopPaymentStatus, string> = {
  NOT_INVOICED: "Ej fakturerad",
  INVOICED: "Fakturerad",
  PAID: "Betald",
  CREDITED: "Krediterad",
};

/** Huvudflödet, i ordning. */
export const FLOW: ShopOrderStatus[] = [
  "RECEIVED",
  "CONFIRMED",
  "IN_PRODUCTION",
  "READY",
  "SHIPPED",
  "DELIVERED",
];

/** Lägen där inget mer händer med beställningen. */
export function isClosed(status: ShopOrderStatus): boolean {
  return status === "DELIVERED" || status === "CANCELED";
}

/**
 * Lägena en beställning får gå till härifrån.
 *
 * - Framåt i flödet, även över ett steg: en skärm som redan står klar på
 *   hyllan behöver inte passera Under tillverkning.
 * - Aldrig bakåt i flödet. Ett fel rättas genom Kräver åtgärd, så att det
 *   syns i historiken att något gick fel.
 * - Avbruten så länge inget skickats. En skickad skärm avbryts inte, den
 *   returneras, och det är Kräver åtgärd.
 * - Kräver åtgärd från allt utom Avbruten, även Levererad: en skärm som går
 *   sönder första veckan är ett ärende på beställningen.
 * - Från Kräver åtgärd till vilket läge som helst i flödet, eller Avbruten.
 * - Avbruten är slutet.
 */
export function allowedNext(from: ShopOrderStatus): ShopOrderStatus[] {
  if (from === "CANCELED") return [];

  if (from === "PROBLEM") return [...FLOW, "CANCELED"];

  const index = FLOW.indexOf(from);
  const forward = FLOW.slice(index + 1);
  const shipped = index >= FLOW.indexOf("SHIPPED");

  return [...forward, ...(shipped ? [] : (["CANCELED"] as const)), "PROBLEM"];
}

export function canMove(from: ShopOrderStatus, to: ShopOrderStatus): boolean {
  return allowedNext(from).includes(to);
}

/**
 * Om kunden ska få mejl när beställningen går till det här läget.
 *
 * Klar för leverans och Levererad saknar mejl: det första är vårt interna
 * steg före transportören, och det andra vet kunden redan, eftersom det är
 * kunden som tagit emot skärmen.
 */
export function notifiesCustomer(status: ShopOrderStatus): boolean {
  return (
    status === "RECEIVED" ||
    status === "CONFIRMED" ||
    status === "IN_PRODUCTION" ||
    status === "SHIPPED" ||
    status === "CANCELED" ||
    status === "PROBLEM"
  );
}

/**
 * Om samma besked kan gå ut en gång till.
 *
 * Kräver åtgärd kan behövas flera gånger, med olika meddelanden. Övriga
 * besked går ut en gång per beställning: en beställning som går till Kräver
 * åtgärd och tillbaka till Under tillverkning ska inte få veta att
 * tillverkningen börjat en gång till.
 */
export function notifiesOnce(status: ShopOrderStatus): boolean {
  return status !== "PROBLEM";
}

/** Läget kräver ett meddelande till kunden, eftersom mejlet annars är tomt. */
export function requiresMessage(status: ShopOrderStatus): boolean {
  return status === "PROBLEM";
}

/**
 * Betalstatusen följer fakturan i Fortnox och sätts för hand.
 *
 * Bakåt är tillåtet ett steg, för att rätta en felklickning: fakturerad som
 * inte var det, betald som inte var det. Krediterad är slutet.
 */
export function allowedPaymentNext(from: ShopPaymentStatus): ShopPaymentStatus[] {
  switch (from) {
    case "NOT_INVOICED":
      return ["INVOICED"];
    case "INVOICED":
      return ["PAID", "CREDITED", "NOT_INVOICED"];
    case "PAID":
      return ["CREDITED", "INVOICED"];
    case "CREDITED":
      return [];
  }
}

/**
 * Beställningar som väntar på oss: nya, de som kräver åtgärd, och skickade
 * som inte fakturerats. Fakturan skickas vid leverans, och en skickad
 * beställning utan faktura är pengar som ingen begärt.
 */
export function needsAttention(order: {
  status: ShopOrderStatus;
  paymentStatus: ShopPaymentStatus;
}): boolean {
  if (order.status === "RECEIVED" || order.status === "PROBLEM") return true;

  const shipped = order.status === "SHIPPED" || order.status === "DELIVERED";
  return shipped && order.paymentStatus === "NOT_INVOICED";
}

/** "Beställning 1001". */
export function orderLabel(number: number): string {
  return `Beställning ${number}`;
}
