import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getBillingOverview } from "@/lib/billing";
import {
  isStripeConfigured,
  yearlyAvailable,
  PRICE_PER_SCREEN,
} from "@/lib/stripe";
import { evaluateAccess } from "@/lib/subscription";
import { TRIAL_LICENSES } from "@/lib/licenses";
import LicenseForm from "@/components/admin/LicenseForm";
import { Alert, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { openBillingPortal, startCheckout } from "./actions";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ klart?: string; uppdaterad?: string }>;
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
        used: 0,
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
          Betalningen behandlas av Stripe. Statusen uppdateras inom kort. Ladda
          om sidan om den inte ändrats.
        </Alert>
      )}

      {params.uppdaterad === "1" && (
        <Alert tone="info">
          Ändringen är godkänd hos Stripe. Antalet licenser uppdateras inom
          kort. Ladda om sidan om det inte ändrats.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Prenumeration"
          description="399 kr per stämplingsskärm och månad, exklusive moms. Ingen bindningstid."
        />

        <div className="space-y-5 p-5">
          <dl className="divide-y divide-neutral-100 text-[13px]">
            <Row label="Status" value={statusText(company.subscriptionStatus)} />
            <Row
              label="Licenser"
              value={`${overview.screens} skärmar`}
            />
            <Row
              label="Använda just nu"
              value={`${overview.used} av ${overview.screens}`}
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
              Kortbetalning är inte aktiverad för den här installationen.
              Kontakta support@tikkr.se för att aktivera prenumerationen.
            </Alert>
          ) : overview.hasSubscription ? (
            <div className="space-y-6">
              <LicenseForm
                current={overview.screens}
                used={overview.used}
                pricePerScreen={
                  overview.interval === "year"
                    ? PRICE_PER_SCREEN.year
                    : PRICE_PER_SCREEN.month
                }
                interval={overview.interval ?? "month"}
              />

              <form action={openBillingPortal} className="border-t border-neutral-100 pt-5">
                <Button type="submit" tone="secondary">
                  Hantera betalning och fakturor
                </Button>
                <p className="mt-2 text-xs text-neutral-500">
                  Byte av betalkort, kvitton och uppsägning hanteras hos Stripe.
                </p>
              </form>
            </div>
          ) : (
            <form action={startCheckout} className="space-y-4">
              <div className="w-40">
                <Field
                  label="Antal skärmar"
                  hint="Antalet licenser, och därmed antalet skärmar som kan kopplas. Kan ändras i efterhand."
                >
                  <Input
                    type="number"
                    name="screens"
                    min={Math.max(1, overview.used)}
                    max={100}
                    defaultValue={Math.max(1, overview.used)}
                    required
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="interval" value="month">
                  Betala månadsvis · {PRICE_PER_SCREEN.month} kr per skärm
                </Button>

                {yearly && (
                  <Button
                    type="submit"
                    name="interval"
                    value="year"
                    tone="secondary"
                  >
                    Betala årsvis · {PRICE_PER_SCREEN.year.toLocaleString("sv-SE")} kr per skärm
                  </Button>
                )}
              </div>

              {yearly && (
                <p className="text-xs text-emerald-700">
                  Årsbetalning motsvarar tio månaders pris för tolv månader.
                </p>
              )}

              <p className="text-xs text-neutral-500">
                Betalningen genomförs hos Stripe. Kortuppgifter hanteras aldrig
                av Tikkr. Ingen bindningstid tillämpas.
              </p>
            </form>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Så räknas priset" />
        <div className="space-y-2 p-5 text-[13px] leading-relaxed text-neutral-600">
          <p>
            Priset avser antalet licenser. Varje licens ger rätt att koppla en
            stämplingsskärm. Antalet anställda, ordrar och stämplingar påverkar
            inte priset, och ingen grundavgift tillkommer.
          </p>
          <p>
            Under provperioden ingår {TRIAL_LICENSES} licenser. Antalet licenser
            ändras endast av er, aldrig automatiskt.
          </p>
          <p>
            Vid utökning under pågående period debiteras endast återstående
            dagar av perioden.
          </p>
          <p>
            Stämplingsskärmarna påverkas inte av betalningsläget. Vid utebliven
            betalning låses rapporter och export, medan tidregistreringen
            fortsätter som vanligt.
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
