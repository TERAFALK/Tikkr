import type { CompanyDb } from "../tenant";
import type { IntegrationProvider, NormalizedCustomer, NormalizedOrder } from "./provider";
import { suggestCustomers } from "./matching";
import { PROVIDERS, providerById } from "./providers";
import { readSettings } from "./settings";
import {
  gatewayState,
  integrationStatus,
  reportedSources,
  type GatewayState,
  type IntegrationStatus,
  type ReportedSource,
} from "./status";

/**
 * Det panelen visar under Inställningar, Integrationer. Bara läsning; det
 * som ändrar står i serveråtgärderna och i mappings.ts.
 */

export interface IntegrationCard {
  provider: IntegrationProvider;
  integrationId: string | null;
  status: IntegrationStatus;
  lastSyncAt: Date | null;
}

const GATEWAY_SELECT = {
  id: true,
  machineName: true,
  version: true,
  sources: true,
  lastHeartbeatAt: true,
  lastError: true,
  registeredAt: true,
} as const;

/** Ett kort per provider, anslutna först. */
export async function integrationCards(db: CompanyDb, now = new Date()): Promise<IntegrationCard[]> {
  const rows = await db.integration.findMany({
    include: { gateway: { select: GATEWAY_SELECT }, credential: { select: { id: true } } },
  });

  return PROVIDERS.map((provider) => {
    const row = rows.find((r) => r.provider === provider.id);
    return {
      provider,
      integrationId: row?.id ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      status: integrationStatus({
        exists: Boolean(row),
        connectionType: provider.connectionType === "gateway" ? "GATEWAY" : "OAUTH",
        gatewaySource: provider.gatewaySource,
        gateway: row?.gateway ?? null,
        lastError: row?.lastError ?? null,
        hasCredential: Boolean(row?.credential),
        now,
      }),
    };
  });
}

export interface GatewayRow {
  id: string;
  machineName: string | null;
  version: string | null;
  lastHeartbeatAt: Date | null;
  lastError: string | null;
  registeredAt: Date;
  state: GatewayState;
  sources: ReportedSource[];
}

export async function gatewayRows(db: CompanyDb, now = new Date()): Promise<GatewayRow[]> {
  const gateways = await db.gateway.findMany({ select: GATEWAY_SELECT, orderBy: { registeredAt: "asc" } });
  return gateways.map((g) => ({
    ...g,
    state: gatewayState(g, now),
    sources: reportedSources(g.sources),
  }));
}

export interface MappingCounts {
  linked: number;
  pending: number;
  ignored: number;
}

export interface IntegrationDetail {
  provider: IntegrationProvider;
  integration: {
    id: string;
    gatewayId: string | null;
    lastSyncAt: Date | null;
    lastError: string | null;
    settings: Record<string, unknown>;
    createdAt: Date;
  };
  status: IntegrationStatus;
  counts: Record<"CUSTOMER" | "ORDER", MappingCounts>;
  /** Instanserna gatewayen rapporterat för källan, t.ex. Visma-företagen. */
  instances: { key: string; name: string }[];
  /** Senaste uppdraget (Synka nu, Läs om allt) och hur det gick. */
  lastCommand: {
    type: "SYNC_NOW" | "FULL_RESYNC";
    status: "PENDING" | "DONE" | "FAILED";
    result: string | null;
    createdAt: Date;
    ackedAt: Date | null;
  } | null;
}

