import Link from "next/link";
import FilterForm from "@/components/admin/FilterForm";
import SearchSelect from "@/components/admin/SearchSelect";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import { buildReport, type ReportGroup } from "@/lib/report";
import {
  endOfDayIn,
  parseLocalDate,
  startOfDayIn,
} from "@/lib/time-zone";
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
import { formatDateTime, formatDuration, formatDecimalHours } from "@/lib/format";
import { datePresets } from "@/lib/date-presets";
import { customerOptions } from "@/lib/customers";
import type { ReportResult, ReportRow } from "@/lib/report";
import type { ReportView } from "@/lib/report-pdf";

export const dynamic = "force-dynamic";

interface SearchParams {
  from?: string;
  to?: string;
  employeeId?: string;
  orderId?: string;
  customerId?: string;
  momentId?: string;
  /** "ORDER" (standard), "INDIRECT" eller "ALL". */
  kind?: string;
  /** "detalj" (standard) eller "person". */
  visning?: string;
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
  const timeZone = company?.timezone ?? "Europe/Stockholm";
  const { presets, lastWeek } = datePresets(timeZone);

  // Förra veckans stämplingar per anställd, direkt som PDF. Den utskriften
  // görs varje måndag, och den ska inte kräva fyra val först.
  //
  // kind=ALL med flit: frågan är vad personen gjort i veckan, och då hör
  // städning och möten dit. Improduktiva rader står i gult och rubriken säger
  // "Fakturerbar och improduktiv tid", så utskriften kan inte förväxlas med
  // ett orderunderlag.
  const lastWeekHref =
    `/api/admin/export?from=${lastWeek.from}&to=${lastWeek.to}` +
    `&visning=persondetalj&kind=ALL&format=pdf`;

  const [employees, orders, moments, customers] = await Promise.all([
    db.employee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.order.findMany({
      orderBy: { orderNumber: "asc" },
      select: {
        id: true,
        orderNumber: true,
        customer: { select: { name: true } },
      },
    }),
    db.workMoment.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    customerOptions(db),
  ]);

  // Datumfälten ger ett datum utan klockslag, och tolkas i FÖRETAGETS tidszon.
  // "Till och med" sträcker sig till dygnets sista millisekund — annars faller
  // hela den dagens poster bort, vilket ser ut som att ingen arbetat då.
  const fromDate = params.from ? parseLocalDate(params.from, timeZone) : null;
  const toDate = params.to ? parseLocalDate(params.to, timeZone) : null;

  const report = await buildReport(db, {
    from: fromDate ? startOfDayIn(fromDate, timeZone) : undefined,
    to: toDate ? endOfDayIn(toDate, timeZone) : undefined,
    employeeId: params.employeeId,
    orderId: params.orderId,
    customerId: params.customerId,
    momentId: params.momentId,
    // Utelämnad betyder fakturerbar tid. Se ReportFilters.kind — glömska ska
    // ge det som hör hemma i en faktura, aldrig tvärtom.
    kind:
      params.kind === "INDIRECT" || params.kind === "ALL"
        ? params.kind
        : "ORDER",
  });

  // "detalj" är standard: den som öppnar en rapport vill oftast se raderna.
  const view: ReportView =
    params.visning === "person" ||
    params.visning === "persondetalj" ||
    params.visning === "kund"
      ? params.visning
      : "detalj";

  // Skärmen och PDF:en ska visa samma sak. Grupperingen räknas därför fram
  // här också, med samma regel som i report-pdf.ts: personerna i
  // bokstavsordning, deras stämplingar i tidsordning.
  const employeeGroups =
    view === "persondetalj" ? groupByEmployee(report.rows) : [];

  const exportHref = `/api/admin/export?${new URLSearchParams(
    Object.entries(params).filter(([, value]) => value) as [string, string][]
  ).toString()}`;

