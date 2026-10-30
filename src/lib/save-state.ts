/**
 * Svaret från en serveråtgärd som sparar något i adminpanelen.
 *
 * Egen fil och inte en typ i varje actions-fil, så att alla formulär svarar på
 * samma sätt och `SaveForm` kan visa vilket som helst av dem.
 *
 * `savedAt` och inte `saved: true`: två sparningar efter varandra ger annars
 * samma tillstånd, och beskedet skulle inte ritas om vid den andra.
 */
export interface SaveState {
  /** Vad som är fel, skrivet så att det går att rätta. */
  error?: string;
  /** Fältet felet gäller, med sitt `name`. Se useFieldError. */
  field?: string;
  /** Tidpunkten för en lyckad sparning. */
  savedAt?: number;
  /** Besked när "Sparat" är för tunt. */
  ok?: string;
}

/**
 * True när databasen vägrat ett värde som måste vara unikt (Prismas P2002).
 *
 * Läser bara koden, så att filen inte drar in Prisma i en typ som också
 * webbläsaren läser.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

export function saved(ok?: string): SaveState {
  return { savedAt: Date.now(), ok };
}
