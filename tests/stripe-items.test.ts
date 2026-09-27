import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Stripe from "stripe";
import {
  moduleItemsOf,
  modulePriceId,
  priceRole,
  screenItemOf,
} from "@/lib/stripe";

/**
 * VILKEN RAD PÅ PRENUMERATIONEN SOM BÄR VAD.
 *
 * Fram till att tillvalen fanns hade varje prenumeration exakt en rad, och
 * koden läste `items.data[0]` för att få antalet stämplingsskärmar. Med en
 * modulrad bredvid är ordningen inte längre given: hamnar löneunderlaget
 * först skulle antalet licenser sättas till ett, tyst, och en kund med tre
 * skärmar blir en.
 *
 * Testet finns för att det felet inte syns. Det ger inget felmeddelande, bara
 * en siffra som är fel nästa gång någon tittar.
 *
 * Behöver ingen databas och inget Stripe-konto: funktionerna läser bara
 * pris-id ur miljövariabler och jämför.
 */

const SCREENS = "price_screens_month";
const SCREENS_YEAR = "price_screens_year";
const PAYROLL = "price_payroll_month";
const PAYROLL_YEAR = "price_payroll_year";

const saved: Record<string, string | undefined> = {};

const KEYS = [
  "STRIPE_PRICE_ID",
  "STRIPE_PRICE_ID_YEARLY",
  "STRIPE_PRICE_ID_PAYROLL",
  "STRIPE_PRICE_ID_PAYROLL_YEARLY",
];

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];

  process.env.STRIPE_PRICE_ID = SCREENS;
  process.env.STRIPE_PRICE_ID_YEARLY = SCREENS_YEAR;
  process.env.STRIPE_PRICE_ID_PAYROLL = PAYROLL;
  process.env.STRIPE_PRICE_ID_PAYROLL_YEARLY = PAYROLL_YEAR;
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/** Minsta möjliga prenumeration med de rader testet bryr sig om. */
function subscriptionWith(
  rows: { id: string; price: string; quantity?: number; interval?: "month" | "year" }[]
): Stripe.Subscription {
  return {
    items: {
      data: rows.map((row) => ({
        id: row.id,
        quantity: row.quantity ?? 1,
        price: {
          id: row.price,
          recurring: { interval: row.interval ?? "month" },
        },
      })),
    },
  } as unknown as Stripe.Subscription;
}

describe("priceRole", () => {
  it("känner igen skärmartikeln i båda intervallen", () => {
    expect(priceRole(SCREENS)).toEqual({ kind: "SCREENS" });
    expect(priceRole(SCREENS_YEAR)).toEqual({ kind: "SCREENS" });
  });

  it("känner igen modulartikeln i båda intervallen", () => {
    expect(priceRole(PAYROLL)).toEqual({ kind: "MODULE", key: "PAYROLL" });
    expect(priceRole(PAYROLL_YEAR)).toEqual({ kind: "MODULE", key: "PAYROLL" });
  });

  it("svarar null på ett okänt pris och på inget pris", () => {
    expect(priceRole("price_nagot_annat")).toBeNull();
    expect(priceRole(undefined)).toBeNull();
    expect(priceRole(null)).toBeNull();
  });

  it("blandar inte ihop artiklarna när en miljövariabel saknas", () => {
    // Utan årsartikel för modulen ska månadsartikeln fortfarande hittas, och
    // ingenting ska råka matcha på undefined.
    delete process.env.STRIPE_PRICE_ID_PAYROLL_YEARLY;

    expect(priceRole(PAYROLL)).toEqual({ kind: "MODULE", key: "PAYROLL" });
    expect(modulePriceId("PAYROLL", "year")).toBeUndefined();
    expect(priceRole(undefined)).toBeNull();
  });
});

describe("screenItemOf", () => {
  it("hittar skärmraden när den ligger först", () => {
    const subscription = subscriptionWith([
      { id: "si_screens", price: SCREENS, quantity: 3 },
      { id: "si_payroll", price: PAYROLL },
    ]);

    expect(screenItemOf(subscription)?.id).toBe("si_screens");
    expect(screenItemOf(subscription)?.quantity).toBe(3);
  });

  it("hittar skärmraden när MODULEN ligger först", () => {
    // Det här är hela skälet att funktionen finns. Stripe garanterar ingen
    // ordning, och den gamla koden hade svarat med löneunderlaget: kvantitet
    // 1, alltså en licens för en kund som betalar för tre.
    const subscription = subscriptionWith([
      { id: "si_payroll", price: PAYROLL },
      { id: "si_screens", price: SCREENS, quantity: 3 },
    ]);

    expect(screenItemOf(subscription)?.id).toBe("si_screens");
    expect(screenItemOf(subscription)?.quantity).toBe(3);
  });

  it("klarar en prenumeration med bara skärmraden", () => {
    const subscription = subscriptionWith([
      { id: "si_screens", price: SCREENS, quantity: 2 },
    ]);

    expect(screenItemOf(subscription)?.id).toBe("si_screens");
  });

  it("faller tillbaka på raden som inte är en modul när artikeln bytts", () => {
    // Byts skärmartikeln hos Stripe känner priceRole inte längre igen den
    // gamla, men gamla prenumerationer ligger kvar på den. Deras licensantal
    // får inte plötsligt bli modulens kvantitet.
    const subscription = subscriptionWith([
      { id: "si_payroll", price: PAYROLL },
      { id: "si_gammal", price: "price_utgangen_artikel", quantity: 4 },
    ]);

    expect(screenItemOf(subscription)?.id).toBe("si_gammal");
    expect(screenItemOf(subscription)?.quantity).toBe(4);
  });

  it("läser intervallet från skärmraden och inte från modulraden", () => {
    // En årsprenumeration där modulraden av något skäl står som månad ska
    // ändå läsas som år. Intervallet styr vilket pris som visas.
    const subscription = subscriptionWith([
      { id: "si_payroll", price: PAYROLL, interval: "month" },
      { id: "si_screens", price: SCREENS_YEAR, quantity: 1, interval: "year" },
    ]);

    expect(screenItemOf(subscription)?.price?.recurring?.interval).toBe("year");
  });
});

describe("moduleItemsOf", () => {
  it("plockar ut modulerna med sina rad-id", () => {
    const subscription = subscriptionWith([
      { id: "si_screens", price: SCREENS, quantity: 2 },
      { id: "si_payroll", price: PAYROLL_YEAR },
    ]);

    expect(moduleItemsOf(subscription)).toEqual([
      { key: "PAYROLL", itemId: "si_payroll" },
    ]);
  });

  it("svarar tomt när inga tillval ligger på prenumerationen", () => {
    const subscription = subscriptionWith([
      { id: "si_screens", price: SCREENS, quantity: 1 },
    ]);

    expect(moduleItemsOf(subscription)).toEqual([]);
  });

  it("räknar inte en okänd artikel som en modul", () => {
    // En rad vi inte känner igen får aldrig tolkas som ett tillval. Gjorde
    // den det skulle synkningen slå på en modul kunden inte köpt.
    const subscription = subscriptionWith([
      { id: "si_screens", price: SCREENS, quantity: 1 },
      { id: "si_okand", price: "price_nagot_vi_inte_kanner" },
    ]);

    expect(moduleItemsOf(subscription)).toEqual([]);
  });
});
