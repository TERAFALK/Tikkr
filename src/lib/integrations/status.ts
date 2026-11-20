/**
 * STATUSEN SOM VISAS, HÄRLEDD OCH ALDRIG LAGRAD (CLAUDE.md § 3.5).
 *
 * Status räknas ur fakta som redan finns: om integrationen är tillagd, när
 * gatewayen senast hördes av, och vad den och källan rapporterat. En lagrad
 * status bredvid de fakta den bygger på hinner alltid börja säga något annat.
 */

/** Hur länge en gateway får vara tyst innan den räknas som tyst. */
export function silentAfterMinutes(): number {
  const value = Number(process.env.GATEWAY_SILENT_AFTER_MINUTES);
  return Number.isFinite(value) && value >= 2 ? value : 15;
}

export type GatewayState = "connected" | "silent" | "error";

export interface GatewayFacts {
  lastHeartbeatAt: Date | null;
  lastError: string | null;
}

export function gatewayState(gateway: GatewayFacts, now: Date, silentMinutes = silentAfterMinutes()): GatewayState {
  if (!gateway.lastHeartbeatAt || now.getTime() - gateway.lastHeartbeatAt.getTime() > silentMinutes * 60_000) {
    return "silent";
  }
  return gateway.lastError ? "error" : "connected";
}

/** Det gatewayen rapporterat om en källa, som det ligger i gateways.sources. */
export interface ReportedSource {
  id: string;
  name: string;
  version?: string | null;
  healthy: boolean;
  error?: string | null;
  instances?: { key: string; name: string }[];
  lastSuccessfulSyncAt?: string | null;
}

/** Läser gateways.sources utan att lita på formen. */
export function reportedSources(value: unknown): ReportedSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is ReportedSource =>
      typeof s === "object" && s !== null && typeof (s as ReportedSource).id === "string"
  );
}

export type IntegrationState = "not-connected" | "waiting-gateway" | "connected" | "error";

export const INTEGRATION_STATE_LABEL: Record<IntegrationState, string> = {
  "not-connected": "Inte ansluten",
  "waiting-gateway": "Väntar på gateway",
  connected: "Ansluten",
  error: "Fel",
};

export const GATEWAY_STATE_LABEL: Record<GatewayState, string> = {
  connected: "Ansluten",
  silent: "Svarar inte",
  error: "Fel",
};

export interface IntegrationStatus {
  state: IntegrationState;
  /** Varför, när det inte är Ansluten. Svensk text att visa. */
  reason: string | null;
}

/**
 * Integrationens status.
 *
 * För en gateway-integration: utan gateway väntar den, en tyst gateway är ett
 * fel, och gatewayens eller källans eget fel är ett fel. Annars gäller
 * integrationens senaste fel, från en synk.
 */
export function integrationStatus(input: {
  exists: boolean;
  connectionType: "GATEWAY" | "OAUTH";
  gatewaySource?: string;
  gateway: (GatewayFacts & { sources: unknown }) | null;
  lastError: string | null;
  hasCredential?: boolean;
  now: Date;
  silentMinutes?: number;
}): IntegrationStatus {
  if (!input.exists) return { state: "not-connected", reason: null };

  if (input.connectionType === "OAUTH") {
    if (!input.hasCredential) return { state: "not-connected", reason: null };
    return input.lastError ? { state: "error", reason: input.lastError } : { state: "connected", reason: null };
  }

  if (!input.gateway) return { state: "waiting-gateway", reason: null };

  const gateway = gatewayState(input.gateway, input.now, input.silentMinutes);
  if (gateway === "silent") {
    return { state: "error", reason: "Gatewayen svarar inte. Kontrollera att tjänsten Tikkr Gateway körs på servern." };
  }

  const source = reportedSources(input.gateway.sources).find((s) => s.id === input.gatewaySource);
  if (!source) {
    return { state: "error", reason: "Gatewayen kan inte läsa systemet. Uppdatera Tikkr Gateway på servern." };
  }
  if (!source.healthy) return { state: "error", reason: source.error ?? "Systemet går inte att läsa." };
  if (input.gateway.lastError) return { state: "error", reason: input.gateway.lastError };
  if (input.lastError) return { state: "error", reason: input.lastError };
  return { state: "connected", reason: null };
}
