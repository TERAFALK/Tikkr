import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { unsafeGlobalPrisma } from "@/lib/db";
import FilterForm from "@/components/admin/FilterForm";
import TimesheetView from "@/components/admin/TimesheetView";
import WeekStepper from "@/components/admin/WeekStepper";
import PrintButton from "@/components/admin/PrintButton";
import { datePresets } from "@/lib/date-presets";
import { weekStep } from "@/lib/week-nav";
import type { TimesheetDayRow } from "@/components/admin/TimesheetTable";
import {
  Alert,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Stat,
} from "@/components/ui";
import { buildPayrollPeriod, currentFlexMinutes } from "@/lib/payroll";
import {
  formatDate,
  formatDuration,
  formatSignedDuration,
  formatTime,
} from "@/lib/format";
import { startOfWeekIn, addDaysInZone, parseLocalDate, toDateInput } from "@/lib/time-zone";
import ActionDialog from "@/components/ui/ActionDialog";
import { adjustFlexBalance, saveAbsence, type BalanceState } from "./actions";

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
  const session = await requireAdmin();
  await requireModule(session, "PAYROLL");

  const { db, companyId } = session;
  const params = await searchParams;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });

  const timeZone = company?.timezone ?? "Europe/Stockholm";
  const now = new Date();

  const [employees, reasons] = await Promise.all([
    db.employee.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, employeeNumber: true, active: true },
    }),
    // Kundens egna frånvaroorsaker. Bara de aktiva går att registrera ny
    // frånvaro på; en avaktiverad finns kvar för att gamla poster ska gå att
    // läsa.
    db.absenceReason.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

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

  // SALDOT IDAG, och inte periodens utgående. Rutan som justerar saldot
  // ändrar det här talet, och ett annat tal i samma ruta hade gjort
  // justeringen omöjlig att förutse: en period som slutar i framtiden stänger
  // på ett annat saldo än det personen har just nu.
  const flexToday = employeeId
    ? await currentFlexMinutes(db, timeZone, employeeId)
    : null;

  // Pilarna och veckonumret. Samma räkning som på Rapporter och Stämplingar,
  // se weekStep.
  const week = weekStep("/admin/tidrapport", params, timeZone);

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
                {employee.active ? "" : " (avaktiverad)"}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Från">
          <input
            type="date"
            name="from"
            defaultValue={toDateInput(from, timeZone)}
            className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </Field>

        <Field label="Till">
          <input
            type="date"
            name="to"
            defaultValue={toDateInput(to, timeZone)}
            className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-blue-600"
          />
        </Field>

        {/* STEGA EN VECKA I TAGET. Hela perioden flyttas, lika lång som den
            var, så att den som valt en längre period behåller sin längd. */}
        <div className="flex items-end">
          <WeekStepper {...week} />
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

  /*
   * FÖRRA VECKAN FÖR HELA PERSONALEN, en person per sida.
   *
   * Utan `anstalld` tar rutten med alla aktiva, se timesheet/route.ts. Varje
   * papper bär personens dagrader OCH summeringen med planerad tid, flex och
   * komp — det är den summeringen som gör utskriften värd att dela ut.
   *
   * Den hämtar alltså tidrapporten och inte rapportexporten. Knappen gjorde
   * det förut, och kunde då inte få med summeringen: de siffrorna är
   * löneunderlagets, och `report-pdf.ts` får aldrig läsa det. Se
   * avgränsningen i CLAUDE.md.
   *
   * Konsekvensen är att knappen hör till lönemodulen, vilket den här sidan
   * redan gör.
   */
  const lastWeek = datePresets(timeZone).lastWeek;
  const lastWeekHref =
    `/api/admin/export/timesheet?from=${lastWeek.from}&to=${lastWeek.to}`;

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
            {/* JUSTERA SALDOT FÖR HAND. Skriv vad det ska vara; servern
                räknar ut skillnaden mot det framräknade och flyttar det
                ingående saldot. Se adjustFlexBalance.

                Inte för en timanställd: det finns inget saldo att justera. */}
            {!period.employee.hourly && (
            <ActionDialog<BalanceState>
              trigger="Justera flexsaldo"
              title={`Flexsaldo för ${period.employee.name}`}
              description={
                flexToday === null
                  ? undefined
                  : `Saldot är ${formatSignedDuration(flexToday)} idag.`
              }
              action={adjustFlexBalance}
              initial={{}}
              submitLabel="Spara"
            >
              <input type="hidden" name="employeeId" value={employeeId} />
              <Field label="Nytt saldo" hint="Tim:min, t.ex. 2:15 eller −0:45">
                <Input
                  name="flex"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                />
              </Field>
            </ActionDialog>
            )}

            {/* Skriver ut direkt i stället för att ladda ner. Utskriften är
                det den finns för, och den som ändå vill ha en fil väljer
                "Spara som PDF" i skrivardialogen. */}
            <PrintButton
              href={lastWeekHref}
              label="Förra veckan per anställd"
            />

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
          value={formatDuration(period.totals.planned)}
          hint="tim:min"
        />
        <Stat
          label="Närvarotid"
          value={formatDuration(period.totals.worked)}
          hint="tim:min"
        />
        {/* FLEX OCH KOMP GÖMS FÖR EN TIMANSTÄLLD. Hen mäts inte mot något
            schema, så det finns ingen planerad tid att ligga över eller under.
            Två rutor med 0:00 hade sett ut som ett saldo i jämvikt, vilket är
            något helt annat än att saldot inte finns. */}
        {!period.employee.hourly && (
          <>
            <Stat
              label="Flextid, perioden"
              value={formatSignedDuration(period.totals.flex)}
              tone={period.totals.flex >= 0 ? "active" : "warning"}
              hint={`saldo ${formatSignedDuration(period.flex.closing)}`}
            />
            <Stat
              label="Komptid"
              value={formatSignedDuration(period.comp.closing)}
              hint={`${formatSignedDuration(period.comp.earned)} intjänat, ${formatDuration(
                period.comp.taken
              )} uttaget`}
            />
          </>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Produktiv tid"
          value={formatDuration(period.totals.productive)}
        />
        <Stat
          label="Improduktiv tid"
          value={formatDuration(period.totals.indirect)}
        />
        <Stat
          label="Frånvaro"
          value={formatDuration(period.totals.absence)}
        />
      </div>

      <div className="mb-6">
        <TimesheetView
          days={days}
          employeeId={employeeId}
          employeeName={period.employee.name}
          reasons={reasons}
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
                    {formatDuration(row.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {period.absenceByReason.length > 0 && (
          <Card>
            <CardHeader title="Frånvaro" />
            <ul className="divide-y divide-neutral-100">
              {period.absenceByReason.map((row) => (
                <li
                  key={row.reason}
                  className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-[13px]"
                >
                  <span className="text-neutral-700">{row.reason}</span>
                  <span className="tabular-nums font-medium text-neutral-900">
                    {formatDuration(row.minutes)}
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
