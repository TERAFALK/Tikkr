import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import { forCompany } from "@/lib/tenant";
import { deleteCompany, PlatformActionError } from "@/lib/platform-admin";
import { customerOrders, OrderError, placeOrder } from "@/lib/shop/orders";
import { listProducts } from "@/lib/shop/products";
import { deleteProduct, ProductError } from "@/lib/shop/product-admin";
import { deliverEventEmail, deliverPendingForOrder } from "@/lib/shop/notify";
import {
  addShopNote,
  changeShopStatus,
  getShopOrder,
  setShopPayment,
  setShopShipping,
  ShopActionError,
} from "@/lib/shop/admin";
import { validateProfile, emptyProfile, type CleanProfile } from "@/lib/shop/profile";

/**
 * BESTÄLLNINGAR I BUTIKEN, FRÅN KASSAN TILL LEVERANSEN.
 *
 * Det som måste hålla:
 *   pris, moms och total räknas på servern ur produkten
 *   en dold produkt går inte att beställa, och en beställd går inte att ta bort
 *   en beställning med bara tjänster bär ingen märkning och skriver inte
 *     över företagets sparade fakturaadress
 *   samma formulär två gånger ger en beställning
 *   en beställning bär sina uppgifter och sitt pris, och ändras inte av att
 *     företagets uppgifter eller priset ändras efteråt
 *   kund A ser aldrig kund B:s beställningar, och ingen kund ser anteckningarna
 *   varje statusbyte prövas mot läget det utgår från, och ger ett mejl
 *   samma besked går inte ut två gånger
 *   betalstatusen kräver fakturanummer och datum
 */

const PLATFORM = "vi@tikkr.se";

let companyA: string;
let companyB: string;
let keyCounter = 0;

/**
 * Testets egna produkter, med slumpade nycklar. Databasen kan redan ha
 * stämplingsskärmen från migrationen, och testerna ska varken bero på den
 * eller ändra den.
 */
let PRODUCT: string;
let SERVICE: string;

function key(): string {
  keyCounter += 1;
  return `test-key-${Date.now()}-${keyCounter}-abcdef`;
}

function profile(overrides: Partial<CleanProfile> = {}): CleanProfile {
  const { clean } = validateProfile(
    {
      values: {
        ...emptyProfile(),
        orgNumber: "556677-8899",
        contactName: "Anna Andersson",
        orderEmail: "inkop@verkstad.se",
        phone: "0701234567",
        addressLine: "Industrigatan 4",
        postalCode: "46130",
        city: "Trollhättan",
      },
      separateBilling: false,
    },
    { requireForOrder: true }
  );
  return { ...clean!, ...overrides };
}

async function order(
  companyId = companyA,
  options: {
    quantity?: number;
    items?: { productKey: string; quantity: number }[];
    saveProfile?: boolean;
    idempotencyKey?: string;
    profile?: CleanProfile;
  } = {}
) {
  return placeOrder({
    db: forCompany(companyId),
    companyId,
    companyName: "Verkstaden AB",
    actorEmail: "agare@verkstad.se",
    idempotencyKey: options.idempotencyKey ?? key(),
    items: options.items ?? [{ productKey: PRODUCT, quantity: options.quantity ?? 2 }],
    profile: options.profile ?? profile(),
    saveProfile: options.saveProfile ?? false,
  });
}

let previousAppUrl: string | undefined;

beforeAll(() => {
  // Länken i mejlen byggs ur APP_URL. Utan den går inget mejl ut, med flit.
  previousAppUrl = process.env.APP_URL;
  process.env.APP_URL = "https://test.tikkr.se";
});

afterAll(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

beforeEach(async () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  companyA = (await unsafeGlobalPrisma.company.create({ data: { name: `Butik A ${suffix}` } })).id;
  companyB = (await unsafeGlobalPrisma.company.create({ data: { name: `Butik B ${suffix}` } })).id;

  PRODUCT = `TESTSKARM_${suffix.toUpperCase()}`;
  SERVICE = `TESTKURS_${suffix.toUpperCase()}`;

  await unsafeGlobalPrisma.shopProduct.createMany({
    data: [
      {
        key: PRODUCT,
        slug: `testskarm-${suffix}`,
        kind: "GOODS",
        name: "Stämplingsskärm",
        summary: "Test.",
        priceOre: 2_490_000,
        delivery: "Beräknad leveranstid 3–4 veckor.",
        inShop: true,
        updatedByEmail: PLATFORM,
      },
      {
        key: SERVICE,
        slug: `testkurs-${suffix}`,
        kind: "SERVICE",
        name: "Utbildning",
        summary: "Test.",
        priceOre: 450_000,
        inShop: true,
        updatedByEmail: PLATFORM,
      },
    ],
  });
});

