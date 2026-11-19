import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { integrationCards, type IntegrationCard } from "@/lib/integrations/panel";
import IntegrationStatusBadge from "@/components/admin/IntegrationStatusBadge";
import { formatDateTime } from "@/lib/format";
import { companyTimeZone } from "@/lib/company";
import { Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { addIntegration } from "./actions";

export const metadata = { title: "Integrationer · Tikkr" };

export const dynamic = "force-dynamic";

/**
 * INTEGRATIONER: ett kort per externt system, anslutna först.
 *
 * Korten kommer ur providerregistret (src/lib/integrations/providers.ts). En
 * ny integration är en rad där och ingenting här. Se CLAUDE.md § 3.5.
 */
export default async function IntegrationsPage() {
  const { db, companyId } = await requireAdmin();
  const [cards, timeZone] = await Promise.all([integrationCards(db), companyTimeZone(companyId)]);

  const connected = cards.filter((c) => c.integrationId);
  const available = cards.filter((c) => !c.integrationId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Anslutna" help="integrationer" />
        {connected.length === 0 ? (
          <EmptyState title="Inga integrationer anslutna" />
        ) : (
          <ul className="divide-y divide-neutral-200">
            {connected.map((card) => (
              <li key={card.provider.id}>
                <Link
                  href={`/admin/installningar/integrationer/${card.provider.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-neutral-50"
                >
                  <Mark card={card} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-neutral-900">{card.provider.name}</p>
                    <p className="text-[13px] text-neutral-500">
                      {card.status.reason ??
                        (card.lastSyncAt ? `Senaste synk ${formatDateTime(card.lastSyncAt, timeZone)}` : "Inte synkad än")}
                    </p>
                  </div>
                  <IntegrationStatusBadge state={card.status.state} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {available.length > 0 && (
        <Card>
          <CardHeader title="Tillgängliga" />
          <ul className="divide-y divide-neutral-200">
            {available.map((card) => (
              <li key={card.provider.id} className="flex items-center gap-4 px-5 py-4">
                <Mark card={card} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-900">{card.provider.name}</p>
                  <p className="text-[13px] text-neutral-500">{card.provider.description}</p>
                </div>
                <form action={addIntegration}>
                  <input type="hidden" name="provider" value={card.provider.id} />
                  <Button type="submit" tone="secondary">
                    Lägg till
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Mark({ card }: { card: IntegrationCard }) {
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-fjord text-[13px] font-semibold text-white"
    >
      {card.provider.mark}
    </span>
  );
}
