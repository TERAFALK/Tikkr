import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { moduleItemsOf, priceRole, screenItemOf } from "@/lib/stripe";
import type { PriceBook } from "@/lib/price-book";

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
 * Funktionerna tar prisboken som argument och läser ingenting själva. Det är
 * därför testet kan skriva upp en bok och jämföra, utan databas, utan
 * Stripe-konto och utan att peta i miljövariabler.
 */

const SCREEN_MONTH = "price_screen_month";
const SCREEN_YEAR = "price_screen_year";
const PAYROLL_MONTH = "price_payroll_month";
const PAYROLL_YEAR = "price_payroll_year";
const PLANNING_MONTH = "price_planning_month";
const PLANNING_YEAR = "price_planning_year";

const BOOK: PriceBook = {
  screen: { month: SCREEN_MONTH, year: SCREEN_YEAR },
  modules: {
    PAYROLL: { month: PAYROLL_MONTH, year: PAYROLL_YEAR },
    PLANNING: { month: PLANNING_MONTH, year: PLANNING_YEAR },
  },
};

/** Minsta möjliga prenumeration med de rader testet bryr sig om. */
function subscriptionWith(
  rows: {
    id: string;
    price: string;
    quantity?: number;
    interval?: "month" | "year";
  }[]
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
    expect(priceRole(BOOK, SCREEN_MONTH)).toEqual({ kind: "SCREENS" });
    expect(priceRole(BOOK, SCREEN_YEAR)).toEqual({ kind: "SCREENS" });
  });

  it("känner igen modulartikeln i båda intervallen", () => {
    expect(priceRole(BOOK, PAYROLL_MONTH)).toEqual({
      kind: "MODULE",
      key: "PAYROLL",
    });
    expect(priceRole(BOOK, PAYROLL_YEAR)).toEqual({
      kind: "MODULE",
      key: "PAYROLL",
    });
  });

  it("svarar null på ett okänt pris och på inget pris", () => {
    expect(priceRole(BOOK, "price_nagot_annat")).toBeNull();
    expect(priceRole(BOOK, undefined)).toBeNull();
    expect(priceRole(BOOK, null)).toBeNull();
  });

  it("matchar inte på en artikel som saknas i boken", () => {
    // Utan årsartikel för modulen ska månadsartikeln fortfarande hittas, och
    // ingenting ska råka matcha på undefined.
    const utan: PriceBook = {
      screen: { month: SCREEN_MONTH },
      modules: {
        PAYROLL: { month: PAYROLL_MONTH },
        PLANNING: { month: PLANNING_MONTH },
      },
    };

    expect(priceRole(utan, PAYROLL_MONTH)).toEqual({
      kind: "MODULE",
      key: "PAYROLL",
    });
    expect(priceRole(utan, undefined)).toBeNull();
    expect(priceRole(utan, SCREEN_YEAR)).toBeNull();
  });
});

