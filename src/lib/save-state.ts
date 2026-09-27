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
  /** Tidpunkten för en lyckad sparning. */
  savedAt?: number;
  /** Besked när "Sparat" är för tunt. */
  ok?: string;
}

export function saved(ok?: string): SaveState {
  return { savedAt: Date.now(), ok };
}