afterEach(async () => {
  const ids = [companyA, companyB];
  await unsafeGlobalPrisma.shopProduct.deleteMany({ where: { key: { in: [PRODUCT, SERVICE] } } });
  await unsafeGlobalPrisma.platformAuditLog.deleteMany({ where: { actorEmail: PLATFORM, targetCompanyId: null } });
  await unsafeGlobalPrisma.shopOrderNote.deleteMany({ where: { targetCompanyId: { in: ids } } });
  await unsafeGlobalPrisma.platformAuditLog.deleteMany({ where: { targetCompanyId: { in: ids } } });
  await unsafeGlobalPrisma.company.deleteMany({ where: { id: { in: ids } } });
});

describe("beställningsnumret", () => {
  /**
   * STARTVÄRDET LIGGER I MIGRATIONEN, och testas där.
   *
   * `scripts/test.sh` och en lokal testdatabas byggs med `db push`, som inte
   * kör migrationerna. Schemat kan inte uttrycka ett startvärde, så talet 1001
   * fanns bara i databaser byggda med `migrate deploy`, och samma test föll
   * beroende på var det kördes. Produktionen byggs alltid med migrationerna.
   */
  it("börjar på 1001 i produktionen", () => {
    const root = path.resolve(__dirname, "..", "prisma", "migrations");
    const migrations = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFileSync(path.join(root, entry.name, "migration.sql"), "utf8")
      )
      .join("\n");

    expect(migrations).toContain(
      'ALTER SEQUENCE "shop_orders_number_seq" RESTART WITH 1001;'
    );
  });
});

describe("att beställa", () => {
  it("räknar raderna, momsen och totalen ur prislistan", async () => {
    const { orderId, number, created } = await order();
    expect(created).toBe(true);
    expect(number).toBeGreaterThan(0);

    const saved = await getShopOrder(orderId);
    expect(saved).toMatchObject({
      companyId: companyA,
      status: "RECEIVED",
      paymentStatus: "NOT_INVOICED",
      goodsOre: 4_980_000,
      shippingOre: null,
      vatOre: 1_245_000,
      totalOre: 6_225_000,
      orgNumber: "556677-8899",
      email: "inkop@verkstad.se",
      phone: "+46701234567",
    });
    expect(saved!.lines).toHaveLength(1);
    expect(saved!.lines[0]).toMatchObject({ quantity: 2, unitPriceOre: 2_490_000, vatRatePercent: 25 });
    expect(saved!.events).toHaveLength(1);
    expect(saved!.events[0]).toMatchObject({ kind: "CREATED", toStatus: "RECEIVED", emailState: "PENDING" });
  });

  it("samma formulär två gånger ger en beställning", async () => {
    const idempotencyKey = key();
    const first = await order(companyA, { idempotencyKey });
    const second = await order(companyA, { idempotencyKey });

    expect(second).toEqual({ ...first, created: false });
    expect(await unsafeGlobalPrisma.shopOrder.count({ where: { companyId: companyA } })).toBe(1);
  });

  it("två samtidiga anrop med samma nyckel ger en beställning", async () => {
    const idempotencyKey = key();
    const [a, b] = await Promise.all([
      order(companyA, { idempotencyKey }),
      order(companyA, { idempotencyKey }),
    ]);

    expect(a.orderId).toBe(b.orderId);
    expect(await unsafeGlobalPrisma.shopOrder.count({ where: { companyId: companyA } })).toBe(1);
  });

  it("samma nyckel hos ett annat företag är en annan beställning", async () => {
    const idempotencyKey = key();
    const a = await order(companyA, { idempotencyKey });
    const b = await order(companyB, { idempotencyKey });
    expect(a.orderId).not.toBe(b.orderId);
  });

  it("avvisar noll skärmar och en trasig nyckel", async () => {
    await expect(order(companyA, { quantity: 0 })).rejects.toThrow(OrderError);
    await expect(order(companyA, { idempotencyKey: "kort" })).rejects.toThrow(OrderError);
  });

  it("sparar uppgifterna för nästa gång bara när det valts", async () => {
    await order(companyA, { saveProfile: false });
    expect(await forCompany(companyA).companyProfile.findFirst()).toBeNull();

    await order(companyA, { saveProfile: true });
    const saved = await forCompany(companyA).companyProfile.findFirst();
    expect(saved).toMatchObject({ orgNumber: "556677-8899", city: "Trollhättan" });
  });

  it("en senare ändring av företagets uppgifter rör inte beställningen", async () => {
    const { orderId } = await order(companyA, { saveProfile: true });

    await forCompany(companyA).companyProfile.update({
      where: { companyId: companyA },
      data: { city: "Vänersborg", addressLine: "Nya vägen 1" },
    });

    const saved = await getShopOrder(orderId);
    expect(saved).toMatchObject({ city: "Trollhättan", addressLine: "Industrigatan 4" });
  });

  it("ett nytt pris gäller nya beställningar, aldrig lagda", async () => {
    const before = await order(companyA, { quantity: 1 });

    await unsafeGlobalPrisma.shopProduct.update({
      where: { key: PRODUCT },
      data: { priceOre: 2_690_000 },
    });
    expect((await listProducts("shop")).find((p) => p.key === PRODUCT)?.priceOre).toBe(2_690_000);

    const after = await order(companyA, { quantity: 1 });

    expect((await getShopOrder(before.orderId))!.goodsOre).toBe(2_490_000);
    expect((await getShopOrder(after.orderId))!.goodsOre).toBe(2_690_000);
  });
});

