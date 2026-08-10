import { requireAdmin } from "@/lib/admin-session";
import { buildReport, type ReportGroup } from "@/lib/report";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Input,
  Stat,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDateTime, formatDuration, toDecimalHours } from "@/lib/format";

export const dynamic = "force-dynamic";

interface SearchParams {
  from?: string;
  to?: string;
  employeeId?: string;
  orderId?: string;
  momentId?: string;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { db } = await requireAdmin();
  const params = await searchParams;

  const [employees, orders, moments] = await Promise.all([
    db.employee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.order.findMany({
      orderBy: { orderNumber: "asc" },
      select: { id: true, orderNumber: true, customerName: true },
    }),
    db.workMoment.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const report = await buildReport(db, {
    // Datumfälten ger ett datum utan klockslag. "Till och med" måste därför
    // sträcka sig till slutet av den dagen, annars faller dagens poster bort.
    from: params.from ? new Date(`${params.from}T00:00:00`) : undefined,
    to: params.to ? new Date(`${params.to}T23:59:59`) : undefined,
    employeeId: params.employeeId,
    orderId: params.orderId,
    momentId: params.momentId,
  });

  const exportHref = `/api/admin/export?${new URLSearchParams(
    Object.entries(params).filter(([, value]) => value) as [string, string][]
  ).toString()}`;

  return (
    <>
      <PageHeader
        title="Rapporter"
        description="Underlaget för fakturering. Filtrera fram det du behöver och exportera till Excel."
        action={
          report.rows.length > 0 ? (
            <ButtonLink href={exportHref}>Exportera till Excel</ButtonLink>
          ) : undefined
        }
      />

      <Card className="mb-6 p-5">
        {/* Vanligt GET-formulär: filtren hamnar i adressen, så en rapport går
            att spara som bokmärke eller skicka vidare till någon annan. */}
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Från">
            <Input type="date" name="from" defaultValue={params.from ?? ""} />
          </Field>

          <Field label="Till">
            <Input type="date" name="to" defaultValue={params.to ?? ""} />
          </Field>

          <Field label="Order">
            <Select name="orderId" defaultValue={params.orderId ?? ""}>
              <option value="">Alla ordrar</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber}
                  {order.customerName ? ` — ${order.customerName}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Anställd">
            <Select name="employeeId" defaultValue={params.employeeId ?? ""}>
              <option value="">Alla anställda</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Arbetsmoment">
            <Select name="momentId" defaultValue={params.momentId ?? ""}>
              <option value="">Alla moment</option>
              {moments.map((moment) => (
                <option key={moment.id} value={moment.id}>
                  {moment.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end gap-2">
            <Button type="submit">Visa</Button>
            <ButtonLink href="/admin/rapporter" tone="secondary">
              Rensa
            </ButtonLink>
          </div>
        </form>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total tid"
          value={formatDuration(report.totalMinutes)}
          hint={`${toDecimalHours(report.totalMinutes)} timmar att fakturera`}
        />
        <Stat label="Stämplingar" value={report.rows.length} />
        <Stat
          label="Pågår just nu"
          value={report.ongoingCount}
          tone={report.ongoingCount > 0 ? "active" : "neutral"}
          hint="tiden räknas fortfarande upp"
        />
        <Stat
          label="Ogranskade"
          value={report.needsReviewCount}
          tone={report.needsReviewCount > 0 ? "warning" : "neutral"}
          hint="gissad sluttid"
        />
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          title="Inga stämplingar matchar"
          description="Prova att vidga datumintervallet eller ta bort ett filter."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <Summary title="Per order" groups={report.byOrder} />
            <Summary title="Per anställd" groups={report.byEmployee} />
            <Summary title="Per arbetsmoment" groups={report.byMoment} />
          </div>

          <h2 className="mb-3 text-lg font-semibold">Alla stämplingar</h2>

          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Anställd</Th>
                  <Th>Order</Th>
                  <Th>Moment</Th>
                  <Th>In</Th>
                  <Th>Ut</Th>
                  <Th numeric>Tid</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((row) => (
                  <tr key={row.id}>
                    <Td>{row.employeeName}</Td>
                    <Td>
                      {row.orderNumber}
                      {row.customerName && (
                        <span className="ml-2 text-slate-500">
                          {row.customerName}
                        </span>
                      )}
                    </Td>
                    <Td muted>{row.momentName}</Td>
                    <Td muted>{formatDateTime(row.clockInAt)}</Td>
                    <Td muted>
                      {row.clockOutAt ? (
                        formatDateTime(row.clockOutAt)
                      ) : (
                        <Badge tone="active">Pågår</Badge>
                      )}
                    </Td>
                    <Td numeric>
                      {formatDuration(row.minutes)}
                      {row.needsReview && (
                        <span className="ml-2">
                          <Badge tone="warning">Ogranskad</Badge>
                        </span>
                      )}
                      {row.manual && (
                        <span className="ml-2">
                          <Badge>Manuell</Badge>
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}

function Summary({ title, groups }: { title: string; groups: ReportGroup[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <ul className="space-y-2">
        {groups.slice(0, 8).map((group) => (
          <li key={group.key} className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate">
              {group.label}
              {group.sublabel && (
                <span className="ml-2 text-sm text-slate-500">
                  {group.sublabel}
                </span>
              )}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {formatDuration(group.minutes)}
            </span>
          </li>
        ))}
        {groups.length > 8 && (
          <li className="pt-1 text-sm text-slate-500">
            och {groups.length - 8} till — finns med i Excel-exporten
          </li>
        )}
      </ul>
    </Card>
  );
}
