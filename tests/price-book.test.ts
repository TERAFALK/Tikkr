import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  PRICE_ITEMS,
  SCREEN_ITEM,
  priceBook,
  priceEnvName,
  priceFromEnv,
  setStoredPrice,
} from "@/lib/price-book";
import { MODULE_KEYS } from "@/lib/modules";

/**
 * VILKEN KÄLLA SOM VINNER FÖR ETT ARTIKELNUMMER.
 *
 * Numren finns på två ställen: i databasen, satta i plattformspanelen, och i
 * miljövariabler som reserv. Det som betyder något är ordningen, och att ett
 * tomt fält i panelen faller tillbaka i stället för att stänga av
 * betalningen.
 *
 * Använder databasen. Städar efter sig.
 */

const ENV_KEYS = [
  "STRIPE_PRICE_SCREEN_MONTH",
  "STRIPE_PRICE_SCREEN_YEAR",
  "STRIPE_PRICE_PAYROLL_MONTH",
  "STRIPE_PRICE_PAYROLL_YEAR",
  "STRIPE_PRICE_ID",
  "STRIPE_PRICE_ID_YEARLY",
  "STRIPE_PRICE_ID_PAYROLL",
  "STRIPE_PRICE_ID_PAYROLL_YEARLY",
];

const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }

  await unsafeGlobalPrisma.stripePrice.deleteMany({});
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }

  await unsafeGlobalPrisma.stripePrice.deleteMany({});
});

describe("variabelnamnen", () => {
  it("bildas ur nyckeln och följer ett mönster", () => {
    // Namnen glider isär om de skrivs ut var för sig, vilket är precis vad som
    // hände förut: skärmpriset hette STRIPE_PRICE_ID och löneunderlaget
    // STRIPE_PRICE_ID_PAYROLL.
    expect(priceEnvName(SCREEN_ITEM, "month")).toBe("STRIPE_PRICE_SCREEN_MONTH");
    expect(priceEnvName(SCREEN_ITEM, "year")).toBe("STRIPE_PRICE_SCREEN_YEAR");
    expect(priceEnvName("PAYROLL", "month")).toBe("STRIPE_PRICE_PAYROLL_MONTH");
    expect(priceEnvName("PAYROLL", "year")).toBe("STRIPE_PRICE_PAYROLL_YEAR");
  });

  it("täcker skärmlicensen och varje modul", () => {
    expect(PRICE_ITEMS).toContain(SCREEN_ITEM);

    for (const key of MODULE_KEYS) {
      expect(PRICE_ITEMS).toContain(key);
    }
  });
});

describe("miljön som reserv", () => {
  it("läser det nya namnet", () => {
    process.env.STRIPE_PRICE_SCREEN_MONTH = "price_nytt";

    expect(priceFromEnv(SCREEN_ITEM, "month")).toBe("price_nytt");
  });

  it("läser det GAMLA namnet när det nya saknas", () => {
    // En .env som redan är i drift ska fungera oförändrad. Att kräva att någon
    // byter namn i en fil på en server för att kunna deploya är en onödig risk
    // för ingenting.
    process.env.STRIPE_PRICE_ID = "price_gammalt";

    expect(priceFromEnv(SCREEN_ITEM, "month")).toBe("price_gammalt");
  });

  it("låter det nya namnet vinna över det gamla", () => {
    process.env.STRIPE_PRICE_ID = "price_gammalt";
    process.env.STRIPE_PRICE_SCREEN_MONTH = "price_nytt";

    expect(priceFromEnv(SCREEN_ITEM, "month")).toBe("price_nytt");
  });

  it("svarar undefined när ingen av dem finns", () => {
    expect(priceFromEnv(SCREEN_ITEM, "month")).toBeUndefined();
    expect(priceFromEnv("PAYROLL", "year")).toBeUndefined();
  });
});

