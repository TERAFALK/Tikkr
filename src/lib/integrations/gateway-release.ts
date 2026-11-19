/**
 * SENASTE VERSIONEN AV TIKKR GATEWAY, som /updates/latest pekar på.
 *
 * Står i koden och inte i en tabell, av samma skäl som nyheterna gör det
 * (CLAUDE.md § 5): en ny gateway når kunderna genom en PR, provas i labbet
 * först, och syns i granskningen. MSI:n hämtas från releasen i det privata
 * repot TERAFALK/tikkr-gateway av Tikkrs server.
 *
 * null tills den första versionen är släppt.
 */
export interface GatewayRelease {
  version: string;
  /** SHA-256 av MSI-filen, gemener. Gatewayen vägrar en fil som avviker. */
  sha256: string;
}

export const GATEWAY_RELEASE: GatewayRelease | null = null;
