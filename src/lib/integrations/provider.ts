import type { z } from "zod";

/**
 * EN INTEGRATION, SOM KODEN SER DEN.
 *
 * Varje externt system Tikkr kan anslutas till är en provider i registret
 * (providers.ts). Panelen och servern läser registret, och en ny integration
 * är därför en ny provider och inte nya sidor. Se CLAUDE.md § 3.5.
 *
 * Providern gör tre saker och inget mer: beskriver sig själv, säger vilka
 * inställningar den har, och översätter källans poster till Tikkrs form.
 * Matchning, koppling och loggning är gemensam för alla och ligger i
 * ingest-vägen, så att Visma och Fortnox aldrig kan börja koppla olika.
 */

/** 'gateway': via Tikkr Gateway hos kunden. 'oauth': Tikkr hämtar själv. */
export type ConnectionType = "gateway" | "oauth";

/** Entiteterna en integration kan synka, som de heter i API:t. */
export type EntityKey = "customers" | "orders";

export const ENTITY_KEYS: readonly EntityKey[] = ["customers", "orders"];

/**
 * En kund som källan beskriver den, i Tikkrs fält.
 *
 * Fälten är exakt de källan ÄGER (CLAUDE.md § 3.5). Påslag, rabatt,
 * anteckningar och aktiv står inte här, och kan därför inte skrivas över av en
 * synk ens av misstag.
 */
export interface NormalizedCustomer {
  name: string;
  customerNumber: string | null;
  orgNumber: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
}

/** En order som källan beskriver den. */
export interface NormalizedOrder {
  orderNumber: string;
  /** Kundens id i KÄLLAN. Ordern kopplas via kundens koppling, aldrig gissat. */
  customerExternalId: string | null;
  /** Källans egen status, som den står där. Filtreras mot inställningarna. */
  sourceStatus: string | null;
}

/**
 * Ett inställningsfält som panelen ritar.
 *
 * Schemat (zod) avgör vad som är giltigt; fältlistan avgör hur det ser ut.
 * `optionsFrom: "gateway-instances"` betyder att valen kommer från det
 * gatewayen rapporterat, till exempel vilka Visma-företag som finns.
 */
export type SettingsField =
  | {
      key: string;
      label: string;
      kind: "select";
      options?: readonly { value: string; label: string }[];
      optionsFrom?: "gateway-instances";
      help?: string;
    }
  | {
      key: string;
      label: string;
      kind: "multi-select";
      options: readonly { value: string; label: string }[];
      help?: string;
    }
  | { key: string; label: string; kind: "boolean"; help?: string };

export interface IntegrationProvider<
  Settings extends z.ZodType = z.ZodType,
> {
  /** Stabilt id, lagras i integrations.provider. Ändras aldrig. */
  id: string;
  name: string;
  /** Kort beskrivning på kortet i översikten. */
  description: string;
  /** Sökväg till logotypen under public/. */
  logo: string;
  connectionType: ConnectionType;
  /** Gatewayens källa, för 'gateway'. Samma id som ISource i gatewayen. */
  gatewaySource?: string;
  entities: readonly EntityKey[];
  settingsSchema: Settings;
  settingsFields: readonly SettingsField[];
  /**
   * Gatewayens källspecifika inställningar, ur integrationens. Det är vad
   * GET /config skickar, så att gatewayen aldrig behöver förstå Tikkrs.
   */
  sourceOptions(settings: z.infer<Settings>): {
    instanceKey: string | null;
    entities: EntityKey[];
    options: Record<string, unknown>;
  };
  /** Källans kund i Tikkrs form, eller ett fel på svenska. */
  mapCustomer(data: unknown): { ok: true; value: NormalizedCustomer } | { ok: false; error: string };
  /** Källans order i Tikkrs form, eller ett fel på svenska. */
  mapOrder(data: unknown): { ok: true; value: NormalizedOrder } | { ok: false; error: string };
  /** JSON-scheman för källans poster, så att gatewayens klient genereras. */
  recordSchemas?: Partial<Record<EntityKey, z.ZodType>>;
}
