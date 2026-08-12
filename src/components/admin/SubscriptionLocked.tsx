import Link from "next/link";
import { Card } from "@/components/ui";
import type { AccessState } from "@/lib/subscription";
import type { ScreenPricing } from "@/lib/stripe";
import { startCheckout } from "@/app/admin/(panel)/installningar/prenumeration/actions";

/**
 * Visas istället för adminpanelen när prenumerationen inte är i ordning.
 *
 * Köpvägen ligger i vyn och inte bara som en länk. Den låsta vyn ersätter
 * samtliga adminsidor, inklusive prenumerationssidan — utan knapparna här
 * skulle kunden inte kunna åtgärda det som orsakat låsningen.
 */
export default function SubscriptionLocked({
  state,
  companyName,
  screens,
  paymentsAvailable,
  yearlyAvailable,
  pricing,
}: {
  state: AccessState;
  companyName: string;
  screens: number;
  paymentsAvailable: boolean;
  yearlyAvailable: boolean;
  pricing: ScreenPricing;
}) {
  return (
    <div className="mx-auto max-w-lg py-12">
      <Card className="p-8">
        <h1 className="text-xl font-semibold text-neutral-900">
          {state.headline}
        </h1>

        <p className="mt-3 text-[13px] leading-relaxed text-neutral-600">
          {state.detail}
        </p>

        <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-[13px] font-medium text-emerald-900">
            Stämplingsskärmarna är opåverkade
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-emerald-800">
            All tid registreras och sparas som vanligt. När prenumerationen är
            aktiv finns samtliga poster tillgängliga, inklusive de som
            registrerats under tiden panelen varit låst.
          </p>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-5">
          {paymentsAvailable ? (
            <form action={startCheckout} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-neutral-700">
                  Antal stämplingsskärmar
                </span>
                <input
                  type="number"
                  name="screens"
                  min={1}
                  max={100}
                  defaultValue={Math.max(1, screens)}
                  required
                  className="block w-32 rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="interval"
                  value="month"
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Månadsvis · {pricing.month.toLocaleString("sv-SE")} kr per
                  skärm
                </button>

                {yearlyAvailable && pricing.year !== null && (
                  <button
                    type="submit"
                    name="interval"
                    value="year"
                    className="rounded-md bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 ring-1 ring-inset ring-neutral-200 transition-colors hover:bg-neutral-50"
                  >
                    Årsvis · {pricing.year.toLocaleString("sv-SE")} kr per skärm
                    {pricing.yearlyDiscountPercent !== null && (
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        −{pricing.yearlyDiscountPercent} %
                      </span>
                    )}
                  </button>
                )}
              </div>

              <p className="text-xs leading-relaxed text-neutral-500">
                Kortuppgifter hanteras av vår betalningsleverantör och lagras
                aldrig hos Tikkr. Ingen bindningstid tillämpas.
              </p>
            </form>
          ) : (
            <p className="text-[13px] leading-relaxed text-neutral-600">
              Kontakta support@tikkr.se för att aktivera prenumerationen.
            </p>
          )}
        </div>

        <p className="mt-6 text-xs text-neutral-400">
          {companyName}
          {" · "}
          <Link href="/kiosk" className="text-blue-600">
            till stämplingsskärmen
          </Link>
        </p>
      </Card>
    </div>
  );
}
