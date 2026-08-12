import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe, toSubscriptionStatus } from "@/lib/stripe";
import { unsafeGlobalPrisma } from "@/lib/db";

/**
 * TAR EMOT BESKED FRÅN STRIPE.
 *
 * Det är HÄR prenumerationens status sätts — inte när kunden klickar i kassan.
 * Skälet: en kund som stänger fliken mitt i betalningen har ändå betalat, och
 * en kund som ser en bekräftelsesida har inte nödvändigtvis gjort det. Stripe
 * vet, vi gissar.
 *
 * Anropet kommer från internet och måste därför bevisas komma från Stripe.
 * Signaturen räknas på den råa texten i anropet — därför läses den som text
 * och inte som JSON. Tolkas den först stämmer inte signaturen längre.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET saknas — beskedet kan inte verifieras.");
    return NextResponse.json({ error: "Ej konfigurerad." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Saknar signatur." }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    // Utan giltig signatur kan vem som helst påstå att en kund betalat.
    console.error("Ogiltig signatur på Stripe-besked", error);
    return NextResponse.json({ error: "Ogiltig signatur." }, { status: 400 });
  }

  try {
    await handle(event);
  } catch (error) {
    // Ett fel här gör att Stripe skickar om beskedet senare, vilket är rätt
    // beteende — hellre en försening än en tappad statusändring.
    console.error(`Kunde inte hantera ${event.type}`, error);
    return NextResponse.json({ error: "Fel vid hantering." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const companyId = session.client_reference_id ?? session.metadata?.companyId;

      if (!companyId) {
        console.error("Kassabesked utan företags-id", session.id);
        return;
      }

      await unsafeGlobalPrisma.company.update({
        where: { id: companyId },
        data: {
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : undefined,
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : undefined,
        },
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const companyId = await findCompanyId(subscription);
      if (!companyId) return;

      const status = toSubscriptionStatus(subscription.status);

      await unsafeGlobalPrisma.company.update({
        where: { id: companyId },
        data: {
          subscriptionStatus: status,
          stripeSubscriptionId:
            event.type === "customer.subscription.deleted"
              ? null
              : subscription.id,

          // Klockan för respiten startar när betalningen först uteblev, och
          // nollställs så fort den går igenom. Utan nollställningen skulle en
          // kund som betalat sent låsas ute nästa gång direkt.
          pastDueSince:
            status === "PAST_DUE" ? await pastDueStart(companyId) : null,
        },
      });
      return;
    }

    case "invoice.paid": {
      const companyId = await findCompanyIdByCustomer(event.data.object.customer);
      if (!companyId) return;

      await unsafeGlobalPrisma.company.update({
        where: { id: companyId },
        data: { subscriptionStatus: "ACTIVE", pastDueSince: null },
      });
      return;
    }

    case "invoice.payment_failed": {
      const companyId = await findCompanyIdByCustomer(event.data.object.customer);
      if (!companyId) return;

      await unsafeGlobalPrisma.company.update({
        where: { id: companyId },
        data: {
          subscriptionStatus: "PAST_DUE",
          pastDueSince: await pastDueStart(companyId),
        },
      });
      return;
    }

    default:
      // Stripe skickar många fler besked än vi bryr oss om. Att svara 200 på
      // dem gör att de inte köar upp och skickas om i evighet.
      return;
  }
}

/** Behåller den första tidpunkten betalningen uteblev. */
async function pastDueStart(companyId: string): Promise<Date> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { pastDueSince: true },
  });

  return company?.pastDueSince ?? new Date();
}

async function findCompanyId(
  subscription: Stripe.Subscription
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.companyId;
  if (fromMetadata) return fromMetadata;

  const bySubscription = await unsafeGlobalPrisma.company.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });
  if (bySubscription) return bySubscription.id;

  return findCompanyIdByCustomer(subscription.customer);
}

async function findCompanyIdByCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): Promise<string | null> {
  const id = typeof customer === "string" ? customer : customer?.id;
  if (!id) return null;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { stripeCustomerId: id },
    select: { id: true },
  });

  return company?.id ?? null;
}
