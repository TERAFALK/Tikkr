import type { Prisma } from "@prisma/client";
import { forCompany } from "../tenant";
import type { EntityKey, IntegrationProvider } from "./provider";
import type { IngestResult, IngestStatus } from "./gateway-schema";
import { stableHash } from "./stable-hash";

/**
 * DEN GEMENSAMMA VÄGEN IN för poster från externa system.
 *
 * Både gatewayen och (med Fortnox) Tikkrs egna hämtningar från ett moln-API
 * lämnar sina poster här. Vägen är densamma för alla: rådatan sparas med sitt
 * fingeravtryck, en oförändrad post hoppas över, och providern översätter
 * resten till Tikkrs form. Se CLAUDE.md § 3.5.
 *
 * Varje post prövas för sig. En trasig post i en batch på femhundra stoppar
 * inte de andra; den får ett eget fel i svaret och i loggen.
 *
 * IDEMPOTENT: samma post två gånger hittar samma rad, eftersom raden är unik
 * per (integration, entitet, källans id).
 */

export const ENTITY_TYPE = { customers: "CUSTOMER", orders: "ORDER" } as const;

const ENTITY_LABEL: Record<EntityKey, [string, string]> = {
  customers: ["kund", "kunder"],
  orders: ["order", "ordrar"],
};

export interface IngestInput {
  companyId: string;
  integrationId: string;
  provider: IntegrationProvider;
  entity: EntityKey;
  records: readonly { externalId: string; updatedAt?: string | null; data: unknown }[];
  gatewayId?: string | null;
}

export async function ingestRecords(input: IngestInput, now = new Date()): Promise<IngestResult[]> {
  const db = forCompany(input.companyId);
  const entityType = ENTITY_TYPE[input.entity];

  const existing = await db.integrationRecord.findMany({
    where: {
      integrationId: input.integrationId,
      entityType,
      externalId: { in: input.records.map((r) => r.externalId) },
    },
    select: { externalId: true, dataHash: true },
  });
  const knownHash = new Map(existing.map((r) => [r.externalId, r.dataHash]));

  const results: IngestResult[] = [];
  for (const record of input.records) {
    const hash = stableHash(record.data);
    if (knownHash.get(record.externalId) === hash) {
      results.push({ externalId: record.externalId, status: "unchanged" });
      continue;
    }

    const mapped =
      input.entity === "customers"
        ? input.provider.mapCustomer(record.data)
        : input.provider.mapOrder(record.data);
    if (!mapped.ok) {
      results.push({ externalId: record.externalId, status: "error", message: mapped.error });
      continue;
    }

    const sourceUpdatedAt = record.updatedAt ? new Date(record.updatedAt) : null;
    await db.integrationRecord.upsert({
      where: {
        integrationId_entityType_externalId: {
          integrationId: input.integrationId,
          entityType,
          externalId: record.externalId,
        },
      },
      create: {
        companyId: input.companyId,
        integrationId: input.integrationId,
        entityType,
        externalId: record.externalId,
        data: record.data as Prisma.InputJsonValue,
        dataHash: hash,
        sourceUpdatedAt,
        receivedAt: now,
      },
      update: {
        data: record.data as Prisma.InputJsonValue,
        dataHash: hash,
        sourceUpdatedAt,
        receivedAt: now,
      },
    });
    knownHash.set(record.externalId, hash);
    results.push({ externalId: record.externalId, status: "received" });
  }

  await db.integration.update({
    where: { id: input.integrationId },
    data: { lastSyncAt: now },
  });

  const counts = countBy(results);
  const [one, many] = ENTITY_LABEL[input.entity];
  await db.integrationEvent.create({
    data: {
      companyId: input.companyId,
      integrationId: input.integrationId,
      gatewayId: input.gatewayId ?? null,
      level: counts.error ? "WARNING" : "INFO",
      message: summary(results.length, one, many, counts),
      details: {
        entity: input.entity,
        counts,
        errors: results
          .filter((r) => r.status === "error")
          .slice(0, 20)
          .map((r) => ({ externalId: r.externalId, message: r.message })),
      },
    },
  });

  return results;
}

function countBy(results: IngestResult[]): Partial<Record<IngestStatus, number>> {
  const counts: Partial<Record<IngestStatus, number>> = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

const STATUS_WORD: Partial<Record<IngestStatus, string>> = {
  received: "mottagna",
  unchanged: "oförändrade",
  created: "nya",
  updated: "uppdaterade",
  linked: "kopplade",
  pending: "i inkorgen",
  ignored: "ignorerade",
  error: "med fel",
};

function summary(
  total: number,
  one: string,
  many: string,
  counts: Partial<Record<IngestStatus, number>>
): string {
  const parts = Object.entries(counts).map(
    ([status, n]) => `${n} ${STATUS_WORD[status as IngestStatus] ?? status}`
  );
  return `Tog emot ${total} ${total === 1 ? one : many}: ${parts.join(", ")}.`;
}
