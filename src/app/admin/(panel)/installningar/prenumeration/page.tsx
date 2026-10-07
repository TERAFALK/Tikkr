import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { getBillingOverview } from "@/lib/billing";
import { paymentsAvailable, yearlyAvailable } from "@/lib/stripe";
import { evaluateAccess } from "@/lib/subscription";
import { TRIAL_LICENSES } from "@/lib/licenses";
import LicenseForm from "@/components/admin/LicenseForm";
import ModuleSection from "@/components/admin/ModuleSection";
import { Alert, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { openBillingPortal, startCheckout } from "./actions";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ klart?: string; skots?: string }>;
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

  const configured = await paymentsAvailable();
  const yearly = await yearlyAvailable();

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
      {/* Någon har skickat kassaformuläret trots att knappen är dold. Det
          händer bara med ett sparat formulär eller en gammal flik, men svaret
          ska vara en förklaring och inte en tyst omdirigering. */}
      {params.skots === "1" && (
        <Alert tone="info">
          Prenumerationen sköts av Tikkr för det här företaget. Kontakta
          support@tikkr.se för att ändra den.
        </Alert>
      )}

      {params.klart === "1" && (
        <Alert tone="info">
          Betalningen behandlas. Statusen uppdateras inom kort. Ladda om sidan
          om den inte ändrats.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Prenumeration"
          description={
            overview.agreement
              ? `${kr(overview.agreement.perScreen)} kr per licens och månad, exkl. moms. Ert avtalade pris.`
              : `${kr(pricing.month)} kr per licens och månad, exkl. moms. Ingen bindningstid.`
          }
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
            {/* AVTALAT PRIS visas med listpriset överstruket och rabatten
                i procent. Kunden ska förstå vad hen fått, inte bara se ett
                tal som avviker från säljsidan. En gratiskund ser 0 kr och
                100 %, vilket är hela poängen. */}
            {paying && overview.agreement ? (
              <AgreedRow
                label="Avgift per månad"
                list={overview.agreement.listTotal}
                agreed={overview.agreement.total}
                discountPercent={overview.agreement.discountPercent}
              />
            ) : (
              paying && (
                <Row
                  label={
                    overview.interval === "year" ? "Avgift per år" : "Avgift per månad"
                  }
                  value={`${kr(
                    (overview.interval === "year"
                      ? (overview.yearlyAmount ?? 0)
                      : overview.monthlyAmount) + overview.moduleAmount
                  )} kr`}
                />
              )
            )}

            {paying && overview.moduleAmount > 0 && (
              <Row
                label="Varav tillval"
                value={`${kr(overview.moduleAmount)} kr`}
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
              skärmar. Vi stänger ingen skärm av oss själva; vilken som ska bort
              är kundens beslut. */}
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
          ) : overview.platformManaged ? (
            /* FAKTURAKUND ELLER ANNAN UPPGÖRELSE. Kassan visas inte: en
               kortprenumeration ovanpå en faktura vi redan skickar betyder
               att kunden betalar två gånger. */
            <Alert tone="info">
              Prenumerationen sköts av Tikkr för det här företaget. Kontakta
              support@tikkr.se för att ändra antalet licenser eller tillvalen.
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
                  hint="En licens per stämplingsskärm"
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

                {/* Årsknappen döljs när ett påslaget tillval saknar
                    årsartikel. Kassan skulle vägra, och ett val som alltid
                    ger ett felmeddelande är inget val. */}
                {yearly &&
                  pricing.year !== null &&
                  overview.blocksYearly.length === 0 && (
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

              {yearly && overview.blocksYearly.length > 0 && (
                <p className="text-xs leading-relaxed text-neutral-500">
                  Årsbetalning går inte att välja med{" "}
                  {overview.blocksYearly.join(", ")} påslaget. Stäng av
                  tillvalet under Tillval, eller betala månadsvis.
                </p>
              )}

              <p className="text-xs text-neutral-500">
                Kortuppgifter hanteras av vår betalningsleverantör och lagras
                aldrig hos Tikkr. Ingen bindningstid tillämpas.
              </p>
            </form>
          )}
        </div>
      </Card>

      {overview.modules.length > 0 && (
        <Card>
          <CardHeader title="Tillval" />
          <div className="p-5">
            <ModuleSection
              modules={overview.modules}
              hasSubscription={overview.hasSubscription}
              interval={overview.interval ?? "month"}
              managed={overview.platformManaged}
            />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Så räknas priset" />
        <div className="space-y-2 p-5 text-[13px] leading-relaxed text-neutral-600">
          <p>
            Avgiften avser antalet licenser, en per stämplingsskärm. Antalet
            anställda, ordrar och stämplingar påverkar inte priset, och ingen
            grundavgift tillkommer. Under provperioden ingår{" "}
            {TRIAL_LICENSES} licenser.
          </p>
          <p>
            Tillval kostar ett fast belopp per företag, oavsett antal skärmar.
          </p>
          <p>
            Antal och tillval ändras endast av er. Vid ändring under pågående
            period debiteras enbart återstående dagar.
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

/**
 * En rad med avtalat pris: listpriset överstruket, det avtalade, och rabatten.
 *
 * Rabatten står i grönt eftersom den är något kunden fått, och grönt betyder
 * just det i panelen. Saknas en rabatt att visa skrivs bara beloppen — ett
 * avtalat pris behöver inte vara lägre.
 */
function AgreedRow({
  label,
  list,
  agreed,
  discountPercent,
}: {
  label: string;
  list: number;
  agreed: number;
  discountPercent: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="flex flex-wrap items-baseline justify-end gap-2">
        {list !== agreed && (
          <span className="tabular-nums text-neutral-400 line-through">
            {kr(list)} kr
          </span>
        )}
        <span className="font-medium tabular-nums text-neutral-900">
          {kr(agreed)} kr
        </span>
        {discountPercent !== null && (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
            {discountPercent} % rabatt
          </span>
        )}
      </dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}
