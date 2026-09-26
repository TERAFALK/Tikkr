import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import FilterForm from "@/components/admin/FilterForm";
import TimesheetView from "@/components/admin/TimesheetView";
import type { TimesheetDayRow } from "@/components/admin/TimesheetTable";
import {
  Alert,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Stat,
} from "@/components/ui";
import { buildPayrollPeriod } from "@/lib/payroll";
import { ABSENCE_LABELS } from "@/lib/absence";
import { formatDate, formatDecimalHours, formatTime } from "@/lib/format";
import { startOfWeekIn, addDaysInZone, parseLocalDate, toDateInput } from "@/lib/time-zone";
import { saveAbsence } from "./actions";

/**
 * TIDRAPPORT PER ANSTÄLLD — LÖNEUNDERLAGET.
 *
 * Ett annat dokument än rapporterna, med en annan mottagare. Rapporterna
 * svarar på vad en order kostat och går vidare till kundens kund;
 * tidrapporten svarar på hur mycket en person arbetat och går till lönen.
 *
 * Samma timme räknas olika i de två. Kör en operatör två maskiner 08–12 är
 * det åtta maskintimmar att fakturera men fyra timmar på jobbet. Se
 * src/lib/payroll.ts.
 */

export const dynamic = "force-dynamic";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db, companyId } = await requireAdmin();
  const params = await searchParams;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });

  const timeZone = company?.timezone ?? "Europe/Stockholm";
  const now = new Date();

  const employees = await db.employee.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, employeeNumber: true, active: true },
  });

  // Förvald period är innevarande vecka. Det är den period en verkstad tänker
  // i, och kundens gamla rapport är också veckovis.
  const weekStart = startOfWeekIn(now, timeZone);
  const from =
    parseLocalDate(params.from ?? "", timeZone) ?? weekStart;
  const to =
    parseLocalDate(params.to ?? "", timeZone) ??
    addDaysInZone(from, 6, timeZone);

  const employeeId = params.anstalld || employees[0]?.id || "";

  const period = employeeId
    ? await buildPayrollPeriod(db, timeZone, employeeId, from, to)
    : null;

  const filters = (
    <Card className="mb-6">
      <CardHeader title="Period" />
      <FilterForm className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Anställd">
          <Select name="anstalld" defaultValue={employeeId}>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
                {employee.employeeNumber ? ` (${employee.employeeNumber})` : ""}
                {employee.active ? "" : " — avaktiverad"}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Från">
          <input
            type="date"
            name="from"
            defaultValue={toDateInput(from, timeZone)}
            className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </Field>

        <Field label="Till">
          <input
            type="date"
            name="to"
            defaultValue={toDateInput(to, timeZone)}
            className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </Field>

        <div className="flex items-end gap-2">
          <ButtonLink
            href={`/admin/tidrapport?anstalld=${employeeId}&from=${toDateInput(
              addDaysInZone(from, -7, timeZone),
              timeZone
            )}&to=${toDateInput(addDaysInZone(to, -7, timeZone), timeZone)}`}
            tone="secondary"
          >
            Föregående vecka
          </ButtonLink>
        </div>
      </FilterForm>
    </Card>
  );

  if (employees.length === 0) {
    return (
      <>
        <PageHeader title="Tidrapport" />
        <EmptyState
          title="Inga anställda upplagda"
        />
      </>
    );
  }

  if (!period) {
    return (
      <>
        <PageHeader title="Tidrapport" />
        {filters}
        <EmptyState title="Välj en anställd" />
      </>
    );
  }

  const days: TimesheetDayRow[] = period.days.map((day) => ({
    date: toDateInput(day.date, timeZone),
    dayLabel: `${dayName(day.weekday)} ${formatDate(day.date, timeZone)}`,
    weekday: day.weekday,
    plannedMinutes: day.plannedMinutes,
    workedMinutes: day.workedMinutes,
    productiveMinutes: day.productiveMinutes,
    indirectMinutes: day.indirectMinutes,
    breakMinutes: day.breakMinutes,
    absenceMinutes: day.absenceMinutes,
    flexMinutes: day.flexMinutes,
    absences: day.absences,
    entries: day.entries.map((entry) => ({
      id: entry.id,
      from: formatTime(entry.clockInAt, timeZone),
      to: entry.clockOutAt ? formatTime(entry.clockOutAt, timeZone) : null,
      minutes: entry.minutes,
      label: entry.label,
      momentName: entry.momentName,
      kind: entry.kind,
      needsReview: entry.needsReview,
    })),
    breaks: day.breaks.map((rest) => ({
      id: rest.id,
      name: rest.name,
      from: formatTime(rest.startedAt, timeZone),
      to: rest.endedAt ? formatTime(rest.endedAt, timeZone) : null,
      minutes: rest.minutes,
    })),
  }));

  const exportHref =
    `/api/admin/export/timesheet?anstalld=${employeeId}` +
    `&from=${toDateInput(from, timeZone)}&to=${toDateInput(to, timeZone)}`;

  return (
    <>
      <PageHeader
        title="Tidrapport"
        description={`${period.employee.name} · ${formatDate(
          from,
          timeZone
        )} – ${formatDate(to, timeZone)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={exportHref} tone="secondary">
              PDF
            </ButtonLink>
          </div>
        }
      />

      {!period.schedule && (
        <div className="mb-4">
          <Alert tone="warning">
            {period.employee.name} har inget arbetstidsschema.{" "}
            <Link
              href="/admin/installningar/schema"
              className="font-medium underline"
            >
              Lägg upp ett schema
            </Link>
            .
          </Alert>
        </div>
      )}

      {filters}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Planerad tid"
          value={formatDecimalHours(period.totals.planned)}
          hint="timmar"
        />
        <Stat
          label="Närvarotid"
          value={formatDecimalHours(period.totals.worked)}
          hint="timmar"
        />
        <Stat
          label="Flextid, perioden"
          value={signedHours(period.totals.flex)}
          tone={period.totals.flex >= 0 ? "active" : "warning"}
          hint={`saldo ${signedHours(period.flex.closing)}`}
        />
        <Stat
          label="Komptid"
          value={signedHours(period.comp.closing)}
          hint={`${signedHours(period.comp.earned)} intjänat, ${formatDecimalHours(
            period.comp.taken
          )} uttaget`}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Produktiv tid"
          value={formatDecimalHours(period.totals.productive)}
        />
        <Stat
          label="Improduktiv tid"
          value={formatDecimalHours(period.totals.indirect)}
        />
        <Stat
          label="Frånvaro"
          value={formatDecimalHours(period.totals.absence)}
        />
      </div>

      <div className="mb-6">
        <TimesheetView
          days={days}
          employeeId={employeeId}
          employeeName={period.employee.name}
          absenceAction={saveAbsence}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {period.indirectByMoment.length > 0 && (
          <Card>
            <CardHeader title="Improduktiv tid" />
            <ul className="divide-y divide-neutral-100">
              {period.indirectByMoment.map((row) => (
                <li
                  key={row.name}
                  className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-[13px]"
                >
                  <span className="text-neutral-700">{row.name}</span>
                  <span className="tabular-nums font-medium text-neutral-900">
                    {formatDecimalHours(row.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {period.absenceByType.length > 0 && (
          <Card>
            <CardHeader title="Frånvaro" />
            <ul className="divide-y divide-neutral-100">
              {period.absenceByType.map((row) => (
                <li
                  key={row.type}
                  className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-[13px]"
                >
                  <span className="text-neutral-700">
                    {ABSENCE_LABELS[row.type]}
                  </span>
                  <span className="tabular-nums font-medium text-neutral-900">
                    {formatDecimalHours(row.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

function dayName(weekday: number): string {
  return ["Må", "Ti", "On", "To", "Fr", "Lö", "Sö"][weekday - 1];
}

/** Decimaltimmar med tecken. Plus skrivs ut, så att noll inte läses som plus. */
function signedHours(minutes: number): string {
  if (Math.round(minutes) === 0) return "0,00";
  const sign = minutes > 0 ? "+" : "−";
  return `${sign}${formatDecimalHours(Math.abs(minutes))}`;
}