describe("priceBook", () => {
  it("tar värdet ur miljön när databasen är tom", async () => {
    process.env.STRIPE_PRICE_SCREEN_MONTH = "price_env";

    const book = await priceBook();

    expect(book.screen.month).toBe("price_env");
    expect(book.screen.year).toBeUndefined();
  });

  it("låter databasen vinna över miljön", async () => {
    process.env.STRIPE_PRICE_SCREEN_MONTH = "price_env";

    await setStoredPrice({
      item: SCREEN_ITEM,
      month: "price_databas",
      year: null,
      actorEmail: "test@tikkr.se",
    });

    expect((await priceBook()).screen.month).toBe("price_databas");
  });

  it("faller tillbaka på miljön för ett fält som lämnats tomt", async () => {
    // Den som sätter månadspriset i panelen men lämnar året tomt ska inte
    // därmed stänga av årsbetalningen som redan fungerade.
    process.env.STRIPE_PRICE_SCREEN_YEAR = "price_env_ar";

    await setStoredPrice({
      item: SCREEN_ITEM,
      month: "price_databas",
      year: null,
      actorEmail: "test@tikkr.se",
    });

    const book = await priceBook();

    expect(book.screen.month).toBe("price_databas");
    expect(book.screen.year).toBe("price_env_ar");
  });

  it("håller modulernas artiklar skilda från skärmens", async () => {
    await setStoredPrice({
      item: SCREEN_ITEM,
      month: "price_skarm",
      year: null,
      actorEmail: "test@tikkr.se",
    });

    await setStoredPrice({
      item: "PAYROLL",
      month: "price_lon",
      year: "price_lon_ar",
      actorEmail: "test@tikkr.se",
    });

    const book = await priceBook();

    expect(book.screen.month).toBe("price_skarm");
    expect(book.modules.PAYROLL.month).toBe("price_lon");
    expect(book.modules.PAYROLL.year).toBe("price_lon_ar");
  });

  it("har en post för varje modul även utan rad i databasen", async () => {
    const book = await priceBook();

    for (const key of MODULE_KEYS) {
      expect(book.modules[key]).toBeDefined();
    }
  });
});

describe("setStoredPrice", () => {
  it("raderar raden när båda fälten töms", async () => {
    // En rad utan värden säger inget annat än att någon varit inne och
    // tittat, och den skulle dölja att miljön är källan.
    await setStoredPrice({
      item: SCREEN_ITEM,
      month: "price_ett",
      year: null,
      actorEmail: "test@tikkr.se",
    });

    expect(await unsafeGlobalPrisma.stripePrice.count()).toBe(1);

    await setStoredPrice({
      item: SCREEN_ITEM,
      month: "",
      year: "   ",
      actorEmail: "test@tikkr.se",
    });

    expect(await unsafeGlobalPrisma.stripePrice.count()).toBe(0);
  });

  it("trimmar bort blanktecken runt numret", async () => {
    // Ett artikelnummer klistras in, och urklipp tar ofta med ett mellanslag.
    // Ett nummer med blanksteg ger ett fel hos Stripe som inte förklarar sig.
    await setStoredPrice({
      item: SCREEN_ITEM,
      month: "  price_klistrat  ",
      year: null,
      actorEmail: "test@tikkr.se",
    });

    expect((await priceBook()).screen.month).toBe("price_klistrat");
  });
});

describe("en onåbar databas tar inte ned säljsidan", () => {
  it("uppslaget i priceBook är inbäddat i ett try", () => {
    // SÄLJSIDAN FÖRRENDERAS VID BYGGET, och då finns ingen databas. När
    // priceBook() började läsa stripe_prices slutade bygget att gå igenom:
    // "Environment variable not found: DATABASE_URL" mitt i "Generating
    // static pages".
    //
    // Fallet är inte bara ett byggfall. En databas som ligger nere ska inte
    // ta ned sidan som berättar vad tjänsten kostar, och att falla tillbaka
    // på miljön är precis vad funktionen lovar: två källor med en ordning,
    // där en källa som inte svarar räknas som tom.
    //
    // Kontrollen är på källtexten, eftersom felet bara går att framkalla
    // genom att koppla bort databasen. Den håller åtminstone skyddet kvar
    // när någon städar i filen.
    const source = readFileSync(
      path.resolve(__dirname, "../src/lib/price-book.ts"),
      "utf8"
    );

    const block = source.slice(source.indexOf("async function storedOrNothing"));

    expect(
      block,
      "storedOrNothing måste fånga fel från databasen. Utan den kraschar " +
        "bygget av säljsidan, och en nere databas tar ned sidan i drift."
    ).toMatch(/try\s*{[\s\S]*?catch/);

    expect(
      source,
      "priceBook ska gå via storedOrNothing, inte direkt på storedPrices."
    ).toMatch(/priceBook[\s\S]*?storedOrNothing\(\)/);
  });
});
