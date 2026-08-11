import Link from "next/link";
import { Card } from "@/components/ui";
import type { AccessState } from "@/lib/subscription";

/**
 * Visas istället för adminpanelen när prenumerationen inte är i ordning.
 *
 * Tonen är avsiktligt saklig och inte anklagande. Den som ser den här är
 * oftast inte den som glömt betala, och en kund som känner sig utskälld
 * kommer inte tillbaka.
 *
 * Det viktigaste budskapet står först: ingen tid går förlorad.
 */
export default function SubscriptionLocked({
  state,
  companyName,
}: {
  state: AccessState;
  companyName: string;
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
            Stämplingsskärmarna fungerar som vanligt
          </p>
          <p className="mt-1 text-[13px] text-emerald-800">
            All tid registreras och sparas. Så fort prenumerationen är igång
            finns allt här, även tiden från de här dagarna.
          </p>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-5">
          <p className="text-[13px] font-medium text-neutral-900">
            Så startar ni prenumerationen
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">
            Betalfunktionen är inte påkopplad än. Hör av dig till oss så ordnar
            vi det manuellt under tiden.
          </p>
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
