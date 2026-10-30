import { describe, expect, it } from "vitest";
import type { ShopOrderStatus } from "@prisma/client";
import {
  allowedNext,
  allowedPaymentNext,
  canMove,
  FLOW,
  needsAttention,
  notifiesCustomer,
  notifiesOnce,
  requiresMessage,
  STATUS_LABEL,
} from "@/lib/shop/status";
import { hasShopEmail } from "@/lib/emails";

/**
 * BESTÄLLNINGENS LÄGEN.
 *
 * Det som måste hålla:
 *   flödet går framåt, aldrig bakåt; ett fel går via Kräver åtgärd
 *   en skickad skärm kan inte avbrytas, och Avbruten är slutet
 *   mejl går ut för de lägen kunden behöver veta om, och ett mejl per läge
 *   systemet sätter aldrig Skickad eller Levererad av sig självt
 *
 * Behöver ingen databas.
 */

const ALL = Object.keys(STATUS_LABEL) as ShopOrderStatus[];

describe("flödet", () => {
  it("går framåt, även över ett steg", () => {
    expect(canMove("RECEIVED", "CONFIRMED")).toBe(true);
    expect(canMove("CONFIRMED", "READY")).toBe(true);
    expect(canMove("READY", "SHIPPED")).toBe(true);
    expect(canMove("SHIPPED", "DELIVERED")).toBe(true);
  });

  it("aldrig bakåt, och aldrig till samma läge", () => {
    for (const [index, from] of FLOW.entries()) {
      for (const to of FLOW.slice(0, index + 1)) {
        expect(canMove(from, to), `${from} till ${to}`).toBe(false);
      }
    }
  });

  it("avbryts bara före leveransen", () => {
    expect(canMove("RECEIVED", "CANCELED")).toBe(true);
    expect(canMove("READY", "CANCELED")).toBe(true);
    expect(canMove("SHIPPED", "CANCELED")).toBe(false);
    expect(canMove("DELIVERED", "CANCELED")).toBe(false);
  });

  it("Avbruten är slutet", () => {
    expect(allowedNext("CANCELED")).toEqual([]);
  });

  it("Kräver åtgärd nås från allt utom Avbruten, och leder tillbaka", () => {
    for (const from of ALL) {
      expect(canMove(from, "PROBLEM")).toBe(from !== "CANCELED" && from !== "PROBLEM");
    }
    expect(allowedNext("PROBLEM")).toEqual([...FLOW, "CANCELED"]);
  });

  it("varje läge går att nå", () => {
    const reachable = new Set(ALL.flatMap((status) => allowedNext(status)));
    for (const status of ALL.filter((s) => s !== "RECEIVED")) {
      expect(reachable.has(status), status).toBe(true);
    }
  });
});

describe("mejlen", () => {
  it("går ut vid de lägen kunden behöver veta om", () => {
    expect(ALL.filter(notifiesCustomer).sort()).toEqual(
      ["CANCELED", "CONFIRMED", "IN_PRODUCTION", "PROBLEM", "RECEIVED", "SHIPPED"].sort()
    );
  });

  it("varje läge med mejl har en text, och inget annat har det", () => {
    for (const status of ALL) {
      expect(hasShopEmail(status), status).toBe(notifiesCustomer(status));
    }
  });

  it("bara Kräver åtgärd kan skickas flera gånger, och kräver ett meddelande", () => {
    expect(ALL.filter((s) => !notifiesOnce(s))).toEqual(["PROBLEM"]);
    expect(ALL.filter(requiresMessage)).toEqual(["PROBLEM"]);
  });
});

describe("betalningen", () => {
  it("följer fakturan och går att rätta ett steg bakåt", () => {
    expect(allowedPaymentNext("NOT_INVOICED")).toEqual(["INVOICED"]);
    expect(allowedPaymentNext("INVOICED")).toContain("PAID");
    expect(allowedPaymentNext("INVOICED")).toContain("NOT_INVOICED");
    expect(allowedPaymentNext("PAID")).toContain("INVOICED");
    expect(allowedPaymentNext("CREDITED")).toEqual([]);
  });

  it("kan aldrig bli betald utan att ha varit fakturerad", () => {
    expect(allowedPaymentNext("NOT_INVOICED")).not.toContain("PAID");
  });
});

describe("att hantera", () => {
  it("nya, kräver åtgärd, och skickade som inte fakturerats", () => {
    expect(needsAttention({ status: "RECEIVED", paymentStatus: "NOT_INVOICED" })).toBe(true);
    expect(needsAttention({ status: "PROBLEM", paymentStatus: "PAID" })).toBe(true);
    expect(needsAttention({ status: "SHIPPED", paymentStatus: "NOT_INVOICED" })).toBe(true);
    expect(needsAttention({ status: "SHIPPED", paymentStatus: "INVOICED" })).toBe(false);
    expect(needsAttention({ status: "IN_PRODUCTION", paymentStatus: "NOT_INVOICED" })).toBe(false);
    expect(needsAttention({ status: "CANCELED", paymentStatus: "NOT_INVOICED" })).toBe(false);
  });
});