export async function integrationDetail(
  db: CompanyDb,
  providerId: string,
  now = new Date()
): Promise<IntegrationDetail | null> {
  const provider = providerById(providerId);
  if (!provider) return null;
  const row = await db.integration.findFirst({
    where: { provider: provider.id },
    include: { gateway: { select: GATEWAY_SELECT }, credential: { select: { id: true } } },
  });
  if (!row) return null;

  const grouped = await db.integrationMapping.groupBy({
    by: ["entityType", "status"],
    where: { integrationId: row.id },
    _count: { _all: true },
  });
  const counts: IntegrationDetail["counts"] = {
    CUSTOMER: { linked: 0, pending: 0, ignored: 0 },
    ORDER: { linked: 0, pending: 0, ignored: 0 },
  };
  for (const g of grouped) {
    const key = g.status === "LINKED" ? "linked" : g.status === "PENDING" ? "pending" : "ignored";
    counts[g.entityType][key] = g._count._all;
  }

  const source = reportedSources(row.gateway?.sources).find((s) => s.id === provider.gatewaySource);
  const lastCommand = await db.gatewayCommand.findFirst({
    where: { integrationId: row.id, gatewayId: row.gatewayId ?? "" },
    orderBy: { createdAt: "desc" },
    select: { type: true, status: true, result: true, createdAt: true, ackedAt: true },
  });

  return {
    provider,
    integration: {
      id: row.id,
      gatewayId: row.gatewayId,
      lastSyncAt: row.lastSyncAt,
      lastError: row.lastError,
      settings: readSettings(provider.settingsSchema, row.settings) as Record<string, unknown>,
      createdAt: row.createdAt,
    },
    status: integrationStatus({
      exists: true,
      connectionType: row.connectionType,
      gatewaySource: provider.gatewaySource,
      gateway: row.gateway,
      lastError: row.lastError,
      hasCredential: Boolean(row.credential),
      now,
    }),
    counts,
    instances: source?.instances ?? [],
    lastCommand,
  };
}

/** Texterna för varför en post ligger i inkorgen. Koderna står i matching.ts. */
export const PENDING_REASON_TEXT: Record<string, string> = {
  suggestions: "Liknar en befintlig kund",
  "no-match": "Ingen träff",
  "org-ambiguous": "Flera kunder har samma organisationsnummer",
  "org-taken": "Kunden med samma organisationsnummer är redan kopplad",
  "number-taken": "Kundnumret finns redan",
  "customer-unlinked": "Väntar på att kunden kopplas",
  "customer-ignored": "Kunden är ignorerad",
  unlinked: "Kopplad loss",
  "order-taken": "Ordern i Tikkr är redan kopplad",
  "order-customer-conflict": "Ordern i Tikkr har en annan kund",
};

export const SUGGESTION_REASON_TEXT: Record<string, string> = {
  orgNumber: "organisationsnummer",
  name: "namn",
  email: "e-post",
  phone: "telefon",
  customerNumber: "kundnummer",
};

export type MappingView = "inkorg" | "kopplade" | "ignorerade";

export const VIEW_STATUS: Record<MappingView, "PENDING" | "LINKED" | "IGNORED"> = {
  inkorg: "PENDING",
  kopplade: "LINKED",
  ignorerade: "IGNORED",
};

export interface InboxRow {
  mappingId: string;
  externalId: string;
  status: "LINKED" | "PENDING" | "IGNORED";
  pendingReason: string | null;
  /** Posten som källan beskriver den. */
  incoming: NormalizedCustomer | null;
  /** Tikkr-kunden den är kopplad till. */
  linked: { id: string; name: string } | null;
  suggestions: { customerId: string; name: string; reasons: string[] }[];
  lastSyncedAt: Date | null;
}

/**
 * En sida av kopplingarna för kunder. Förslagen räknas för hela sidan på en
 * gång, mot företagets kunder hämtade en gång, och lagras aldrig.
 */
export async function customerMappingPage(
  db: CompanyDb,
  integrationId: string,
  provider: IntegrationProvider,
  view: MappingView,
  page: { skip: number; take: number }
): Promise<InboxRow[]> {
  const mappings = await db.integrationMapping.findMany({
    where: { integrationId, entityType: "CUSTOMER", status: VIEW_STATUS[view] },
    orderBy: [{ updatedAt: "desc" }, { externalId: "asc" }],
    skip: page.skip,
    take: page.take,
    include: { customer: { select: { id: true, name: true } } },
  });

  const records = await db.integrationRecord.findMany({
    where: { integrationId, entityType: "CUSTOMER", externalId: { in: mappings.map((m) => m.externalId) } },
    select: { externalId: true, data: true },
  });
  const recordById = new Map(records.map((r) => [r.externalId, r.data]));

  const needSuggestions = view === "inkorg" && mappings.length > 0;
  const [candidates, linked] = needSuggestions
    ? await Promise.all([
        db.customer.findMany({
          where: { active: true },
          select: { id: true, name: true, customerNumber: true, orgNumber: true, email: true, phone: true },
        }),
        db.integrationMapping.findMany({
          where: { integrationId, status: "LINKED", customerId: { not: null } },
          select: { customerId: true },
        }),
      ])
    : [[], []];
  const taken = new Set(linked.map((l) => l.customerId));
  const free = candidates.filter((c) => !taken.has(c.id));
  const nameOf = new Map(candidates.map((c) => [c.id, c.name]));

  return mappings.map((m) => {
    const mapped = recordById.has(m.externalId) ? provider.mapCustomer(recordById.get(m.externalId)) : null;
    const incoming = mapped?.ok ? mapped.value : null;
    return {
      mappingId: m.id,
      externalId: m.externalId,
      status: m.status,
      pendingReason: m.pendingReason,
      incoming,
      linked: m.customer,
      lastSyncedAt: m.lastSyncedAt,
      suggestions:
        needSuggestions && incoming
          ? suggestCustomers(incoming, free).map((s) => ({ ...s, name: nameOf.get(s.customerId) ?? "" }))
          : [],
    };
  });
}

