import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  agreedPrices,
  discountFrom,
  hasAgreement,
  priceFor,
  setAgreedPrice,
} from "@/lib/company-prices";
import { monthlyRevenueFor } from "@/lib/platform-admin";
import { SCREEN_ITEM } from "@/lib/price-book";

/**
 * AVTALAT PRIS PER KUND.
 *
 * Listpriset står hos Stripe och gäller alla. Den här tabellen säger vad vi
 * kommit överens om med ett enskilt företag, och den finns för att en
 * pilotkund ska kunna få systemet gratis utan att dashboardens intäktssiffra
 * påstår att de betalar.
 *
 * Det som måste hålla:
 *   noll är ett pris, och något ANNAT än "ej satt"
 *   en kund med kort hos Stripe får listpriset, vad som än ligger i tabellen
 *   rabatten räknas mot listpriset
 */

const SCREEN_PRICING = { month: 399, year: 3990, yearlyDiscountPercent: 17, fromStripe: false };
const MODULE_PRICING = {
  PAYROLL: { month: 499, year: 4990, fromStripe: false },
  PLANNING: { month: 699, year: 6990, fromStripe: false },
} as const;

let companyId: string;

beforeEach(async () => {
  const company = await unsafeGlobalPrisma.company.create({
    data: { name: `Pristest ${Math.random().toString(36).slice(2, 8)}` },
  });
  companyId = company.id;
});

afterEach(async () => {
  await unsafeGlobalPrisma.company.delete({ where: { id: companyId } });
});

describe("avtalade priser", () => {
  it("saknas rad gäller listpriset", async () => {
    const prices = await agreedPrices(companyId);

    expect(prices).toEqual({});
    expect(hasAgreement(prices)).toBe(false);
    expect(priceFor(prices, SCREEN_ITEM, 399)).toBe(399);
  });

  it("noll är ett pris och inte ett saknat värde", async () => {
    await setAgreedPrice({
      companyId,
      item: SCREEN_ITEM,
      amount: 0,
      byEmail: "vi@tikkr.se",
    });

    const prices = await agreedPrices(companyId);

    // Det avgörande: noll får inte falla tillbaka på listpriset. Hade raden
    // varit ett nollbart fält på företaget gick gratiskunden inte att uttrycka.
    expect(prices[SCREEN_ITEM]).toBe(0);
    expect(hasAgreement(prices)).toBe(true);
    expect(priceFor(prices, SCREEN_ITEM, 399)).toBe(0);
  });

  it("tomt belopp tar bort överenskommelsen", async () => {
    await setAgreedPrice({
      companyId,
      item: SCREEN_ITEM,
      amount: 299,
      byEmail: "vi@tikkr.se",
    });
    await setAgreedPrice({
      companyId,
      item: SCREEN_ITEM,
      amount: null,
      byEmail: "vi@tikkr.se",
    });

    expect(await agreedPrices(companyId)).toEqual({});
  });

  it("ören räknas om till kronor, och ett halvt öre avrundas", async () => {
    await setAgreedPrice({
      companyId,
      item: "PAYROLL",
      amount: 299.5,
      byEmail: "vi@tikkr.se",
    });

    expect((await agreedPrices(companyId)).PAYROLL).toBe(299.5);
  });
});

describe("rabatten", () => {
  it("räknas mot listpriset", () => {
    expect(discountFrom(399, 299)).toBe(25);
    expect(discountFrom(399, 0)).toBe(100);
  });

  it("visas inte när priset inte är lägre", () => {
    // Ett påslag är inte en negativ rabatt. Fältet finns för att visa vad
    // kunden fått, inte för att redovisa en höjning.
    expect(discountFrom(399, 399)).toBeNull();
    expect(discountFrom(399, 499)).toBeNull();
    expect(discountFrom(0, 0)).toBeNull();
  });
});

describe("månadsintäkten", () => {
  const company = {
    subscriptionStatus: "ACTIVE",
    screenLicenses: 3,
    subscriptionInterval: null,
    modules: [{ module: "PAYROLL" }, { module: "PLANNING" }],
  };

  it("utan överenskommelse räknas listpriset", () => {
    expect(monthlyRevenueFor(company, SCREEN_PRICING, MODULE_PRICING)).toBe(
      3 * 399 + 499 + 699
    );
  });

  it("avtalade priser slår igenom", () => {
    // Scenariot: 299 per skärm, 299 för löneunderlaget, 399 för planeringen.
    const agreed = { SCREEN: 299, PAYROLL: 299, PLANNING: 399 };

    expect(
      monthlyRevenueFor(company, SCREEN_PRICING, MODULE_PRICING, agreed)
    ).toBe(3 * 299 + 299 + 399);
  });

  it("en gratiskund räknas som noll", () => {
    const agreed = { SCREEN: 0, PAYROLL: 0, PLANNING: 0 };

    expect(
      monthlyRevenueFor(company, SCREEN_PRICING, MODULE_PRICING, agreed)
    ).toBe(0);
  });

  it("en kund med kort hos Stripe får listpriset", () => {
    // Raden kan ligga kvar från tiden före prenumerationen. Den ska inte
    // börja gälla igen bara för att den finns: det är kortet som dras.
    const withStripe = { ...company, stripeSubscriptionId: "sub_123" };
    const agreed = { SCREEN: 0, PAYROLL: 0, PLANNING: 0 };

    expect(
      monthlyRevenueFor(withStripe, SCREEN_PRICING, MODULE_PRICING, agreed)
    ).toBe(3 * 399 + 499 + 699);
  });

  it("ett avtalat pris på bara en artikel lämnar resten på listpriset", () => {
    const agreed = { SCREEN: 299 };

    expect(
      monthlyRevenueFor(company, SCREEN_PRICING, MODULE_PRICING, agreed)
    ).toBe(3 * 299 + 499 + 699);
  });
});