describe("produkterna", () => {
  it("en dold produkt går inte att beställa", async () => {
    await unsafeGlobalPrisma.shopProduct.update({ where: { key: PRODUCT }, data: { inShop: false } });
    await expect(order()).rejects.toThrow(OrderError);
  });

  it("raden bär produktens typ som den var", async () => {
    const { orderId } = await order(companyA, {
      items: [
        { productKey: PRODUCT, quantity: 1 },
        { productKey: SERVICE, quantity: 2 },
      ],
    });

    const saved = (await getShopOrder(orderId))!;
    expect(saved.lines.map((line) => [line.productKey, line.productKind])).toEqual([
      [PRODUCT, "GOODS"],
      [SERVICE, "SERVICE"],
    ]);
  });

  it("en beställd produkt går inte att ta bort, en aldrig beställd går", async () => {
    await order();
    const ordered = await unsafeGlobalPrisma.shopProduct.findUniqueOrThrow({ where: { key: PRODUCT } });
    const untouched = await unsafeGlobalPrisma.shopProduct.findUniqueOrThrow({ where: { key: SERVICE } });

    await expect(deleteProduct(ordered.id, PLATFORM)).rejects.toThrow(ProductError);
    await deleteProduct(untouched.id, PLATFORM);

    expect(await unsafeGlobalPrisma.shopProduct.count({ where: { key: SERVICE } })).toBe(0);
  });
});

describe("bara tjänster", () => {
  it("bär ingen märkning eller fakturaadress, och nollar inte de sparade", async () => {
    await forCompany(companyA).companyProfile.create({
      data: {
        companyId: companyA,
        deliveryReference: "Verkstaden",
        billingAddressLine: "Box 12",
        billingPostalCode: "461 21",
        billingCity: "Trollhättan",
      },
    });

    const { orderId } = await order(companyA, {
      items: [{ productKey: SERVICE, quantity: 1 }],
      saveProfile: true,
      profile: profile({
        deliveryReference: "Ska inte med",
        billingAddressLine: "Ska inte med",
        billingPostalCode: "111 11",
        billingCity: "Stockholm",
        invoiceEmail: "faktura@verkstad.se",
      }),
    });

    const saved = (await getShopOrder(orderId))!;
    expect(saved).toMatchObject({
      reference: null,
      billingAddressLine: null,
      billingCity: null,
      addressLine: "Industrigatan 4",
      invoiceEmail: "faktura@verkstad.se",
    });

    const stored = await forCompany(companyA).companyProfile.findFirst();
    expect(stored).toMatchObject({
      deliveryReference: "Verkstaden",
      billingAddressLine: "Box 12",
      orgNumber: "556677-8899",
      invoiceEmail: "faktura@verkstad.se",
    });
  });
});

describe("e-post för faktura", () => {
  it("följer med utan separat fakturaadress och sparas på företaget", async () => {
    const { orderId } = await order(companyA, {
      saveProfile: true,
      profile: profile({ invoiceEmail: "faktura@verkstad.se" }),
    });

    expect((await getShopOrder(orderId))!).toMatchObject({
      billingAddressLine: null,
      invoiceEmail: "faktura@verkstad.se",
    });
    expect(await forCompany(companyA).companyProfile.findFirst()).toMatchObject({
      billingAddressLine: null,
      invoiceEmail: "faktura@verkstad.se",
    });
  });
});

