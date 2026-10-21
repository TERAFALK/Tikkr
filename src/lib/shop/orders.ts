import type { CompanyDb } from "../tenant";
import { listProducts } from "./products";
import {
  needsDelivery,
  orderTotals,
  priceLines,
  PricingError,
  type RequestedItem,
} from "./pricing";
import type { CleanProfile } from "./profile";

/**
 * KUNDENS SIDA AV EN BESTÄLLNING: att lägga den och att läsa sina egna.
 *
 * Allt går genom kundens företagslåsta klient, så att en beställning bara
 * kan skapas för och läsas av det inloggade företaget. Plattformens sida, som
 * ändrar status och betalning, ligger i admin.ts.
 *
 * PRIS, MOMS OCH TOTAL KOMMER ALDRIG FRÅN FORMULÄRET. Anroparen lämnar
 * produktnycklar och antal, och produkterna slås upp i listProducts() här, i
 * samma anrop som beställningen skapas.
 */

export class OrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderError";
  }
}

/** Formuläret sätter ett slumpat id. Allt annat avvisas. */
const KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

/**
 * Lägger en beställning.
 *
 * SAMMA FORMULÄR TVÅ GÅNGER GER EN BESTÄLLNING. Nyckeln sattes när
 * formuläret ritades och är unik per företag i databasen. Kommer den igen,
 * efter ett dubbeltryck eller en omladdning, lämnas den första beställningen
 * tillbaka i stället för att en ny skapas. Två anrop i exakt samma ögonblick
 * stoppas av det unika indexet, och det som förlorar läser den andras rad.
 *
 * Uppgifterna kopieras till beställningen. `saveProfile` skriver dem dessutom
 * till företagets uppgifter, för nästa gång. Utan den rörs de sparade
 * uppgifterna inte.
 */
export async function placeOrder(params: {
  db: CompanyDb;
  companyId: string;
  companyName: string;
  actorEmail: string;
  idempotencyKey: string;
  items: RequestedItem[];
  profile: CleanProfile;
  saveProfile: boolean;
}): Promise<{ orderId: string; number: number; created: boolean }> {
  const { db, companyId, profile } = params;

  if (!KEY_PATTERN.test(params.idempotencyKey)) {
    throw new OrderError("Formuläret är för gammalt. Ladda om sidan och försök igen.");
  }

  const existing = await findByKey(db, params.idempotencyKey);
  if (existing) return { ...existing, created: false };

  let lines;
  try {
    lines = priceLines(params.items, await listProducts("shop"));
  } catch (error) {
    if (error instanceof PricingError) throw new OrderError(error.message);
    throw error;
  }

  if (lines.length === 0) throw new OrderError("Välj minst en produkt.");

  for (const field of REQUIRED) {
    if (!profile[field]) throw new OrderError("Fyll i leveransuppgifterna.");
  }

  const totals = orderTotals(lines, null);

  // Utan något att skicka finns ingen märkning och ingen separat
  // fakturaadress: adressen ÄR fakturaadressen. Se validateProfile.
  const delivery = needsDelivery(lines);
  const snapshot: CleanProfile = delivery
    ? profile
    : {
        ...profile,
        deliveryReference: null,
        billingAddressLine: null,
        billingPostalCode: null,
        billingCity: null,
        invoiceEmail: null,
      };

  // Det som sparas till företaget. Utan leverans skrivs bara kontakt och
  // adress, så att en sparad märkning eller fakturaadress inte nollas av en
  // beställning som aldrig frågade efter dem.
  const toSave: Partial<CleanProfile> = delivery
    ? profile
    : {
        orgNumber: profile.orgNumber,
        contactName: profile.contactName,
        orderEmail: profile.orderEmail,
        phone: profile.phone,
        addressLine: profile.addressLine,
        postalCode: profile.postalCode,
        city: profile.city,
      };

  try {
    const order = await db.$transaction(async (tx) => {
      const created = await tx.shopOrder.create({
        data: {
          companyId,
          idempotencyKey: params.idempotencyKey,
          placedByEmail: params.actorEmail,
          companyName: params.companyName,
          orgNumber: profile.orgNumber!,
          contactName: profile.contactName!,
          email: profile.orderEmail!,
          phone: profile.phone!,
          addressLine: profile.addressLine!,
          postalCode: profile.postalCode!,
          city: profile.city!,
          reference: snapshot.deliveryReference,
          billingAddressLine: snapshot.billingAddressLine,
          billingPostalCode: snapshot.billingPostalCode,
          billingCity: snapshot.billingCity,
          invoiceEmail: snapshot.invoiceEmail,
          goodsOre: totals.goodsOre,
          shippingOre: null,
          vatOre: totals.vatOre,
          totalOre: totals.totalOre,
          lines: {
            create: lines.map((line) => ({ ...line, companyId })),
          },
          events: {
            create: [
              {
                companyId,
                kind: "CREATED",
                toStatus: "RECEIVED",
                actorEmail: params.actorEmail,
                emailState: "PENDING",
              },
            ],
          },
        },
        select: { id: true, number: true },
      });

      if (params.saveProfile) {
        await tx.companyProfile.upsert({
          where: { companyId },
          create: { companyId, ...toSave },
          update: { ...toSave },
        });
      }

      return created;
    });

    return { orderId: order.id, number: order.number, created: true };
  } catch (error) {
    // Ett anrop till med samma nyckel hann före. Dess beställning är svaret.
    if ((error as { code?: string } | null)?.code === "P2002") {
      const winner = await findByKey(db, params.idempotencyKey);
      if (winner) return { ...winner, created: false };
    }
    throw error;
  }
}

const REQUIRED: (keyof CleanProfile)[] = [
  "orgNumber",
  "contactName",
  "orderEmail",
  "phone",
  "addressLine",
  "postalCode",
  "city",
];

async function findByKey(
  db: CompanyDb,
  idempotencyKey: string
): Promise<{ orderId: string; number: number } | null> {
  const row = await db.shopOrder.findFirst({
    where: { idempotencyKey },
    select: { id: true, number: true },
  });

  return row ? { orderId: row.id, number: row.number } : null;
}

/**
 * Företagets beställningar, nyast först, så som kunden ska se dem.
 *
 * Urvalet är uttryckligt. Historiken lämnar ut läget, tiden och meddelandet
 * till kunden, aldrig vem hos oss som ändrade något eller betalningens
 * rader. Interna anteckningar ligger i en annan tabell och nås inte härifrån.
 */
export async function customerOrders(db: CompanyDb) {
  return db.shopOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      number: true,
      status: true,
      paymentStatus: true,
      placedByEmail: true,
      contactName: true,
      email: true,
      addressLine: true,
      postalCode: true,
      city: true,
      reference: true,
      goodsOre: true,
      shippingOre: true,
      vatOre: true,
      totalOre: true,
      carrier: true,
      trackingUrl: true,
      createdAt: true,
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          productKey: true,
          productKind: true,
          name: true,
          quantity: true,
          unitPriceOre: true,
          subtotalOre: true,
        },
      },
      events: {
        where: { kind: { in: ["CREATED", "STATUS"] } },
        orderBy: { createdAt: "asc" },
        select: { toStatus: true, customerMessage: true, createdAt: true },
      },
    },
  });
}

export type CustomerOrder = Awaited<ReturnType<typeof customerOrders>>[number];
