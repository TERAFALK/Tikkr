import { Prisma } from "@prisma/client";
import type { CompanyDb } from "../tenant";
import type { IntegrationProvider, NormalizedOrder } from "./provider";
import type { IngestStatus } from "./gateway-schema";
import { decideOrder, type OrderCustomer } from "./matching";
import { readSettings } from "./settings";

/**
 * ORDRARNAS VÄG IN, efter kunderna (CLAUDE.md § 3.5).
 *
 * En order kopplas till kund via kundens koppling i samma integration. Saknar
 * kunden koppling väntar ordern i inkorgen, och släpps av
 * releaseWaitingOrders() när kunden kopplats. Systemet gissar aldrig.
 *
 * En kopplad order STÄNGS ALDRIG av en synk, inte ens när den fakturerats
 * eller makulerats i källan: någon kan stå instämplad på den. Källans status
 * står i rådatan och visas i panelen.
 */

type Db = Pick<CompanyDb, "order" | "integrationMapping">;

export interface OrderContext {
  db: CompanyDb;
  companyId: string;
  integrationId: string;
  source: string;
  provider: IntegrationProvider;
  settings: unknown;
  now: Date;
}

export async function orderContext(input: Omit<OrderContext, "settings">): Promise<OrderContext> {
  const integration = await input.db.integration.findFirstOrThrow({
    where: { id: input.integrationId },
    select: { settings: true },
  });
  return { ...input, settings: readSettings(input.provider.settingsSchema, integration.settings) };
}

export interface ApplyResult {
  status: IngestStatus;
  message?: string;
}

async function customerOf(db: Db, integrationId: string, externalId: string | null): Promise<OrderCustomer> {
  if (!externalId) return { state: "none" };
  const mapping = await db.integrationMapping.findFirst({
    where: { integrationId, entityType: "CUSTOMER", externalId },
    select: { status: true, customerId: true },
  });
  if (mapping?.status === "LINKED" && mapping.customerId) return { state: "linked", customerId: mapping.customerId };
  if (mapping?.status === "IGNORED") return { state: "ignored" };
  // Kunden har inte kommit än, eller ligger i inkorgen.
  return { state: "pending" };
}