describe("isoleringen", () => {
  it("kund A ser aldrig kund B:s beställningar", async () => {
    const { orderId } = await order(companyA);

    const b = forCompany(companyB);
    expect(await b.shopOrder.findUnique({ where: { id: orderId } })).toBeNull();
    expect(await b.shopOrderLine.findMany({ where: { orderId } })).toEqual([]);
    expect(await b.shopOrderEvent.findMany({ where: { orderId } })).toEqual([]);
    expect(await customerOrders(b)).toEqual([]);

    expect(await customerOrders(forCompany(companyA))).toHaveLength(1);
  });

  it("kund B kan inte ändra kund A:s beställning", async () => {
    const { orderId } = await order(companyA);

    const changed = await forCompany(companyB).shopOrder.updateMany({
      where: { id: orderId },
      data: { status: "DELIVERED" },
    });
    expect(changed.count).toBe(0);
  });

  it("kunden ser inte vem hos oss som ändrade något, och inte anteckningarna", async () => {
    const { orderId } = await order(companyA);
    await addShopNote({ orderId, body: "Ring innan leverans.", actorEmail: PLATFORM });
    await changeShopStatus({ orderId, from: "RECEIVED", to: "CONFIRMED", message: null, actorEmail: PLATFORM });

    const [seen] = await customerOrders(forCompany(companyA));
    expect(JSON.stringify(seen)).not.toContain(PLATFORM);
    expect(JSON.stringify(seen)).not.toContain("Ring innan leverans");
    expect(seen.events.map((event) => event.toStatus)).toEqual(["RECEIVED", "CONFIRMED"]);
  });
});

describe("mejlen", () => {
  it("orderbekräftelsen går ut en gång", async () => {
    const { orderId } = await order();
    const [event] = (await getShopOrder(orderId))!.events;

    expect(await deliverEventEmail(event.id)).toBe("sent");
    expect(await deliverEventEmail(event.id)).toBe("none");

    const after = (await getShopOrder(orderId))!.events[0];
    expect(after.emailState).toBe("SENT");
    expect(after.emailedAt).not.toBeNull();
  });

  it("samma besked går inte ut två gånger, även om läget nås igen", async () => {
    const { orderId } = await order();

    await changeShopStatus({ orderId, from: "RECEIVED", to: "CONFIRMED", message: null, actorEmail: PLATFORM });
    await deliverPendingForOrder(orderId);
    await changeShopStatus({ orderId, from: "CONFIRMED", to: "PROBLEM", message: "Vi saknar ett nätverksuttag på ritningen.", actorEmail: PLATFORM });
    await deliverPendingForOrder(orderId);
    await changeShopStatus({ orderId, from: "PROBLEM", to: "CONFIRMED", message: null, actorEmail: PLATFORM });
    await deliverPendingForOrder(orderId);

    const confirmed = (await getShopOrder(orderId))!.events.filter(
      (event) => event.kind === "STATUS" && event.toStatus === "CONFIRMED"
    );
    expect(confirmed.map((event) => event.emailState).sort()).toEqual(["SENT", "SKIPPED"]);
  });

  it("lägen utan kundrelevans skickar inget", async () => {
    const { orderId } = await order();
    await changeShopStatus({ orderId, from: "RECEIVED", to: "READY", message: null, actorEmail: PLATFORM });

    const ready = (await getShopOrder(orderId))!.events.find((event) => event.toStatus === "READY");
    expect(ready!.emailState).toBeNull();
  });

  it("ett mejl som inte gick iväg lämnar beställningen orörd", async () => {
    const { orderId } = await order();
    const saved = process.env.APP_URL;
    delete process.env.APP_URL;

    try {
      await deliverPendingForOrder(orderId);
    } finally {
      process.env.APP_URL = saved;
    }

    const after = (await getShopOrder(orderId))!;
    expect(after.status).toBe("RECEIVED");
    expect(after.events[0].emailState).toBe("FAILED");
    expect(after.events[0].emailError).toMatch(/APP_URL/);

    expect(await deliverEventEmail(after.events[0].id)).toBe("sent");
  });
});