describe("screenItemOf", () => {
  it("hittar skärmraden när den ligger först", () => {
    const subscription = subscriptionWith([
      { id: "si_screen", price: SCREEN_MONTH, quantity: 3 },
      { id: "si_payroll", price: PAYROLL_MONTH },
    ]);

    expect(screenItemOf(BOOK, subscription)?.id).toBe("si_screen");
    expect(screenItemOf(BOOK, subscription)?.quantity).toBe(3);
  });

  it("hittar skärmraden när MODULEN ligger först", () => {
    // Det här är hela skälet att funktionen finns. Stripe garanterar ingen
    // ordning, och den gamla koden hade svarat med löneunderlaget: kvantitet
    // 1, alltså en licens för en kund som betalar för tre.
    const subscription = subscriptionWith([
      { id: "si_payroll", price: PAYROLL_MONTH },
      { id: "si_screen", price: SCREEN_MONTH, quantity: 3 },
    ]);

    expect(screenItemOf(BOOK, subscription)?.id).toBe("si_screen");
    expect(screenItemOf(BOOK, subscription)?.quantity).toBe(3);
  });

  it("hittar skärmraden med BÅDA modulerna framför sig", () => {
    // Med två tillval går det inte längre att hoppas på att skärmraden ligger
    // bland de första. Uppslaget sker på pris-id, och antalet rader före den
    // ska inte spela någon roll alls.
    const subscription = subscriptionWith([
      { id: "si_planning", price: PLANNING_MONTH },
      { id: "si_payroll", price: PAYROLL_MONTH },
      { id: "si_screen", price: SCREEN_MONTH, quantity: 3 },
    ]);

    expect(screenItemOf(BOOK, subscription)?.id).toBe("si_screen");
    expect(screenItemOf(BOOK, subscription)?.quantity).toBe(3);
  });

  it("klarar en prenumeration med bara skärmraden", () => {
    const subscription = subscriptionWith([
      { id: "si_screen", price: SCREEN_MONTH, quantity: 2 },
    ]);

    expect(screenItemOf(BOOK, subscription)?.id).toBe("si_screen");
  });

  it("faller tillbaka på raden som inte är en modul när artikeln bytts", () => {
    // Byts skärmartikeln känner boken inte längre igen den gamla, men gamla
    // prenumerationer ligger kvar på den. Deras licensantal får inte
    // plötsligt bli modulens kvantitet.
    const subscription = subscriptionWith([
      { id: "si_payroll", price: PAYROLL_MONTH },
      { id: "si_gammal", price: "price_utgangen_artikel", quantity: 4 },
    ]);

    expect(screenItemOf(BOOK, subscription)?.id).toBe("si_gammal");
    expect(screenItemOf(BOOK, subscription)?.quantity).toBe(4);
  });

  it("läser intervallet från skärmraden och inte från modulraden", () => {
    // En årsprenumeration där modulraden av något skäl står som månad ska
    // ändå läsas som år. Intervallet styr vilket pris som visas.
    const subscription = subscriptionWith([
      { id: "si_payroll", price: PAYROLL_MONTH, interval: "month" },
      { id: "si_screen", price: SCREEN_YEAR, quantity: 1, interval: "year" },
    ]);

    expect(screenItemOf(BOOK, subscription)?.price?.recurring?.interval).toBe(
      "year"
    );
  });
});

describe("moduleItemsOf", () => {
  it("plockar ut modulerna med sina rad-id", () => {
    const subscription = subscriptionWith([
      { id: "si_screen", price: SCREEN_MONTH, quantity: 2 },
      { id: "si_payroll", price: PAYROLL_YEAR },
    ]);

    expect(moduleItemsOf(BOOK, subscription)).toEqual([
      { key: "PAYROLL", itemId: "si_payroll" },
    ]);
  });

  it("skiljer de två modulerna från varandra", () => {
    // Två moduler med fyra artiklar mellan sig. Blandas de ihop får kunden en
    // modul de inte köpt och förlorar en de betalar för, och ingenting i
    // gränssnittet skulle säga vilket.
    const subscription = subscriptionWith([
      { id: "si_planning", price: PLANNING_MONTH },
      { id: "si_screen", price: SCREEN_MONTH, quantity: 2 },
      { id: "si_payroll", price: PAYROLL_YEAR },
    ]);

    expect(moduleItemsOf(BOOK, subscription)).toEqual([
      { key: "PLANNING", itemId: "si_planning" },
      { key: "PAYROLL", itemId: "si_payroll" },
    ]);
  });

  it("svarar tomt när inga tillval ligger på prenumerationen", () => {
    const subscription = subscriptionWith([
      { id: "si_screen", price: SCREEN_MONTH, quantity: 1 },
    ]);

    expect(moduleItemsOf(BOOK, subscription)).toEqual([]);
  });

  it("räknar inte en okänd artikel som en modul", () => {
    // En rad vi inte känner igen får aldrig tolkas som ett tillval. Gjorde
    // den det skulle synkningen slå på en modul kunden inte köpt.
    const subscription = subscriptionWith([
      { id: "si_screen", price: SCREEN_MONTH, quantity: 1 },
      { id: "si_okand", price: "price_nagot_vi_inte_kanner" },
    ]);

    expect(moduleItemsOf(BOOK, subscription)).toEqual([]);
  });
});
