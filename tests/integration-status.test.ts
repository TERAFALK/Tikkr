import { describe, it, expect } from "vitest";
import { gatewayState, integrationStatus } from "@/lib/integrations/status";

/**
 * STATUSEN I PANELEN, härledd ur gatewayens senaste kontakt och rapport.
 * Ingen rad i databasen säger "Ansluten"; därför prövas härledningen här.
 */

const now = new Date("2026-11-19T10:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const healthy = [{ id: "visma-administration", name: "Visma", healthy: true, instances: [] }];

const base = {
  exists: true,
  connectionType: "GATEWAY" as const,
  gatewaySource: "visma-administration",
  lastError: null,
  now,
  silentMinutes: 15,
};

describe("gatewayen", () => {
  it("är ansluten inom gränsen och tyst efter", () => {
    expect(gatewayState({ lastHeartbeatAt: minutesAgo(14), lastError: null }, now, 15)).toBe("connected");
    expect(gatewayState({ lastHeartbeatAt: minutesAgo(16), lastError: null }, now, 15)).toBe("silent");
    expect(gatewayState({ lastHeartbeatAt: null, lastError: null }, now, 15)).toBe("silent");
  });

  it("har fel när den rapporterar ett", () => {
    expect(gatewayState({ lastHeartbeatAt: minutesAgo(1), lastError: "Disken full" }, now, 15)).toBe("error");
  });
});

describe("integrationen", () => {
  it("som inte är tillagd är ej ansluten", () => {
    expect(integrationStatus({ ...base, exists: false, gateway: null }).state).toBe("not-connected");
  });

  it("utan gateway väntar", () => {
    expect(integrationStatus({ ...base, gateway: null }).state).toBe("waiting-gateway");
  });

  it("med frisk gateway och källa är ansluten", () => {
    const gateway = { lastHeartbeatAt: minutesAgo(1), lastError: null, sources: healthy };
    expect(integrationStatus({ ...base, gateway })).toEqual({ state: "connected", reason: null });
  });

  it("med tyst gateway har fel, och säger vad man gör", () => {
    const gateway = { lastHeartbeatAt: minutesAgo(60), lastError: null, sources: healthy };
    const status = integrationStatus({ ...base, gateway });
    expect(status.state).toBe("error");
    expect(status.reason).toContain("Tikkr Gateway");
  });

  it("med en källa som inte går att läsa visar källans eget fel", () => {
    const sources = [{ id: "visma-administration", name: "Visma", healthy: false, error: "Licensen för Visma Integration saknas." }];
    const gateway = { lastHeartbeatAt: minutesAgo(1), lastError: null, sources };
    expect(integrationStatus({ ...base, gateway })).toEqual({ state: "error", reason: "Licensen för Visma Integration saknas." });
  });

  it("med en gateway som saknar källan ber om en uppdatering", () => {
    const gateway = { lastHeartbeatAt: minutesAgo(1), lastError: null, sources: [] };
    expect(integrationStatus({ ...base, gateway }).reason).toContain("Uppdatera");
  });

  it("tål en trasig rapport från gatewayen", () => {
    const gateway = { lastHeartbeatAt: minutesAgo(1), lastError: null, sources: "inte en lista" };
    expect(integrationStatus({ ...base, gateway }).state).toBe("error");
  });

  it("via moln-API är ej ansluten utan nycklar", () => {
    expect(integrationStatus({ ...base, connectionType: "OAUTH", gateway: null, hasCredential: false }).state).toBe("not-connected");
    expect(integrationStatus({ ...base, connectionType: "OAUTH", gateway: null, hasCredential: true }).state).toBe("connected");
  });
});