describe("plattformens ändringar", () => {
  it("prövar läget ändringen utgår från", async () => {
    const { orderId } = await order();

    await changeShopStatus({ orderId, from: "RECEIVED", to: "CONFIRMED", message: null, actorEmail: PLATFORM });
    await expect(
      changeShopStatus({ orderId, from: "RECEIVED", to: "CONFIRMED", message: null, actorEmail: PLATFORM })
    ).rejects.toThrow(ShopActionError);

    const statusEvents = (await getShopOrder(orderId))!.events.filter((event) => event.kind === "STATUS");
    expect(statusEvents).toHaveLength(1);
  });

  it("vägrar ogiltiga steg och Kräver åtgärd utan meddelande", async () => {
    const { orderId } = await order();

    await expect(
      changeShopStatus({ orderId, from: "RECEIVED", to: "RECEIVED", message: null, actorEmail: PLATFORM })
    ).rejects.toThrow(ShopActionError);
    await expect(
      changeShopStatus({ orderId, from: "RECEIVED", to: "PROBLEM", message: " ", actorEmail: PLATFORM })
    ).rejects.toThrow(ShopActionError);
  });

  it("frakten räknar om totalen, och går inte att ändra efter fakturering", async () => {
    const { orderId } = await order(companyA, { quantity: 1 });

    await setShopShipping({
      orderId,
      carrier: "DB Schenker",
      trackingUrl: "https://www.dbschenker.com/app/tracking?id=1",
      shippingOre: 45_000,
      actorEmail: PLATFORM,
    });

    let saved = (await getShopOrder(orderId))!;
    expect(saved).toMatchObject({
      shippingOre: 45_000,
      goodsOre: 2_490_000,
      vatOre: 622_500 + 11_250,
      totalOre: 2_490_000 + 45_000 + 622_500 + 11_250,
      carrier: "DB Schenker",
    });

    await expect(
      setShopShipping({ orderId, carrier: "", trackingUrl: "http://osakert.se", shippingOre: 45_000, actorEmail: PLATFORM })
    ).rejects.toThrow(ShopActionError);

    await setShopPayment({
      orderId,
      from: "NOT_INVOICED",
      to: "INVOICED",
      invoiceNumber: "10234",
      date: new Date("2026-11-02T11:00:00Z"),
      actorEmail: PLATFORM,
    });

    await expect(
      setShopShipping({ orderId, carrier: "DB Schenker", trackingUrl: "", shippingOre: 60_000, actorEmail: PLATFORM })
    ).rejects.toThrow(ShopActionError);

    saved = (await getShopOrder(orderId))!;
    expect(saved.shippingOre).toBe(45_000);
  });

  it("betalstatusen kräver fakturanummer och datum", async () => {
    const { orderId } = await order();

    await expect(
      setShopPayment({ orderId, from: "NOT_INVOICED", to: "INVOICED", invoiceNumber: "", date: new Date(), actorEmail: PLATFORM })
    ).rejects.toThrow(ShopActionError);
    await expect(
      setShopPayment({ orderId, from: "NOT_INVOICED", to: "PAID", invoiceNumber: "1", date: new Date(), actorEmail: PLATFORM })
    ).rejects.toThrow(ShopActionError);

    await setShopPayment({ orderId, from: "NOT_INVOICED", to: "INVOICED", invoiceNumber: "10234", date: new Date(), actorEmail: PLATFORM });
    await expect(
      setShopPayment({ orderId, from: "INVOICED", to: "PAID", invoiceNumber: "", date: null, actorEmail: PLATFORM })
    ).rejects.toThrow(ShopActionError);
    await setShopPayment({ orderId, from: "INVOICED", to: "PAID", invoiceNumber: "", date: new Date(), actorEmail: PLATFORM });

    const saved = (await getShopOrder(orderId))!;
    expect(saved).toMatchObject({ paymentStatus: "PAID", invoiceNumber: "10234" });
    expect(saved.paidAt).not.toBeNull();
    // Betalningen går aldrig till kunden som mejl.
    expect(saved.events.filter((event) => event.kind === "PAYMENT").every((event) => event.emailState === null)).toBe(true);
  });

  it("ett företag med en beställning på väg går inte att radera", async () => {
    await order(companyA);
    const company = await unsafeGlobalPrisma.company.findUniqueOrThrow({ where: { id: companyA } });

    await expect(
      deleteCompany({ actorEmail: PLATFORM, companyId: companyA, confirmName: company.name, reason: "Test" })
    ).rejects.toThrow(PlatformActionError);
  });

  it("ett företag med avslutade beställningar raderas med anteckningarna", async () => {
    const { orderId } = await order(companyA);
    await addShopNote({ orderId, body: "Intern.", actorEmail: PLATFORM });
    await changeShopStatus({ orderId, from: "RECEIVED", to: "CANCELED", message: null, actorEmail: PLATFORM });

    const company = await unsafeGlobalPrisma.company.findUniqueOrThrow({ where: { id: companyA } });
    await deleteCompany({ actorEmail: PLATFORM, companyId: companyA, confirmName: company.name, reason: "Test" });

    expect(await unsafeGlobalPrisma.shopOrder.count({ where: { id: orderId } })).toBe(0);
    expect(await unsafeGlobalPrisma.shopOrderNote.count({ where: { orderId } })).toBe(0);
  });
});
