import { Prisma } from "@prisma/client";
import type { CompanyDb } from "../tenant";
import type { NormalizedCustomer } from "./provider";
import { providerById } from "./providers";
import { writeCustomerFields } from "./customer-sync";
import { sourceOwnedCustomerFields, suggestCustomers, type Suggestion } from "./matching";

/**
 * DET ADMINISTRATÖREN GÖR I INKORGEN: koppla till befintlig, skapa ny,
 * ignorera, koppla loss.
 *
 * Varje åtgärd tar kopplingens id från panelen och slår upp den genom
 * företagets egen klient, så att ett id från en annan arbetsyta ger "finns
 * inte" och aldrig en ändring. Varje åtgärd loggas med vem som gjorde den.
 *
 * Panelen (serveråtgärderna) kallar requireAdmin() och assertWritable() före
 * dessa; här finns bara reglerna.
 */

export type MappingActionResult = { ok: true } | { ok: false; error: string };

interface Loaded {
  mapping: {
    id: string;
    integrationId: string;
    entityType: "CUSTOMER" | "ORDER";
    externalId: string;
    status: "LINKED" | "PENDING" | "IGNORED";
    customerId: string | null;
  };
  incoming: NormalizedCustomer;
  dataHash: string;
}

async function loadCustomerMapping(db: CompanyDb, mappingId: string): Promise<Loaded | { error: string }> {
  const mapping = await db.integrationMapping.findFirst({
    where: { id: mappingId },
    include: { integration: { select: { provider: true } } },
  });
  if (!mapping) return { error: "Posten finns inte." };
  if (mapping.entityType !== "CUSTOMER") return { error: "Posten är ingen kund." };

  const record = await db.integrationRecord.findFirst({
    where: { integrationId: mapping.integrationId, entityType: "CUSTOMER", externalId: mapping.externalId },
  });
  const provider = providerById(mapping.integration.provider);
  if (!record || !provider) return { error: "Uppgifterna från källan saknas. Synka igen." };

  const mapped = provider.mapCustomer(record.data);
  if (!mapped.ok) return { error: mapped.error };
  return { mapping, incoming: mapped.value, dataHash: record.dataHash };
}

async function log(db: CompanyDb, companyId: string, integrationId: string, message: string, actorEmail: string) {
  await db.integrationEvent.create({
    data: { companyId, integrationId, message, details: { actor: actorEmail } },
  });
}

/** Kopplar posten till en befintlig kund. Källans fält skrivs då över kundens. */
export async function linkToExistingCustomer(
  db: CompanyDb,
  input: { mappingId: string; customerId: string; actorEmail: string; now?: Date }
): Promise<MappingActionResult> {
  const loaded = await loadCustomerMapping(db, input.mappingId);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const customer = await db.customer.findFirst({ where: { id: input.customerId }, select: { id: true, name: true } });
  if (!customer) return { ok: false, error: "Kunden finns inte." };

  const taken = await db.integrationMapping.findFirst({
    where: { integrationId: loaded.mapping.integrationId, customerId: customer.id, id: { not: loaded.mapping.id } },
    select: { externalId: true },
  });
  if (taken) {
    return { ok: false, error: `${customer.name} är redan kopplad till ${taken.externalId}. Koppla loss den först.` };
  }

  await db.$transaction(async (tx) => {
    await writeCustomerFields(tx, customer.id, loaded.incoming);
    await tx.integrationMapping.update({
      where: { id: loaded.mapping.id },
      data: {
        status: "LINKED",
        customerId: customer.id,
        pendingReason: null,
        dataHash: loaded.dataHash,
        lastSyncedAt: input.now ?? new Date(),
      },
    });
  });
  await log(db, db.$companyId, loaded.mapping.integrationId,
    `${loaded.incoming.name} (${loaded.mapping.externalId}) kopplad till ${customer.name}.`, input.actorEmail);
  return { ok: true };
}

/** Skapar en ny kund ur posten och kopplar den. */
export async function createCustomerFromMapping(
  db: CompanyDb,
  input: { mappingId: string; actorEmail: string; now?: Date }
): Promise<MappingActionResult> {
  const loaded = await loadCustomerMapping(db, input.mappingId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  if (loaded.mapping.status === "LINKED") return { ok: false, error: "Posten är redan kopplad." };

  try {
    await db.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { companyId: db.$companyId, ...sourceOwnedCustomerFields(loaded.incoming) },
        select: { id: true },
      });
      await tx.integrationMapping.update({
        where: { id: loaded.mapping.id },
        data: {
          status: "LINKED",
          customerId: customer.id,
          pendingReason: null,
          dataHash: loaded.dataHash,
          lastSyncedAt: input.now ?? new Date(),
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        error: `Kundnumret ${loaded.incoming.customerNumber} finns redan. Koppla posten till den kunden i stället.`,
      };
    }
    throw error;
  }
  await log(db, db.$companyId, loaded.mapping.integrationId,
    `${loaded.incoming.name} (${loaded.mapping.externalId}) skapad som ny kund.`, input.actorEmail);
  return { ok: true };
}

/** Ignorerar posten. Den synkas inte längre, och går att ångra med Koppla loss. */
export async function ignoreMapping(
  db: CompanyDb,
  input: { mappingId: string; actorEmail: string }
): Promise<MappingActionResult> {
  const mapping = await db.integrationMapping.findFirst({ where: { id: input.mappingId } });
  if (!mapping) return { ok: false, error: "Posten finns inte." };
  await db.integrationMapping.update({
    where: { id: mapping.id },
    data: { status: "IGNORED", customerId: null, orderId: null, pendingReason: null },
  });
  await log(db, db.$companyId, mapping.integrationId, `${mapping.externalId} ignoreras.`, input.actorEmail);
  return { ok: true };
}

/**
 * Kopplar loss posten och lägger den i inkorgen. Den kopplas inte automatiskt
 * igen: någon har sagt att kopplingen var fel. Kunden i Tikkr står kvar orörd.
 */
export async function unlinkMapping(
  db: CompanyDb,
  input: { mappingId: string; actorEmail: string }
): Promise<MappingActionResult> {
  const mapping = await db.integrationMapping.findFirst({ where: { id: input.mappingId } });
  if (!mapping) return { ok: false, error: "Posten finns inte." };
  await db.integrationMapping.update({
    where: { id: mapping.id },
    data: { status: "PENDING", customerId: null, orderId: null, pendingReason: "unlinked" },
  });
  await log(db, db.$companyId, mapping.integrationId, `${mapping.externalId} kopplad loss.`, input.actorEmail);
  return { ok: true };
}

/** Förslagen för en post i inkorgen, räknade nu och aldrig lagrade. */
export async function suggestionsForMapping(db: CompanyDb, mappingId: string): Promise<Suggestion[]> {
  const loaded = await loadCustomerMapping(db, mappingId);
  if ("error" in loaded) return [];
  const linked = await db.integrationMapping.findMany({
    where: { integrationId: loaded.mapping.integrationId, status: "LINKED", customerId: { not: null } },
    select: { customerId: true },
  });
  const taken = new Set(linked.map((m) => m.customerId));
  const candidates = await db.customer.findMany({
    select: { id: true, name: true, customerNumber: true, orgNumber: true, email: true, phone: true },
  });
  return suggestCustomers(loaded.incoming, candidates.filter((c) => !taken.has(c.id)));
}
