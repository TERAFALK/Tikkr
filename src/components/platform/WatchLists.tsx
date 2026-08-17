import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import type {
  EndingTrial,
  QuietCustomer,
  SilentDevice,
} from "@/lib/platform-health";

/**
 * DET SOM BEHÖVER ÅTGÄRDAS I DAG.
 *
 * Tre listor överst i panelen. Var och en visas BARA när den har innehåll —
 * en panel full av tomma rutor lär ögat att hoppa över dem, och då syns inte
 * den dagen något faktiskt står där.
 *
 * Är allt i sin ordning ser du ingenting alls, vilket är rätt svar.
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
        title={`${devices.length} ${devices.length === 1 ? "skärm har" : "skärmar har"} slutat höra av sig`}
        description="En skärm som varit tyst ett dygn har ofta stått oanvänd lika länge. Ring innan kunden ringer."
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
                ? "aldrig kopplad"
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
        title={`${trials.length} ${trials.length === 1 ? "provperiod" : "provperioder"} går snart ut`}
        description="Antalet stämplingar avgör vilket samtal som behövs: en påminnelse, eller en fråga om vad som gick fel."
      />
      <Rows>
        {trials.map((trial) => (
          <Row
            key={trial.companyId}
            href={`/plattform/${trial.companyId}`}
            title={trial.companyName}
            detail={`${trial.entries} stämplingar · ${trial.devices} ${
              trial.devices === 1 ? "skärm" : "skärmar"
            } · går ut ${formatDate(trial.trialEndsAt)}`}
            value={
              trial.daysLeft <= 0
                ? "går ut i dag"
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
        title={`${customers.length} betalande ${
          customers.length === 1 ? "kund" : "kunder"
        } har slutat registrera tid`}
        description="Det tidigaste tecknet på en uppsägning — långt före att någon säger upp."
      />
      <Rows>
        {customers.map((customer) => (
          <Row
            key={customer.companyId}
            href={`/plattform/${customer.companyId}`}
            title={customer.companyName}
            detail={
              customer.lastActivityAt
                ? `senaste stämpling ${formatDate(customer.lastActivityAt)} · ${customer.monthlyRevenue.toLocaleString("sv-SE")} kr per månad`
                : `har aldrig registrerat tid · ${customer.monthlyRevenue.toLocaleString("sv-SE")} kr per månad`
            }
            value={
              customer.quietDays === null
                ? "aldrig"
                : `${customer.quietDays} dagar`
            }
            tone="warning"
          />
        ))}
      </Rows>
    </Card>
  );
}
