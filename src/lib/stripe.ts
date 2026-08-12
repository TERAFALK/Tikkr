import Stripe from "stripe";

/**
 * KOPPLINGEN TILL STRIPE.
 *
 * Allt som rör betalningar går genom den här filen. Resten av systemet ska
 * kunna fungera utan att Stripe är påkopplat — i labbet, och hos en kund som
 * betalar mot faktura.
 *
 * Kortuppgifter passerar aldrig vår server. Kunden fyller i dem på Stripes
 * egen sida, och vi får bara veta att det gick bra. Det är hela skälet att
 * använda deras kassa istället för att bygga ett eget formulär: kortdata vi
 * aldrig tar emot kan inte läcka från oss.
 */

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new StripeNotConfiguredError(
      "STRIPE_SECRET_KEY saknas. Betalningar är inte påkopplade."
    );
  }

  // Återanvänds mellan anrop. En ny klient per anrop skulle öppna en ny
  // anslutning varje gång.
  client ??= new Stripe(key);
  return client;
}

export function priceId(): string {
  const id = process.env.STRIPE_PRICE_ID;

  if (!id) {
    throw new StripeNotConfiguredError(
      "STRIPE_PRICE_ID saknas. Betalningar är inte påkopplade."
    );
  }

  return id;
}

export class StripeNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}

/**
 * Översätter Stripes status till vår.
 *
 * Stripe har fler lägen än vi behöver skilja på. Det som spelar roll för oss
 * är: får kunden komma åt rapporterna, ska vi varna, eller ska panelen låsas.
 *
 * `incomplete` betyder att första betalningen inte gått igenom än. Vi låser
 * inte då — kunden står oftast mitt i kassan, och att bli utlåst under tiden
 * vore absurt.
 */
export function toSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" {
  switch (stripeStatus) {
    case "active":
      return "ACTIVE";
    case "trialing":
    case "incomplete":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "CANCELED";
    default:
      return "PAST_DUE";
  }
}
