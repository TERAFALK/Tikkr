import { Prisma } from "@prisma/client";
import type { CompanyDb } from "../tenant";
import type { NormalizedCustomer } from "./provider";
import type { IngestStatus } from "./gateway-schema";
import {
  decideCustomer,
  normalizeCustomerNumber,
  orgNumberMatches,
  sourceOwnedCustomerFields,
  suggestCustomers,
  type CandidateCustomer,
  type PendingReason,
} from "./matching";

/**
 * KUNDERNAS VÄG IN, efter att rådatan sparats (ingest.ts).
 *
 * Reglerna står i matching.ts. Här görs de: kopplingen skrivs, kunden skapas
 * eller uppdateras, eller posten läggs i inkorgen. Varje post i en egen
 * transaktion, så att en post som faller inte tar andra med sig.
 */

/** Det kundvägen behöver av databasklienten. Både klienten och en transaktion duger. */
type Db = Pick<CompanyDb, "customer" | "integrationMapping">;

export interface CustomerBatchContext {
  db: CompanyDb;
  companyId: string;
  integrationId: string;
  source: string;
  createCustomers: boolean;
  now: Date;
  /** Kopplingarna för batchens poster, per källans id. */
  mappings: Map<string, { id: string; status: "LINKED" | "PENDING" | "IGNORED"; customerId: string | null; pendingReason: string | null }>;
  /** Tikkr-kunder som redan är kopplade i den här integrationen. */
  linkedHere: Set<string>;
  /** Företagets kunder, hämtade första gången de behövs. */
  candidates: () => Promise<CandidateCustomer[]>;
}

export async function customerBatchContext(input: {
  db: CompanyDb;
  companyId: string;
  integrationId: string;
  source: string;
  createCustomers: boolean;
  externalIds: string[];
  now: Date;
}): Promise<CustomerBatchContext> {
  const { db } = input;
  const [mappings, linked] = await Promise.all([
    db.integrationMapping.findMany({
      where: { integrationId: input.integrationId, entityType: "CUSTOMER", externalId: { in: input.externalIds } },
      select: { id: true, externalId: true, status: true, customerId: true, pendingReason: true },
    }),
    db.integrationMapping.findMany({
      where: { integrationId: input.integrationId, entityType: "CUSTOMER", status: "LINKED", customerId: { not: null } },
      select: { customerId: true },
    }),
  ]);

  let cache: CandidateCustomer[] | null = null;
  return {
    ...input,
    mappings: new Map(mappings.map((m) => [m.externalId, m])),
    linkedHere: new Set(linked.map((m) => m.customerId!)),
    candidates: async () => {
      cache ??= await db.customer.findMany({
        select: { id: true, name: true, customerNumber: true, orgNumber: true, email: true, phone: true },
      });
      return cache;
    },
  };
}

export interface ApplyResult {
  status: IngestStatus;
  message?: string;
}

/** En kund från källan: uppdatera, koppla, skapa eller lägg i inkorgen. */
export async function applyCustomer(
  ctx: CustomerBatchContext,
  externalId: string,
  incoming: NormalizedCustomer,
  dataHash: string
): Promise<ApplyResult> {
  const mapping = ctx.mappings.get(externalId);

  if (mapping?.status === "IGNORED") {
    await ctx.db.integrationMapping.update({
      where: { id: mapping.id },
      data: { dataHash, lastSyncedAt: ctx.now },
    });
    return { status: "ignored" };
  }

  if (mapping?.status === "LINKED" && mapping.customerId) {
    const message = await writeCustomerFields(ctx.db, mapping.customerId, incoming);
    await ctx.db.integrationMapping.update({
      where: { id: mapping.id },
      data: { dataHash, lastSyncedAt: ctx.now },
    });
    return { status: "updated", message };
  }

  const candidates = await ctx.candidates();
  const number = normalizeCustomerNumber(incoming.customerNumber);
  const decision = decideCustomer({
    orgMatches: orgNumberMatches(incoming, candidates),
    suggestions: suggestCustomers(incoming, candidates),
    linkedHere: ctx.linkedHere,
    createCustomers: ctx.createCustomers,
    numberTaken: number !== null && candidates.some((c) => normalizeCustomerNumber(c.customerNumber) === number),
    automatic: mapping?.pendingReason !== "unlinked",
  });

  if (decision.action === "pending") {
    await saveMapping(ctx, externalId, { status: "PENDING", customerId: null, pendingReason: decision.reason, dataHash });
    return { status: "pending", message: decision.reason };
  }

  try {
    return await ctx.db.$transaction(async (db) => {
      let customerId: string;
      let message: string | undefined;
      if (decision.action === "link") {
        customerId = decision.customerId;
        message = await writeCustomerFields(db, customerId, incoming);
      } else {
        const created = await db.customer.create({
          data: { companyId: ctx.companyId, ...sourceOwnedCustomerFields(incoming) },
          select: { id: true, name: true, customerNumber: true, orgNumber: true, email: true, phone: true },
        });
        customerId = created.id;
        (await ctx.candidates()).push(created);
      }
      await saveMapping({ ...ctx, db }, externalId, { status: "LINKED", customerId, pendingReason: null, dataHash });
      ctx.linkedHere.add(customerId);
      return { status: decision.action === "link" ? "linked" : "created", message } satisfies ApplyResult;
    });
  } catch (error) {
    // En annan körning hann koppla samma kund, eller ta samma kundnummer.
    // Posten hamnar i inkorgen i stället för att gissa.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const reason: PendingReason = decision.action === "create" ? "number-taken" : "org-taken";
      await saveMapping(ctx, externalId, { status: "PENDING", customerId: null, pendingReason: reason, dataHash });
      return { status: "pending", message: reason };
    }
    throw error;
  }
}

async function saveMapping(
  ctx: Pick<CustomerBatchContext, "companyId" | "integrationId" | "source" | "now" | "mappings"> & { db: Db },
  externalId: string,
  data: { status: "LINKED" | "PENDING"; customerId: string | null; pendingReason: string | null; dataHash: string }
) {
  const saved = await ctx.db.integrationMapping.upsert({
    where: {
      integrationId_entityType_externalId: { integrationId: ctx.integrationId, entityType: "CUSTOMER", externalId },
    },
    create: {
      companyId: ctx.companyId,
      integrationId: ctx.integrationId,
      source: ctx.source,
      entityType: "CUSTOMER",
      externalId,
      ...data,
      lastSyncedAt: ctx.now,
    },
    update: { ...data, lastSyncedAt: ctx.now },
    select: { id: true, status: true, customerId: true, pendingReason: true },
  });
  ctx.mappings.set(externalId, saved);
}

/**
 * Skriver källans fält på en kund. Kundnumret skrivs bara om ingen annan
 * kund har det; annars står det kvar, och svaret säger varför.
 */
export async function writeCustomerFields(
  db: Db,
  customerId: string,
  incoming: NormalizedCustomer
): Promise<string | undefined> {
  const fields = sourceOwnedCustomerFields(incoming);
  let message: string | undefined;

  if (fields.customerNumber) {
    const holder = await db.customer.findFirst({
      where: { customerNumber: fields.customerNumber, id: { not: customerId } },
      select: { id: true },
    });
    if (holder) {
      const { customerNumber: _skip, ...rest } = fields;
      await db.customer.updateMany({ where: { id: customerId }, data: rest });
      message = `Kundnumret ${fields.customerNumber} finns redan på en annan kund och skrevs inte över.`;
      return message;
    }
  }

  await db.customer.updateMany({ where: { id: customerId }, data: fields });
  return message;
}