/** En order från källan: uppdatera, koppla, skapa, lägg i inkorgen eller hoppa över. */
export async function applyOrder(
  ctx: OrderContext,
  externalId: string,
  incoming: NormalizedOrder,
  dataHash: string
): Promise<ApplyResult> {
  const { db } = ctx;
  const mapping = await db.integrationMapping.findFirst({
    where: { integrationId: ctx.integrationId, entityType: "ORDER", externalId },
    select: { id: true, status: true, orderId: true, pendingReason: true },
  });

  if (mapping?.status === "IGNORED") {
    await db.integrationMapping.update({ where: { id: mapping.id }, data: { dataHash, lastSyncedAt: ctx.now } });
    return { status: "ignored" };
  }

  const customer = await customerOf(db, ctx.integrationId, incoming.customerExternalId);

  if (mapping?.status === "LINKED" && mapping.orderId) {
    const message = await writeOrderFields(db, mapping.orderId, incoming, customer);
    await db.integrationMapping.update({ where: { id: mapping.id }, data: { dataHash, lastSyncedAt: ctx.now } });
    return { status: "updated", message };
  }

  const included = ctx.provider.includeOrder(ctx.settings as never, incoming);
  const existing = await db.order.findFirst({
    where: { orderNumber: incoming.orderNumber },
    select: { id: true, customerId: true },
  });
  const linkedHere = existing
    ? (await db.integrationMapping.count({ where: { integrationId: ctx.integrationId, orderId: existing.id } })) > 0
    : false;

  const decision = decideOrder({
    included,
    customer,
    existing: existing ? { ...existing, linkedHere } : null,
    automatic: mapping?.pendingReason !== "unlinked",
  });

  if (decision.action === "skip") {
    // Utanför filtret. En order som väntade och nu t.ex. fakturerats tas ur
    // inkorgen; rådatan står kvar om den kommer tillbaka.
    if (mapping) await db.integrationMapping.delete({ where: { id: mapping.id } });
    return { status: "ignored", message: "Utanför filtret" };
  }

  if (decision.action === "pending") {
    await saveOrderMapping(ctx, externalId, { status: "PENDING", orderId: null, pendingReason: decision.reason, dataHash });
    return { status: "pending", message: decision.reason };
  }

  try {
    return await db.$transaction(async (tx) => {
      let orderId: string;
      if (decision.action === "link") {
        orderId = decision.orderId;
        // Ett snabbjobb från skärmen som källan nu bekräftar är granskat: numret
        // och kunden kommer från affärssystemet.
        await tx.order.updateMany({
          where: { id: orderId },
          data: { customerId: decision.customerId, isQuickJob: false },
        });
      } else {
        const created = await tx.order.create({
          data: { companyId: ctx.companyId, orderNumber: incoming.orderNumber, customerId: decision.customerId },
          select: { id: true },
        });
        orderId = created.id;
      }
      await saveOrderMapping({ ...ctx, db: tx }, externalId, { status: "LINKED", orderId, pendingReason: null, dataHash });
      return { status: decision.action === "link" ? "linked" : "created" } satisfies ApplyResult;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await saveOrderMapping(ctx, externalId, { status: "PENDING", orderId: null, pendingReason: "order-taken", dataHash });
      return { status: "pending", message: "order-taken" };
    }
    throw error;
  }
}

async function saveOrderMapping(
  ctx: Pick<OrderContext, "companyId" | "integrationId" | "source" | "now"> & { db: Db },
  externalId: string,
  data: { status: "LINKED" | "PENDING"; orderId: string | null; pendingReason: string | null; dataHash: string }
) {
  await ctx.db.integrationMapping.upsert({
    where: { integrationId_entityType_externalId: { integrationId: ctx.integrationId, entityType: "ORDER", externalId } },
    create: {
      companyId: ctx.companyId,
      integrationId: ctx.integrationId,
      source: ctx.source,
      entityType: "ORDER",
      externalId,
      ...data,
      lastSyncedAt: ctx.now,
    },
    update: { ...data, lastSyncedAt: ctx.now },
  });
}

/**
 * Källans fält på en kopplad order: numret, om ingen annan order har det, och
 * kunden, om kundens koppling finns. En kund som inte längre är kopplad tar
 * aldrig bort kunden från ordern; det vore en gissning åt andra hållet.
 */
async function writeOrderFields(
  db: Db,
  orderId: string,
  incoming: NormalizedOrder,
  customer: OrderCustomer
): Promise<string | undefined> {
  const data: { orderNumber?: string; customerId?: string } = {};
  let message: string | undefined;

  const holder = await db.order.findFirst({
    where: { orderNumber: incoming.orderNumber, id: { not: orderId } },
    select: { id: true },
  });
  if (holder) message = `Ordernumret ${incoming.orderNumber} finns redan på en annan order och skrevs inte över.`;
  else data.orderNumber = incoming.orderNumber;

  if (customer.state === "linked") data.customerId = customer.customerId;

  await db.order.updateMany({ where: { id: orderId }, data });
  return message;
}

/**
 * Släpper ordrar som väntat på sina kunder, när kunderna kopplats. Läser
 * rådatan som redan finns, så att ingenting behöver hämtas från källan igen.
 *
 * @param customerExternalIds Kundernas id i källan, de som nyss kopplats.
 */
export async function releaseWaitingOrders(
  ctx: OrderContext,
  customerExternalIds: ReadonlySet<string>
): Promise<number> {
  if (customerExternalIds.size === 0) return 0;
  const waiting = await ctx.db.integrationMapping.findMany({
    where: {
      integrationId: ctx.integrationId,
      entityType: "ORDER",
      status: "PENDING",
      pendingReason: { in: ["customer-unlinked", "customer-ignored"] },
    },
    select: { externalId: true },
  });
  if (waiting.length === 0) return 0;

  const records = await ctx.db.integrationRecord.findMany({
    where: { integrationId: ctx.integrationId, entityType: "ORDER", externalId: { in: waiting.map((w) => w.externalId) } },
    select: { externalId: true, data: true, dataHash: true },
  });

  let released = 0;
  for (const record of records) {
    const mapped = ctx.provider.mapOrder(record.data);
    if (!mapped.ok || !mapped.value.customerExternalId) continue;
    if (!customerExternalIds.has(mapped.value.customerExternalId)) continue;
    const result = await applyOrder(ctx, record.externalId, mapped.value, record.dataHash);
    if (result.status === "linked" || result.status === "created") released++;
  }

  if (released > 0) {
    await ctx.db.integrationEvent.create({
      data: {
        companyId: ctx.companyId,
        integrationId: ctx.integrationId,
        message: released === 1 ? "1 väntande order kopplad när kunden kopplades." : `${released} väntande ordrar kopplade när kunderna kopplades.`,
      },
    });
  }
  return released;
}
