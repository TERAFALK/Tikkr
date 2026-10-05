import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import { describeAuditEvents } from "@/lib/audit-view";
import Pager from "@/components/platform/Pager";
import { Card, CardHeader, EmptyState, Table, Td, Th, Tr } from "@/components/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

/**
 * ÄNDRINGSLOGGEN.
 *
 * Vem som ändrade en stämpling, ett saldo, en frånvaro eller en timkostnad,
 * och vad värdet var innan. Se AuditEvent i schemat för varför den finns.
 *
 * `?post=` visar historiken för en enda post. Stämplingslistan länkar hit
 * därifrån, så att den som undrar över en rad inte behöver leta.
 *
 * Läsning, alltså öppen även i supportläget.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string; sida?: string }>;
}) {
  const { db, companyId } = await requireAdmin();
  const params = await searchParams;

  // Löneunderlagets historik följer tillvalet, precis som sidorna den kommer
  // från. Raderna ligger kvar och syns igen om tillvalet slås på.
  const payroll = await hasModule(companyId, "PAYROLL");

  const where = {
    ...(params.post ? { entityId: params.post } : {}),
    ...(payroll ? {} : { entity: { notIn: ["Absence", "CompAdjustment"] } }),
  };

  const total = await db.auditEvent.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(Math.max(1, Number(params.sida) || 1), pageCount);

  const events = await db.auditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
  });

  const rows = await describeAuditEvents(
    db,
    events,
    await companyTimeZone(companyId)
  );

  const base = "/admin/installningar/logg";
  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    if (params.post) search.set("post", params.post);
    if (target > 1) search.set("sida", String(target));
    const query = search.toString();
    return query ? `${base}?${query}` : base;
  };

  return (
    <Card>
      <CardHeader
        title={params.post ? "Ändringar av posten" : "Ändringslogg"}
        action={
          params.post ? (
            <Link
              href={base}
              className="text-[13px] font-medium text-tick-deep hover:underline"
            >
              Visa alla
            </Link>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Inga ändringar" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>När</Th>
                <Th>Vem</Th>
                <Th>Vad</Th>
                <Th>Ändring</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td muted>{row.at}</Td>
                  <Td>{row.actor}</Td>
                  <Td>
                    <span className="font-medium">{row.what}</span>
                    {row.subject && (
                      <span className="mt-0.5 block text-xs text-neutral-400">
                        {row.subject}
                      </span>
                    )}
                  </Td>
                  <Td muted>
                    {row.changes.length === 0 ? null : (
                      <ul className="space-y-0.5">
                        {row.changes.map((change) => (
                          <li key={change.label}>
                            <span className="text-neutral-500">
                              {change.label}:
                            </span>{" "}
                            {change.before} → {change.after}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          <Pager
            page={page}
            pageCount={pageCount}
            total={total}
            unit="ändringar"
            hrefFor={hrefFor}
          />
        </>
      )}
    </Card>
  );
}
