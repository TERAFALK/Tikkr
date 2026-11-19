import type { IntegrationProvider } from "./provider";
import { vismaAdministration } from "./providers/visma-administration";

/**
 * REGISTRET ÖVER INTEGRATIONER.
 *
 * Panelen ritar ett kort per rad, och gateway-API:t slår upp källor här. En
 * ny integration är en rad till, se CLAUDE.md § 3.5.
 */
export const PROVIDERS: readonly IntegrationProvider[] = [vismaAdministration];

export function providerById(id: string): IntegrationProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Providern bakom en gatewaykälla, t.ex. "visma-administration". */
export function providerForGatewaySource(source: string): IntegrationProvider | undefined {
  return PROVIDERS.find((p) => p.connectionType === "gateway" && p.gatewaySource === source);
}
