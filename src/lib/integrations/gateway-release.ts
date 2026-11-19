/**
 * SENASTE VERSIONEN AV TIKKR GATEWAY, som /updates/latest pekar på.
 *
 * Står i koden och inte i en tabell, av samma skäl som nyheterna gör det
 * (CLAUDE.md § 5): en ny gateway når kunderna genom en PR, provas i labbet
 * först, och syns i granskningen. MSI:n hämtas från releasen i det privata
 * repot TERAFALK/tikkr-gateway av Tikkrs server.
 *
 * Tikkr lämnar ut MSI:n (beslutat 2026-11-19, produktägarens val). Releasen
 * har också en setup.exe med Tikkrs ikon, men en MSI är det IT-avdelningar,
 * GPO och Intune förväntar sig, och en dator ska bara installeras på ett sätt.
 */
export interface GatewayRelease {
  version: string;
  /** SHA-256 av MSI-filen, gemener. Gatewayen vägrar en fil som avviker. */
  sha256: string;
}

export const GATEWAY_RELEASE: GatewayRelease | null = {
  version: "0.1.2",
  sha256: "9566b8698b38022cc18ce6a7c217d0fbc58f5cb96512b8a9ffce5f66848c7632",
};