  return (
    <>
      <PageHeader
        title="Rapporter"
        description="Underlaget för fakturering. Filtrera och exportera."
        action={
          <div className="flex flex-wrap gap-2">
            {/* Står kvar även när filtren gett en tom rapport: knappen gäller
                förra veckan och inte det som råkar visas på skärmen. */}
            <ButtonLink href={lastWeekHref} tone="secondary">
              Förra veckan per anställd
            </ButtonLink>
            {report.rows.length > 0 && (
              <>
                <ButtonLink
                  href={`${exportHref}&format=pdf`}
                  tone="secondary"
                >
                  PDF
                </ButtonLink>
                <ButtonLink href={exportHref}>Excel</ButtonLink>
              </>
            )}
          </div>
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
        {/* GET-formulär: filtren hamnar i adressen, så en rapport går att
            spara som bokmärke eller skicka vidare till någon annan. Det
            tillämpas direkt när ett fält ändras — se FilterForm. */}
        <FilterForm className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Från">
            <Input type="date" name="from" defaultValue={params.from ?? ""} />
          </Field>

          <Field label="Till">
            <Input type="date" name="to" defaultValue={params.to ?? ""} />
          </Field>

          <Field label="Order">
            <SearchSelect
              name="orderId"
              options={orders.map((order) => ({
                id: order.id,
                label: order.orderNumber,
                hint: order.customer?.name,
              }))}
              defaultValue={params.orderId}
              placeholder="Sök order…"
              emptyLabel="Alla ordrar"
            />
          </Field>

          <Field label="Kund">
            <SearchSelect
              name="customerId"
              options={customers}
              defaultValue={params.customerId}
              placeholder="Sök kund…"
              emptyLabel="Alla kunder"
            />
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

          <Field
            label="Visning"
            hint="Samma siffror, två sätt att läsa dem. Följer med till PDF och Excel."
          >
            <Select name="visning" defaultValue={params.visning ?? "detalj"}>
              <option value="detalj">Varje stämpling</option>
              <option value="persondetalj">
                Varje stämpling, per anställd
              </option>
              <option value="person">Summerat per anställd</option>
              <option value="kund">Summerat per kund</option>
            </Select>
          </Field>

          <Field
            label="Sorts tid"
            hint="Fakturerbar tid är standard. Improduktiv tid ingår aldrig i ett orderunderlag."
          >
            <Select name="kind" defaultValue={params.kind ?? "ORDER"}>
              <option value="ORDER">Fakturerbar tid</option>
              <option value="INDIRECT">Improduktiv tid</option>
              <option value="ALL">Båda</option>
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
        </FilterForm>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total tid"
          value={formatDuration(report.totalMinutes)}
          hint={`${formatDecimalHours(report.totalMinutes)} timmar att fakturera`}
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
            {report.byCustomer.length > 0 && (
              <Summary title="Per kund" groups={report.byCustomer} />
            )}
            <Summary title="Per anställd" groups={report.byEmployee} />
            <Summary title="Per arbetsmoment" groups={report.byMoment} />
            {report.byIndirect.length > 0 && (
              <Summary title="Improduktiv tid" groups={report.byIndirect} />
            )}
          </div>

          {view === "kund" ? (
            <Card>
              <CardHeader
                title="Summerat per kund"
                description={`${report.byCustomer.length} kunder i perioden. Ordrar utan kund utelämnas.`}
              />
              {report.byCustomer.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-neutral-500">
                  Ingen av stämplingarna hör till en order med kund. Välj kund
                  på ordern, så samlas tiden här.
                </p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Kund</Th>
                      <Th numeric>Stämplingar</Th>
                      <Th numeric>Tid (tim:min)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byCustomer.map((group) => (
                      <Tr key={group.key}>
                        <Td>
                          {/* Namnet leder till kundsidan. Den som just sett
                              att en kund tagit mycket tid vill oftast veta
                              vad den tiden gick till. */}
                          <Link
                            href={`/admin/kunder/${group.key}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {group.label}
                          </Link>
                        </Td>
                        <Td numeric muted>
                          {group.entries}
                        </Td>
                        <Td numeric>{formatDuration(group.minutes)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          ) : view === "person" ? (
            <Card>
              <CardHeader
                title="Summerat per anställd"
                description={`${report.byEmployee.length} personer i perioden.`}
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Anställd</Th>
                    <Th numeric>Stämplingar</Th>
                    <Th numeric>Tid (tim:min)</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.byEmployee.map((group) => (
                    <Tr key={group.key}>
                      <Td>
                        <span className="font-medium">{group.label}</span>
                        {group.sublabel && (
                          <span className="ml-2 text-neutral-400">
                            {group.sublabel}
                          </span>
                        )}
                      </Td>
                      <Td numeric muted>
                        {group.entries}
                      </Td>
                      <Td numeric>{formatDuration(group.minutes)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : view === "persondetalj" ? (
            <div className="space-y-4">
              {employeeGroups.map((group) => (
                <Card key={group.heading}>
                  <CardHeader
                    title={group.heading}
                    description={`${group.rows.length} ${
                      group.rows.length === 1 ? "stämpling" : "stämplingar"
                    }, äldsta först.`}
                    action={
                      <span className="text-[13px] font-medium tabular-nums text-neutral-900">
                        {formatDuration(group.minutes)}
                      </span>
                    }
                  />
                  <Table>
                    <thead>
                      <tr>
                        <Th>Order</Th>
                        <Th>Moment</Th>
                        <Th>In</Th>
                        <Th>Ut</Th>
                        <Th numeric>Tid (tim:min)</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <EntryRow
                          key={row.id}
                          row={row}
                          timeZone={timeZone}
                        />
                      ))}
                    </tbody>
                  </Table>
                </Card>
              ))}
            </div>
          ) : (
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
                  <Th numeric>Tid (tim:min)</Th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <EntryRow
                    key={row.id}
                    row={row}
                    timeZone={timeZone}
                    showEmployee
                  />
                ))}
              </tbody>
            </Table>
          </Card>
          )}
        </>
      )}
    </>
  );
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
            och {groups.length - 8} till. Samtliga finns i Excel-exporten
          </li>
        )}
      </ul>
    </Card>
  );
}

/**
 * En rad i stämplingslistan.
 *
 * Delad mellan den platta listan och den grupperade per anställd, så att de
 * två inte hinner glida isär i vad de visar. Anställdkolumnen är valfri:
 * i den grupperade vyn står namnet i rubriken över tabellen.
 */
function EntryRow({
  row,
  timeZone,
  showEmployee = false,
}: {
  row: ReportRow;
  timeZone: string;
  showEmployee?: boolean;
}) {
  return (
    <Tr>
      {showEmployee && (
        <Td>
          {row.employeeName}
          {row.employeeNumber && (
            <span className="ml-2 text-neutral-400">{row.employeeNumber}</span>
          )}
        </Td>
      )}
      <Td>
        {row.orderNumber ?? <Badge tone="muted">Improduktiv</Badge>}
        {row.customerName && (
          <span className="ml-2 text-neutral-500">{row.customerName}</span>
        )}
      </Td>
      <Td muted>{row.momentName}</Td>
      <Td muted>{formatDateTime(row.clockInAt, timeZone)}</Td>
      <Td muted>
        {row.clockOutAt ? (
          formatDateTime(row.clockOutAt, timeZone)
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
  );
}

/**
 * Stämplingarna grupperade per anställd.
 *
 * Samma regel som i report-pdf.ts, med flit upprepad i stället för delad:
 * skärmen och PDF:en får sina rader ur samma ReportResult, och en gemensam
 * hjälpfunktion hade behövt ligga i report.ts — där den tvingat på
 * Excel-exporten en gruppering ingen bett om.
 */
function groupByEmployee(
  rows: ReportResult["rows"]
): { heading: string; rows: ReportRow[]; minutes: number }[] {
  const byEmployee = new Map<string, ReportRow[]>();

  for (const row of rows) {
    const heading = row.employeeNumber
      ? `${row.employeeName} (${row.employeeNumber})`
      : row.employeeName;

    const existing = byEmployee.get(heading) ?? [];
    existing.push(row);
    byEmployee.set(heading, existing);
  }

  return [...byEmployee.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "sv"))
    .map(([heading, grouped]) => ({
      heading,
      // Äldsta först. Rapporten levereras nyast först, vilket är fel håll när
      // en vecka ska läsas igenom med den det gäller.
      rows: [...grouped].sort(
        (a, b) => a.clockInAt.getTime() - b.clockInAt.getTime()
      ),
      minutes: grouped.reduce((total, row) => total + row.minutes, 0),
    }));
}
