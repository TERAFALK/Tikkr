import Link from "next/link";
import { notFound } from "next/navigation";
import { auditLog, requirePlatformAdmin } from "@/lib/platform-admin";
import { unsafeGlobalPrisma } from "@/lib/db";
import ActivityTable from "@/components/platform/ActivityTable";
import Pager from "@/components/platform/Pager";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Historik · Tikkr" };

export const dynamic = "force-dynamic";

/**
 * ETT FÖRETAGS FULLSTÄNDIGA HISTORIK.
 *
 * Företagssidan visar de senaste raderna. De äldre hamnar här, sidvis, så att
 * sidan ovanför behåller sin längd oavsett hur många år kunden funnits.
 */
export default async function CompanyHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ sida?: string; antal?: string }>;
}) {
  await requirePlatformAdmin();
  const { companyId } = await params;
  const { sida, antal } = await searchParams;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  if (!company) notFound();

  const log = await auditLog({ companyId, sida, antal });

  return (
    <>
      <Link
        href={`/plattform/kunder/${companyId}`}
        className="text-[13px] font-medium text-tick-deep hover:underline"
      >
        ← {company.name}
      </Link>

      <div className="mt-4">
        <PageHeader
          title="Historik"
          description={`Allt som gjorts för ${company.name} från panelen.`}
        />

        {log.total === 0 ? (
          <EmptyState
            title="Ingenting har ändrats"
          />
        ) : (
          <Card>
            <CardHeader
              title={`${log.total.toLocaleString("sv-SE")} åtgärder`}
            />
            <ActivityTable rows={log.rows} />
            <Pager
              paging={log.paging}
              total={log.total}
              unit="händelser"
              path={`/plattform/kunder/${companyId}/historik`}
            />
          </Card>
        )}
      </div>
    </>
  );
}
