import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { buildReport, type ReportGroup } from "@/lib/report";
import { wallTimeIn } from "@/lib/time-zone";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Input,
  Stat,
  Table,
  Td,
  Th,
  Tr,
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
  const { db, companyId } = await requireAdmin();
  const params = await searchParams;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  const presets = datePresets(company?.timezone ?? "Europe/Stockholm");

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

      <Card className="mb-6">
        <CardHeader
          title="Filter"
          action={
            // Snabbval istället för att skriva datum för hand. Det är det man
            // gör oftast, och två datumfält per gång blir många knapptryck.
            <div className="flex flex-wrap gap-1">
              {presets.map((preset) => {
                const active =
                  params.from === preset.from && params.to === preset.to;

                return (
                  <Link
                    key={preset.label}
                    href={`/admin/rapporter?from=${preset.from}&to=${preset.to}`}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {preset.label}
                  </Link>
                );
              })}
            </div>
          }
        />
        {/* Vanligt GET-formulär: filtren hamnar i adressen, så en rapport går
            att spara som bokmärke eller skicka vidare till någon annan. */}
        <form className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-6">
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
          hint="beräknad sluttid"
        />
      </div>

      {report.rows.length === 0 ? (
        <EmptyState
          title="Inga stämplingar matchar"
          description="Utöka datumintervallet eller ta bort ett filter."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <Summary title="Per order" groups={report.byOrder} />
            <Summary title="Per anställd" groups={report.byEmployee} />
            <Summary title="Per arbetsmoment" groups={report.byMoment} />
          </div>

          <Card>
            <CardHeader
              title="Alla stämplingar"
              description={`${report.rows.length} rader, senaste först.`}
            />
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
              <tbody>
                {report.rows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      {row.employeeName}
                      {row.employeeNumber && (
                        <span className="ml-2 text-neutral-400">
                          {row.employeeNumber}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {row.orderNumber}
                      {row.customerName && (
                        <span className="ml-2 text-neutral-500">
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
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}

/**
 * Snabbval för datumintervall, räknade i företagets tidszon.
 *
 * "Idag" måste betyda idag på verkstaden. Räknade vi i serverns tid skulle
 * intervallet hoppa fel timmarna runt midnatt.
 */
function datePresets(timeZone: string) {
  const wall = wallTimeIn(new Date(), timeZone);
  const iso = (year: number, month: number, day: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const today = iso(wall.year, wall.month, wall.day);

  // Veckan börjar på måndag. UTC används bara för att räkna kalenderdagar —
  // datumen kommer från väggklockan i företagets tidszon.
  const asUtc = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  const weekday = (asUtc.getUTCDay() + 6) % 7;
  const monday = new Date(asUtc);
  monday.setUTCDate(asUtc.getUTCDate() - weekday);

  const firstOfMonth = iso(wall.year, wall.month, 1);

  const lastMonthEnd = new Date(Date.UTC(wall.year, wall.month - 1, 0));
  const lastMonthStart = new Date(
    Date.UTC(lastMonthEnd.getUTCFullYear(), lastMonthEnd.getUTCMonth(), 1)
  );
  const toIso = (date: Date) => date.toISOString().slice(0, 10);

  return [
    { label: "Idag", from: today, to: today },
    { label: "Denna vecka", from: toIso(monday), to: today },
    { label: "Denna månad", from: firstOfMonth, to: today },
    {
      label: "Förra månaden",
      from: toIso(lastMonthStart),
      to: toIso(lastMonthEnd),
    },
  ];
}

function Summary({ title, groups }: { title: string; groups: ReportGroup[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      <ul className="space-y-2">
        {groups.slice(0, 8).map((group) => (
          <li key={group.key} className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate">
              {group.label}
              {group.sublabel && (
                <span className="ml-2 text-sm text-neutral-500">
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
          <li className="pt-1 text-sm text-neutral-500">
            och {groups.length - 8} till — finns med i Excel-exporten
          </li>
        )}
      </ul>
    </Card>
  );
}
