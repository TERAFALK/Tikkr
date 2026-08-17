import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import type {
  EndingTrial,
  QuietCustomer,
  SilentDevice,
} from "@/lib/platform-health";

/**
 * BEVAKNINGSLISTOR.
 *
 * Tre listor överst i panelen. Var och en visas BARA när den har innehåll — en
 * panel full av tomma rutor lär ögat att hoppa över dem, och då syns inte den
 * dagen något faktiskt står där.
 *
 * Rubrikerna beskriver urvalet, inte vad läsaren bör göra åt det. Panelen är
 * ett underlag, inte en instruktion.
 */

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-neutral-100">{children}</div>;
}

function Row({
  href,
  title,
  detail,
  value,
  tone = "neutral",
}: {
  href: string;
  title: string;
  detail: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-neutral-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-neutral-900">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-neutral-500">
          {detail}
        </span>
      </span>
      <span
        className={`shrink-0 text-[13px] font-medium tabular-nums ${
          tone === "warning" ? "text-amber-700" : "text-neutral-600"
        }`}
      >
        {value}
      </span>
    </Link>
  );
}

export function SilentDeviceList({ devices }: { devices: SilentDevice[] }) {
  if (devices.length === 0) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader
        title={`Skärmar utan kontakt (${devices.length})`}
        description="Aktiva skärmar som inte hört av sig det senaste dygnet."
      />
      <Rows>
        {devices.map((device) => (
          <Row
            key={device.id}
            href={`/plattform/${device.companyId}`}
            title={device.name}
            detail={`${device.companyName} · senast ${
              device.lastSeenAt ? formatDateTime(device.lastSeenAt) : "aldrig"
            }`}
            value={
              device.silentHours === null
                ? "—"
                : device.silentHours >= 48
                  ? `${Math.floor(device.silentHours / 24)} dygn`
                  : `${device.silentHours} tim`
            }
            tone="warning"
          />
        ))}
      </Rows>
    </Card>
  );
}

export function EndingTrialList({ trials }: { trials: EndingTrial[] }) {
  if (trials.length === 0) return null;

  return (
    <Card className="border-blue-200">
      <CardHeader
        title={`Provperioder som upphör (${trials.length})`}
        description="Inom sju dagar. Antalet stämplingar visar i vilken grad tjänsten tagits i bruk."
      />
      <Rows>
        {trials.map((trial) => (
          <Row
            key={trial.companyId}
            href={`/plattform/${trial.companyId}`}
            title={trial.companyName}
            detail={`${trial.entries} stämplingar · ${trial.devices} ${
              trial.devices === 1 ? "skärm" : "skärmar"
            } · upphör ${formatDate(trial.trialEndsAt)}`}
            value={
              trial.daysLeft <= 0
                ? "i dag"
                : `${trial.daysLeft} ${trial.daysLeft === 1 ? "dag" : "dagar"}`
            }
          />
        ))}
      </Rows>
    </Card>
  );
}

export function QuietCustomerList({
  customers,
}: {
  customers: QuietCustomer[];
}) {
  if (customers.length === 0) return null;

  return (
    <Card className="border-amber-200">
      <CardHeader
        title={`Prenumerationer utan aktivitet (${customers.length})`}
        description="Betalande företag utan registrerad tid de senaste fjorton dagarna."
      />
      <Rows>
        {customers.map((customer) => (
          <Row
            key={customer.companyId}
            href={`/plattform/${customer.companyId}`}
            title={customer.companyName}
            detail={`${
              customer.lastActivityAt
                ? `senast ${formatDate(customer.lastActivityAt)}`
                : "ingen registrerad tid"
            } · ${customer.monthlyRevenue.toLocaleString("sv-SE")} kr per månad`}
            value={
              customer.quietDays === null ? "—" : `${customer.quietDays} dagar`
            }
            tone="warning"
          />
        ))}
      </Rows>
    </Card>
  );
}
