import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getBillingOverview } from "@/lib/billing";
import { isStripeConfigured, yearlyAvailable } from "@/lib/stripe";
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

  // Hämtas alltid, även utan kortbetalning. Antalet skärmar och priset finns i
  // vår egen databas respektive i reservpriserna — tidigare visades noll
  // skärmar i den miljön, vilket var direkt fel.
  const overview = await getBillingOverview(companyId);

  const { pricing } = overview;
  const kr = (amount: number) => amount.toLocaleString("sv-SE");

  // Avgifter visas bara när det faktiskt finns en avgift. Under provperioden
  // betalar kunden ingenting, och då ska ingen summa stå någonstans.
  const paying = overview.hasSubscription;

  return (
    <div className="space-y-6">
      {params.klart === "1" && (
        <Alert tone="info">
          Betalningen behandlas. Statusen uppdateras inom kort — ladda om sidan
          om den inte ändrats.
        </Alert>
      )}

      {params.uppdaterad === "1" && (
        <Alert tone="info">
          Ändringen är godkänd. Antalet licenser uppdateras inom kort — ladda
          om sidan om det inte ändrats.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Prenumeration"
          description={`${kr(pricing.month)} kr per licens och månad, exklusive moms. En licens ger en stämplingsskärm. Ingen bindningstid.`}
        />

        <div className="space-y-5 p-5">
          <dl className="divide-y divide-neutral-100 text-[13px]">
            <Row label="Status" value={statusText(company.subscriptionStatus)} />

            <Row label="Licenser" value={String(overview.screens)} />

            <Row
              label="Använda"
              value={`${overview.used} av ${overview.screens}`}
            />

            {/* Ingen avgift visas under provperioden. En kostnad i en tabell
                läses som något som ska betalas, och det ska den inte. */}
            {paying && (
              <Row
                label={
                  overview.interval === "year" ? "Avgift per år" : "Avgift per månad"
                }
                value={`${kr(
                  overview.interval === "year"
                    ? (overview.yearlyAmount ?? 0)
                    : overview.monthlyAmount
                )} kr`}
              />
            )}

            {company.trialEndsAt && company.subscriptionStatus === "TRIALING" && (
              <Row
                label="Provperioden avslutas"
                value={formatDate(company.trialEndsAt)}
              />
            )}

            {overview.currentPeriodEnd && (
              <Row
                label={overview.cancelAtPeriodEnd ? "Avslutas" : "Nästa betalning"}
                value={formatDate(overview.currentPeriodEnd)}
              />
            )}
          </dl>

          {access.level !== "full" && (
            <Alert tone={access.level === "locked" ? "error" : "warning"}>
              <strong>{access.headline}.</strong> {access.detail}
            </Alert>
          )}

          {/* Antalet kan sänkas hos betaltjänsten under antalet upplagda
              skärmar. Vi stänger ingen skärm av oss själva — vilken som ska
              bort är kundens beslut, inte vårt. */}
          {overview.used > overview.screens && (
            <Alert tone="warning">
              {overview.used} skärmar är upplagda men ni har {overview.screens}{" "}
              {overview.screens === 1 ? "licens" : "licenser"}. Radera de
              skärmar ni inte längre använder under Stämplingsskärmar, eller
              utöka antalet licenser igen. Skärmarna fortsätter fungera under
              tiden.
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
                    ? (pricing.year ?? pricing.month * 12)
                    : pricing.month
                }
                interval={overview.interval ?? "month"}
              />

              <form action={openBillingPortal} className="border-t border-neutral-100 pt-5">
                <Button type="submit" tone="secondary">
                  Hantera betalning och fakturor
                </Button>
                <p className="mt-2 text-xs text-neutral-500">
                  Byte av betalkort, kvitton och uppsägning sker hos vår
                  betalningsleverantör.
                </p>
              </form>
            </div>
          ) : (
            <form action={startCheckout} className="space-y-4">
              <div className="w-40">
                <Field
                  label="Antal licenser"
                  hint="En licens ger en stämplingsskärm."
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
                  Betala månadsvis · {kr(pricing.month)} kr per licens
                </Button>

                {yearly && pricing.year !== null && (
                  <Button
                    type="submit"
                    name="interval"
                    value="year"
                    tone="secondary"
                  >
                    Betala årsvis · {kr(pricing.year)} kr per licens
                    {pricing.yearlyDiscountPercent !== null && (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        −{pricing.yearlyDiscountPercent} %
                      </span>
                    )}
                  </Button>
                )}
              </div>

              <p className="text-xs text-neutral-500">
                Kortuppgifter hanteras av vår betalningsleverantör och lagras
                aldrig hos Tikkr. Ingen bindningstid tillämpas.
              </p>
            </form>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Så räknas priset" />
        <div className="space-y-2 p-5 text-[13px] leading-relaxed text-neutral-600">
          <p>
            Avgiften avser antalet licenser. En licens ger rätt att koppla en
            stämplingsskärm. Antalet anställda, ordrar och stämplingar påverkar
            inte priset, och ingen grundavgift tillkommer. Under provperioden
            ingår {TRIAL_LICENSES} licenser.
          </p>
          <p>
            Antalet ändras endast av er, aldrig automatiskt. Vid utökning under
            pågående period debiteras enbart återstående dagar av perioden.
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
