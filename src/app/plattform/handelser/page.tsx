import {
  auditLog,
  companyNameById,
  requirePlatformAdmin,
} from "@/lib/platform-admin";
import PlatformShell from "@/components/platform/PlatformShell";
import ActivityTable from "@/components/platform/ActivityTable";
import Pager from "@/components/platform/Pager";
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
  searchParams: Promise<{ sida?: string }>;
}) {
  const { email } = await requirePlatformAdmin();
  const page = Number((await searchParams).sida) || 1;

  const [log, names] = await Promise.all([
    auditLog({ page }),
    companyNameById(),
  ]);

  return (
    <PlatformShell email={email} current="/plattform/handelser">
      <PageHeader
        title="Händelser"
        description="Utförda från plattformspanelen, senaste först."
      />

      {log.total === 0 ? (
        <EmptyState
          title="Inga registrerade åtgärder"
          description="Statusändringar, licenser och raderingar visas här."
        />
      ) : (
        <Card>
          <CardHeader
            title={`${log.total.toLocaleString("sv-SE")} åtgärder`}
            description="Står kvar även när ett företag raderats."
          />
          <ActivityTable rows={log.rows} companyNames={names} />
          <Pager
            page={log.page}
            pageCount={log.pageCount}
            total={log.total}
            unit="händelser"
            hrefFor={(next) => `/plattform/handelser?sida=${next}`}
          />
        </Card>
      )}
    </PlatformShell>
  );
}
