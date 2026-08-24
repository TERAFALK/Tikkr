import Link from "next/link";
import { notFound } from "next/navigation";
import { auditLog, requirePlatformAdmin } from "@/lib/platform-admin";
import { unsafeGlobalPrisma } from "@/lib/db";
import PlatformShell from "@/components/platform/PlatformShell";
import ActivityTable from "@/components/platform/ActivityTable";
import Pager from "@/components/platform/Pager";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

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
  searchParams: Promise<{ sida?: string }>;
}) {
  const { email } = await requirePlatformAdmin();
  const { companyId } = await params;
  const page = Number((await searchParams).sida) || 1;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  if (!company) notFound();

  const log = await auditLog({ companyId, page });

  return (
    <PlatformShell email={email} current="/plattform">
      <Link
        href={`/plattform/${companyId}`}
        className="text-[13px] font-medium text-blue-600 hover:underline"
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
            description="Statusändringar, licensändringar och anteckningar visas här."
          />
        ) : (
          <Card>
            <CardHeader
              title={`${log.total.toLocaleString("sv-SE")} åtgärder`}
              description="Senaste först."
            />
            <ActivityTable rows={log.rows} />
            <Pager
              page={log.page}
              pageCount={log.pageCount}
              total={log.total}
              unit="händelser"
              hrefFor={(next) =>
                `/plattform/${companyId}/historik?sida=${next}`
              }
            />
          </Card>
        )}
      </div>
    </PlatformShell>
  );
}
