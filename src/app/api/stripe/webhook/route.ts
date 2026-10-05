import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { screenItemOf, stripe, toSubscriptionStatus } from "@/lib/stripe";
import { priceBook } from "@/lib/price-book";
import { syncModulesFromSubscription } from "@/lib/billing";
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
 *
 * BESKEDET ÄR EN SIGNAL, INTE SANNINGEN (ändrat 2026-10-05).
 *
 * Stripe lovar varken ordning eller att ett besked bara kommer en gång. Förr
 * lästes status och rader ur själva beskedet, och då kunde ett gammalt
 * "updated" som kom sist skriva över ett nyare läge. Värst var `invoice.paid`,
 * som satte ACTIVE utan att titta på prenumerationen: en slutfaktura som
 * betalades efter en uppsägning öppnade en avslutad kund igen.
 *
 * Nu hämtas prenumerationen från Stripe vid varje besked, och det är DEN som
 * skrivs. Ordningen spelar då ingen roll — det sista beskedet läser alltid det
 * senaste läget — och ett besked som kommer två gånger skriver samma sak två
 * gånger.
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
        },
      });

      if (typeof session.subscription === "string") {
        await syncSubscription(companyId, session.subscription);
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const companyId = await findCompanyId(subscription);
      if (!companyId) return;

      await syncSubscription(companyId, subscription.id);
      return;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subscriptionId = subscriptionIdOf(invoice);

      // En faktura utan prenumeration är en engångsfaktura. Den säger
      // ingenting om vad kunden har tillgång till.
      if (!subscriptionId) return;

      const companyId =
        (await findCompanyIdBySubscription(subscriptionId)) ??
        (await findCompanyIdByCustomer(invoice.customer));
      if (!companyId) return;

      await syncSubscription(companyId, subscriptionId);
      return;
    }

    default:
      // Stripe skickar många fler besked än vi bryr oss om. Att svara 200 på
      // dem gör att de inte köar upp och skickas om i evighet.
      return;
  }
}

/** Skriver prenumerationens läge, så som Stripe har det just nu. */
async function syncSubscription(
  companyId: string,
  subscriptionId: string
): Promise<void> {
  const subscription = await stripe().subscriptions.retrieve(subscriptionId);

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { stripeSubscriptionId: true },
  });
  if (!company) return;

  // EN ANNAN PRENUMERATION GÄLLER REDAN. Ett besked om en äldre — en kund som
  // sagt upp och köpt på nytt — får inte skriva över den nya.
  if (
    company.stripeSubscriptionId &&
    company.stripeSubscriptionId !== subscription.id
  ) {
    return;
  }

  const status = toSubscriptionStatus(subscription.status);

  // Avslutad på riktigt, inte pausad. Då släpps kopplingen helt, så att en
  // ny prenumeration kan ta dess plats.
  const ended =
    subscription.status === "canceled" ||
    subscription.status === "incomplete_expired";

  // Antalet betalda platser är antalet licenser. Raden slås upp på pris-id och
  // inte på plats: med tillvalen kan items.data[0] lika gärna vara
  // löneunderlaget, kvantitet 1, och då hade en kund med tre skärmar tyst
  // blivit en.
  const item = screenItemOf(await priceBook(), subscription);
  const quantity = item?.quantity;
  const interval = item?.price?.recurring?.interval ?? null;

  await unsafeGlobalPrisma.company.update({
    where: { id: companyId },
    data: {
      subscriptionStatus: status,
      subscriptionInterval: ended ? null : interval,
      ...(!ended && quantity && { screenLicenses: quantity }),
      stripeSubscriptionId: ended ? null : subscription.id,

      // Klockan för respiten startar när betalningen först uteblev, och
      // nollställs så fort den går igenom. Utan nollställningen skulle en
      // kund som betalat sent låsas ute nästa gång direkt.
      pastDueSince:
        status === "PAST_DUE" ? await pastDueStart(companyId) : null,
    },
  });

  // Tillvalen följer prenumerationens rader. En avslutad prenumeration har
  // kvar sina rader hos Stripe, så där tas modulerna bort uttryckligen.
  //
  // Kundens scheman, raster, frånvaro och komprader ligger orörda kvar och
  // står där igen om kunden kommer tillbaka. Se CLAUDE.md § 3.1.
  if (ended) {
    await clearModules(companyId);
  } else {
    await syncModulesFromSubscription(companyId, subscription);
  }
}

/**
 * Prenumerationen en faktura hör till.
 *
 * Fältet har flyttat mellan versioner av Stripes API: `subscription` direkt på
 * fakturan i äldre, under `parent.subscription_details` i nyare. Båda läses,
 * så att en uppgradering av biblioteket inte tyst gör varje faktura till en
 * engångsfaktura.
 */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const shaped = invoice as unknown as {
    subscription?: string | { id: string } | null;
    parent?: { subscription_details?: { subscription?: string | null } | null } | null;
  };

  const legacy = shaped.subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;

  return shaped.parent?.subscription_details?.subscription ?? null;
}

/**
 * Tar bort alla tillval när prenumerationen avslutas.
 *
 * Raderar bara raden som säger att modulen är köpt. Ingen kunddata rörs.
 */
async function clearModules(companyId: string): Promise<void> {
  await unsafeGlobalPrisma.companyModule.deleteMany({ where: { companyId } });
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

  return (
    (await findCompanyIdBySubscription(subscription.id)) ??
    findCompanyIdByCustomer(subscription.customer)
  );
}

async function findCompanyIdBySubscription(
  subscriptionId: string
): Promise<string | null> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true },
  });

  return company?.id ?? null;
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
