import { describe, it, expect } from "vitest";
import { priceForOrder, type PriceInput } from "@/lib/order-price";

/**
 * Priset mot kund.
 *
 * Tre ställen kan bestämma påslaget och ett fjärde kan sätta priset rakt av.
 * Blir ordningen fel står ett belopp på en faktura som ingen kommit överens
 * om — och det upptäcks inte genom att läsa koden, utan genom att en kund
 * ringer.
 *
 * Behöver ingen databas.
 */

function input(overrides: Partial<PriceInput> = {}): PriceInput {
  return {
    costOre: 1000000, // 10 000 kr
    orderMarkupPercent: null,
    customerMarkupPercent: null,
    companyMarkupPercent: 140,
    customerDiscountPercent: null,
    fixedPriceOre: null,
    ...overrides,
  };
}

describe("påslaget: order före kund före företag", () => {
  it("företagets standard när inget annat finns", () => {
    const price = priceForOrder(input());

    expect(price.markupPercent).toBe(140);
    expect(price.markupSource).toBe("company");
    expect(price.priceOre).toBe(1400000);
  });

  it("kundens påslag går före företagets", () => {
    const price = priceForOrder(input({ customerMarkupPercent: 130 }));

    expect(price.markupPercent).toBe(130);
    expect(price.markupSource).toBe("customer");
    expect(price.priceOre).toBe(1300000);
  });

  it("orderns påslag går före kundens", () => {
    // Det specifika vinner över det allmänna. Har någon förhandlat en enskild
    // order gäller den siffran.
    const price = priceForOrder(
      input({ orderMarkupPercent: 120, customerMarkupPercent: 130 })
    );

    expect(price.markupPercent).toBe(120);
    expect(price.markupSource).toBe("order");
  });

  it("noll som påslag är ett värde, inte ett saknat", () => {
    // Nollkontroll och inte sanningskontroll. `?? ` och inte `||` — annars
    // hade ett påslag på noll tyst fallit tillbaka på företagets.
    const price = priceForOrder(
      input({ customerMarkupPercent: 0, companyMarkupPercent: 140 })
    );

    expect(price.markupPercent).toBe(0);
    expect(price.priceOre).toBe(0);
  });
});

describe("rabatten dras av EFTER påslaget", () => {
  it("tio procent på ett påslaget pris", () => {
    // 10 000 × 1,40 = 14 000, minus tio procent = 12 600.
    // Drogs rabatten före påslaget hade svaret blivit 12 600 också — men bara
    // för att båda är procent. Med olika tal skiljer de sig, se nästa fall.
    const price = priceForOrder(input({ customerDiscountPercent: 10 }));

    expect(price.priceBeforeDiscountOre).toBe(1400000);
    expect(price.discountOre).toBe(140000);
    expect(price.priceOre).toBe(1260000);
  });

  it("rabatten räknas på priset, inte på kostnaden", () => {
    // Kostnad 10 000, påslag 1,40, rabatt 25 %.
    // Efter påslaget: 14 000 − 3 500 = 10 500.
    // Före påslaget hade det blivit 7 500 × 1,40 = 10 500 … samma igen.
    // Skillnaden syns i RABATTBELOPPET, som står på kundens underlag:
    // 3 500 kr mot 2 500 kr. Det är den siffran kunden läser.
    const price = priceForOrder(input({ customerDiscountPercent: 25 }));

    expect(price.discountOre).toBe(350000);
    expect(price.priceOre).toBe(1050000);
  });

  it("ingen rabatt ger noll, inte null", () => {
    const price = priceForOrder(input());

    expect(price.discountPercent).toBeNull();
    expect(price.discountOre).toBe(0);
    expect(price.priceOre).toBe(price.priceBeforeDiscountOre);
  });

  it("noll procents rabatt behandlas som ingen rabatt", () => {
    // Skrivs noll in i fältet ska underlaget inte få en rad som säger
    // "Rabatt 0 %  −0,00 kr".
    const price = priceForOrder(input({ customerDiscountPercent: 0 }));

    expect(price.discountPercent).toBeNull();
    expect(price.discountOre).toBe(0);
  });

  it("de tre talen går ihop på öret", () => {
    // Underlaget skriver ut alla tre. Den som kontrollräknar för hand ska få
    // det att stämma, annars är det talen man slutar lita på.
    const price = priceForOrder(
      input({ costOre: 333333, customerDiscountPercent: 7 })
    );

    expect(price.priceBeforeDiscountOre - price.discountOre).toBe(
      price.priceOre
    );
  });
});

describe("fast pris går före allt", () => {
  it("påslaget används inte", () => {
    const price = priceForOrder(
      input({ fixedPriceOre: 735000, companyMarkupPercent: 140 })
    );

    expect(price.priceOre).toBe(735000);
    expect(price.isFixed).toBe(true);
  });

  it("rabatten tillämpas inte på ett avtalat pris", () => {
    // Det avtalade beloppet ÄR vad kunden ska betala. Att dra av tio procent
    // till vore att ge bort något man redan kommit överens om.
    const price = priceForOrder(
      input({ fixedPriceOre: 735000, customerDiscountPercent: 10 })
    );

    expect(price.priceOre).toBe(735000);
    expect(price.discountOre).toBe(0);
    expect(price.discountPercent).toBeNull();
  });

  it("påslaget rapporteras ändå, för kalkylens skull", () => {
    // Kalkylen visar inte påslaget på en fastprisorder, men vet varifrån det
    // skulle ha kommit. Talet ska vara rätt även när det inte används.
    const price = priceForOrder(
      input({ fixedPriceOre: 735000, customerMarkupPercent: 130 })
    );

    expect(price.markupPercent).toBe(130);
    expect(price.markupSource).toBe("customer");
  });

  it("noll kronor som fast pris är ett pris, inte ett saknat", () => {
    // En garantiorder. Priset är noll, och påslaget får inte smyga in.
    const price = priceForOrder(input({ fixedPriceOre: 0 }));

    expect(price.priceOre).toBe(0);
    expect(price.isFixed).toBe(true);
  });
});

describe("avrundning", () => {
  it("rabatten avrundas till helt öre", () => {
    // 1 000 × 1,40 = 1 400 ören, 3 % = 42 ören jämnt.
    expect(priceForOrder(input({ costOre: 1000, customerDiscountPercent: 3 })).discountOre).toBe(42);
  });

  it("ett halvt öre rundas uppåt", () => {
    // 1 001 × 1,40 = 1 401,4 → 1 401 ören. 50 % = 700,5 → 701.
    const price = priceForOrder(
      input({ costOre: 1001, customerDiscountPercent: 50 })
    );

    expect(price.priceBeforeDiscountOre).toBe(1401);
    expect(price.discountOre).toBe(701);
    expect(price.priceOre).toBe(700);
  });

  it("kostnad noll ger pris noll, inte ett fel", () => {
    // En order utan timkostnader. Kalkylen redovisar den som saknat underlag;
    // priset ska ändå vara ett tal.
    const price = priceForOrder(
      input({ costOre: 0, customerDiscountPercent: 10 })
    );

    expect(price.priceBeforeDiscountOre).toBe(0);
    expect(price.discountOre).toBe(0);
    expect(price.priceOre).toBe(0);
  });
});
