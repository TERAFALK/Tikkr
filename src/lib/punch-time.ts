import { formatDateTime } from "./format";

/**
 * TIDPUNKTEN SKÄRMEN UPPGER.
 *
 * Skärmen får bestämma när trycket skedde — det är hela poängen med
 * offline-kön. En stämpling som gjordes 07:00 utan nät ska registreras på
 * 07:00, inte på klockslaget då nätet kom tillbaka.
 *
 * Men skärmen får inte hitta på vad som helst. En tid i framtiden eller flera
 * veckor bakåt är antingen en trasig klocka eller ett försök att skriva om
 * historien, och blir i båda fallen ett felaktigt underlag — numera både för
 * fakturan och för lönen.
 *
 * TRYCKET AVVISAS ÄNDÅ ALDRIG, och det är hela poängen med den här filen.
 * Förr gav en orimlig tid 400, och offline-kön kastar allt som får 4xx. En
 * skärm med tomt klockbatteri som startat efter ett strömavbrott utan nät
 * kunde alltså radera en hel dags arbetstid, tyst, utan att någon fick veta
 * det. Nu lämnas `at` utelämnad så att servertiden gäller, och `rejectedAt`
 * sätts så att posten flaggas för granskning.
 *
 * Samma val som för en utstämpling utan angivet jobb: hellre en post någon
 * får titta på än ingen post alls. Se CLAUDE.md § 3 regel 2.
 */

/** Tillåten klockavvikelse framåt. Skärmens klocka kan gå någon minut fel. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Så gammalt ett köat tryck får vara. Äldre än så är något uppenbart fel. */
export const MAX_QUEUE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Längsta text som tas med i noten. En trasig klient kan skicka vad som helst. */
const MAX_REJECTED_LENGTH = 40;

export interface PunchTime {
  /** Tiden att registrera. Utelämnad betyder att serverns tid ska gälla. */
  at?: Date;
  /** Satt när tiden inte gick att lita på. Posten flaggas då för granskning. */
  rejectedAt?: string;
}

export function readPunchTime(
  raw: string | undefined,
  now: Date = new Date()
): PunchTime {
  if (!raw) return {};

  const claimed = new Date(raw);

  // Inget datum alls. Då är det klienten som är trasig och inte klockan, men
  // trycket är lika äkta för det — och arbetstiden lika mycket värd.
  if (Number.isNaN(claimed.getTime())) {
    return { rejectedAt: raw.slice(0, MAX_REJECTED_LENGTH) };
  }

  const drift = claimed.getTime() - now.getTime();
  if (drift > MAX_CLOCK_SKEW_MS || -drift > MAX_QUEUE_AGE_MS) {
    return { rejectedAt: formatDateTime(claimed) };
  }

  return { at: claimed };
}
