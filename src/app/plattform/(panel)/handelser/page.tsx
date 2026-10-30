import {
  auditLog,
  companyNameById,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import ActivityTable from "@/components/platform/ActivityTable";
import Pager from "@/components/ui/Pager";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Händelser · Tikkr" };

/**
 * ALLT SOM GJORTS FRÅN PANELEN.
 *
 * Låg tidigare längst ned på kundöversikten och växte i all oändlighet. Den
 * plats en logg förtjänar är en egen sida: den läses sällan, men när den läses
 * ska den gå att bläddra i.
 *
 * Raderade företag står kvar i loggen med sitt id. Det är avsiktligt — raden
 * om raderingen är den enda kvarvarande uppgiften om att kunden funnits.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ sida?: string; antal?: string }>;
}) {
  await requirePlatformAdmin();
  const { sida, antal } = await searchParams;

  const [log, names] = await Promise.all([
    auditLog({ sida, antal }),
    companyNameById(),
  ]);

  return (
    <>
      <PageHeader
        title="Händelser"
        description="Utförda från plattformspanelen."
      />

      {log.total === 0 ? (
        <EmptyState
          title="Inga registrerade åtgärder"
        />
      ) : (
        <Card>
          <CardHeader
            title={`${log.total.toLocaleString("sv-SE")} åtgärder`}
            description="Står kvar även när ett företag raderats."
          />
          <ActivityTable rows={log.rows} companyNames={names} />
          <Pager
            paging={log.paging}
            total={log.total}
            unit="händelser"
            path="/plattform/handelser"
          />
        </Card>
      )}
    </>
  );
}
