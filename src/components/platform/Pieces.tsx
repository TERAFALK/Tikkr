import type { ReactNode } from "react";
import { Badge } from "@/components/ui";

/**
 * SMÅDELAR SOM ÅTERKOMMER I PLATTFORMSPANELEN.
 *
 * Statusmärket och faktaraden stod tidigare utskrivna i både kundöversikten
 * och kunddetaljen, i två nästan lika kopior. Två kopior av samma sak börjar
 * alltid som "nästan lika" och slutar som "olika".
 */

/** Prenumerationens läge, med samma ord och färg överallt. */
export function SubscriptionBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge tone="active">Aktiv</Badge>;
  if (status === "TRIALING") return <Badge>Provperiod</Badge>;
  if (status === "PAST_DUE") return <Badge tone="warning">Obetald</Badge>;
  return <Badge tone="muted">Avslutad</Badge>;
}

/** Etikett till vänster, värde till höger. */
export function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-900">{children}</dd>
    </div>
  );
}

/** En lista av Fact, med linjer mellan. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-neutral-100">{children}</dl>;
}

/**
 * Rubrik över en grupp kort.
 *
 * Panelen bestod av kort i en följd, alla lika viktiga för ögat. Rubrikerna
 * delar upp den i några få stycken som går att hoppa mellan, i stället för en
 * lista man måste läsa från början.
 */
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-neutral-400">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-[13px] text-neutral-500">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
