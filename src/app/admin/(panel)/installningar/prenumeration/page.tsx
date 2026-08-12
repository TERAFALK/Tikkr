import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getBillingOverview } from "@/lib/billing";
import { isStripeConfigured, yearlyAvailable } from "@/lib/stripe";
import { evaluateAccess } from "@/lib/subscription";
import { Alert, Button, Card, CardHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { openBillingPortal, startCheckout } from "./actions";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ klart?: string }>;
}) {
  const { companyId } = await requireAdmin();
  const params = await searchParams;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      pastDueSince: true,
      stripeSubscriptionId: true,
    },
  });

  if (!company) return null;

  const access = evaluateAccess({
    status: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    pastDueSince: company.pastDueSince,
  });

  const configured = isStripeConfigured();
  const yearly = yearlyAvailable();

  const overview = configured
    ? await getBillingOverview(companyId)
    : {
        screens: 0,
        monthlyAmount: 0,
        yearlyAmount: 0,
        yearlySaving: 0,
        hasSubscription: false,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        interval: null,
      };

  return (
    <div className="space-y-6">
      {params.klart === "1" && (
        <Alert tone="info">
          Tack. Betalningen behandlas av Stripe och statusen uppdateras här om
          någon sekund — ladda om sidan om den inte hunnit ändras.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Prenumeration"
          description="399 kr per aktiv stämplingsskärm och månad, exklusive moms."
        />

        <div className="space-y-5 p-5">
          <dl className="divide-y divide-neutral-100 text-[13px]">
            <Row label="Status" value={statusText(company.subscriptionStatus)} />
            <Row
              label="Aktiva skärmar"
              value={String(overview.screens)}
            />
            <Row
              label={
                overview.interval === "year"
                  ? "Kostnad per år"
                  : "Kostnad per månad"
              }
              value={`${(overview.interval === "year"
                ? overview.yearlyAmount
                : overview.monthlyAmount
              ).toLocaleString("sv-SE")} kr`}
            />
            {company.trialEndsAt && company.subscriptionStatus === "TRIALING" && (
              <Row
                label="Provperioden går ut"
                value={formatDate(company.trialEndsAt)}
              />
            )}
            {overview.currentPeriodEnd && (
              <Row
                label={
                  overview.cancelAtPeriodEnd
                    ? "Avslutas"
                    : "Nästa betalning"
                }
                value={formatDate(overview.currentPeriodEnd)}
              />
            )}
          </dl>

          {access.level !== "full" && (
            <Alert tone={access.level === "locked" ? "error" : "warning"}>
              <strong>{access.headline}.</strong> {access.detail}
            </Alert>
          )}

          {!configured ? (
            <Alert tone="info">
              Betalning via kort är inte påkopplad än. Hör av dig till oss så
              ordnar vi prenumerationen manuellt under tiden.
            </Alert>
          ) : overview.hasSubscription ? (
            <form action={openBillingPortal}>
              <Button type="submit">Hantera betalning och fakturor</Button>
              <p className="mt-2 text-xs text-neutral-500">
                Byt kort, se kvitton eller säg upp. Sköts hos Stripe.
              </p>
            </form>
          ) : (
            <form action={startCheckout} className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="interval" value="month">
                  Betala månadsvis · {overview.monthlyAmount.toLocaleString("sv-SE")} kr/mån
                </Button>

                {yearly && (
                  <Button
                    type="submit"
                    name="interval"
                    value="year"
                    tone="secondary"
                  >
                    Betala årsvis · {overview.yearlyAmount.toLocaleString("sv-SE")} kr/år
                  </Button>
                )}
              </div>

              {yearly && overview.screens > 0 && (
                <p className="text-xs text-emerald-700">
                  Årsbetalning motsvarar tio månaders pris för tolv månader —
                  ni sparar {overview.yearlySaving.toLocaleString("sv-SE")} kr.
                </p>
              )}

              <p className="text-xs text-neutral-500">
                Ni skickas till Stripe för att fylla i kortuppgifter.
                Kortnumret passerar aldrig Tikkr. Ingen bindningstid — säg upp
                när ni vill.
              </p>
            </form>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Så räknas priset" />
        <div className="space-y-2 p-5 text-[13px] leading-relaxed text-neutral-600">
          <p>
            Ni betalar per <strong>aktiv</strong> stämplingsskärm. Antalet
            anställda, ordrar och stämplingar spelar ingen roll, och det finns
            ingen grundavgift.
          </p>
          <p>
            Lägger ni till en skärm mitt i månaden betalar ni bara för de dagar
            som återstår. Återkallar ni en skärm minskar beloppet på samma sätt.
          </p>
          <p>
            <strong>Stämplingen slutar aldrig fungera</strong>, oavsett
            betalningsläge. Uteblir betalningen låses rapporter och export, men
            all tid fortsätter registreras och finns kvar när det är löst.
          </p>
        </div>
      </Card>
    </div>
  );
}

function statusText(status: string): string {
  if (status === "ACTIVE") return "Aktiv";
  if (status === "TRIALING") return "Provperiod";
  if (status === "PAST_DUE") return "Betalning saknas";
  return "Avslutad";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}