export async function countMappings(db: CompanyDb, integrationId: string, view: MappingView): Promise<number> {
  return db.integrationMapping.count({
    where: { integrationId, entityType: "CUSTOMER", status: VIEW_STATUS[view] },
  });
}

/** Källans orderstatus i klartext. Koderna kommer från gatewayen. */
export const ORDER_STATUS_TEXT: Record<string, string> = {
  open: "Öppen",
  delivered: "Levererad",
  invoiced: "Fakturerad",
  cancelled: "Makulerad",
};

export interface OrderRow {
  mappingId: string;
  externalId: string;
  status: "LINKED" | "PENDING" | "IGNORED";
  pendingReason: string | null;
  incoming: NormalizedOrder | null;
  /** Kundens namn i källan, ur kundens rådata, när den finns. */
  customerName: string | null;
  linked: { id: string; orderNumber: string } | null;
  /** Orderns status i källan är utanför filtret, t.ex. fakturerad. */
  closedInSource: boolean;
  lastSyncedAt: Date | null;
}

export async function orderMappingPage(
  db: CompanyDb,
  integrationId: string,
  provider: IntegrationProvider,
  settings: unknown,
  view: MappingView,
  page: { skip: number; take: number }
): Promise<OrderRow[]> {
  const mappings = await db.integrationMapping.findMany({
    where: { integrationId, entityType: "ORDER", status: VIEW_STATUS[view] },
    orderBy: [{ updatedAt: "desc" }, { externalId: "asc" }],
    skip: page.skip,
    take: page.take,
    include: { order: { select: { id: true, orderNumber: true } } },
  });
  const records = await db.integrationRecord.findMany({
    where: { integrationId, entityType: "ORDER", externalId: { in: mappings.map((m) => m.externalId) } },
    select: { externalId: true, data: true },
  });
  const orderData = new Map(records.map((r) => [r.externalId, r.data]));

  const incoming = new Map(
    mappings.map((m) => {
      const mapped = orderData.has(m.externalId) ? provider.mapOrder(orderData.get(m.externalId)) : null;
      return [m.externalId, mapped?.ok ? mapped.value : null] as const;
    })
  );
  const customerIds = [...new Set([...incoming.values()].map((o) => o?.customerExternalId).filter((x): x is string => Boolean(x)))];
  const customerRecords = await db.integrationRecord.findMany({
    where: { integrationId, entityType: "CUSTOMER", externalId: { in: customerIds } },
    select: { externalId: true, data: true },
  });
  const customerName = new Map(
    customerRecords.map((r) => {
      const c = provider.mapCustomer(r.data);
      return [r.externalId, c.ok ? c.value.name : null] as const;
    })
  );

  return mappings.map((m) => {
    const order = incoming.get(m.externalId) ?? null;
    return {
      mappingId: m.id,
      externalId: m.externalId,
      status: m.status,
      pendingReason: m.pendingReason,
      incoming: order,
      customerName: order?.customerExternalId ? (customerName.get(order.customerExternalId) ?? null) : null,
      linked: m.order,
      closedInSource: order ? !provider.includeOrder(settings as never, order) : false,
      lastSyncedAt: m.lastSyncedAt,
    };
  });
}

export async function countOrderMappings(db: CompanyDb, integrationId: string, view: MappingView): Promise<number> {
  return db.integrationMapping.count({ where: { integrationId, entityType: "ORDER", status: VIEW_STATUS[view] } });
}
