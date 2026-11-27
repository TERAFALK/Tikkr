import { describe, it, expect, vi } from "vitest";
import {
  BillingChangeError,
  checkoutLineItems,
  moduleAddition,
  vatTaxRateIds,
} from "@/lib/billing";

/**
 * MOMSEN PÅ PRENUMERATIONERNA.
 *
 * Priserna hos Stripe är exklusive moms, och Tikkr säljer bara till svenska
 * företag, så varje rad ska bära samma momssats på 25 %. Till v1.0.1 skapade
 * kassan prenumerationerna utan någon momssats alls: kunden drogs 399 kr för
 * en licens och fakturan saknade momsen.
 *
 * Felet syntes inte i någon summa i Tikkr, bara på fakturan hos kunden, och
 * därför ligger kontrollen här: varje rad kassan skapar, och varje tillval som
 * läggs till efteråt, ska bära momssatsen. Saknas satsen startar ingen
 * betalning alls, hellre än en faktura som är fel.
 */

const RATE = "txr_moms_25";

describe("momssatsen", () => {
  it("läses ur STRIPE_TAX_RATE_ID", () => {
    expect(vatTaxRateIds(RATE)).toEqual([RATE]);
    expect(vatTaxRateIds(`  ${RATE}\n`)).toEqual([RATE]);
  });

  it("vägrar när den saknas, i stället för att sälja utan moms", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => vatTaxRateIds(undefined)).toThrow(BillingChangeError);
    expect(() => vatTaxRateIds("  ")).toThrow(BillingChangeError);

    error.mockRestore();
  });
});

describe("kassan", () => {
  it("lägger momssatsen på licensraden och varje tillval", () => {
    const lines = checkoutLineItems({
      screenPrice: "price_screen",
      screens: 3,
      modulePrices: ["price_payroll", "price_planning"],
      taxRates: [RATE],
    });

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.tax_rates).toEqual([RATE]);
    }

    expect(lines[0]).toMatchObject({ price: "price_screen", quantity: 3 });
    expect(lines[1]).toMatchObject({ price: "price_payroll", quantity: 1 });
    expect(lines[2]).toMatchObject({ price: "price_planning", quantity: 1 });
  });
});

describe("ett tillval som läggs till efter köpet", () => {
  it("får samma momssats som resten av prenumerationen", () => {
    expect(moduleAddition("price_payroll", [RATE])).toEqual({
      price: "price_payroll",
      quantity: 1,
      tax_rates: [RATE],
    });
  });
});
