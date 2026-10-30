import { requireAdmin } from "@/lib/admin-session";
import { hasModule, hasWorkHours } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import { toDateInput } from "@/lib/time-zone";
import { unsafeGlobalPrisma } from "@/lib/db";
import { findAgreement } from "@/lib/collective-agreements";
import { listPaging } from "@/lib/paging";
import EmployeeDialog from "@/components/admin/EmployeeDialog";
import SearchForm from "@/components/admin/SearchForm";
import Pager from "@/components/platform/Pager";
import EmployeeAvatar from "@/components/ui/EmployeeAvatar";
import type { ScheduleDayValue } from "@/components/admin/ScheduleDays";
import {
  formatMinuteOfDay,
  ownScheduleDays,
  type ScheduleDayInput,
} from "@/lib/schedule";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { createEmployee, toggleEmployee, updateEmployee } from "./actions";

export const metadata = { title: "Anställda · Tikkr" };

export const dynamic = "force-dynamic";

/**
 * ANSTÄLLDA.
 *
 * TIMKOSTNADEN STÅR INTE I LISTAN (ändrat 2026-09-29). Den fanns som en egen
 * kolumn, och därmed syntes vad varje person kostar för den som råkade gå
 * förbi skärmen. Satsen finns kvar under Ändra, där den hör hemma: den som
 * öppnar rutan har ett ärende dit. Samma hållning som att kiosken aldrig visar
 * belopp.
 *
 * Arbetstiderna i ändra-rutan visas för den som har löneunderlaget eller
 * planeringen (ändrat 2026-10-17, se work-hours.ts), och resten av
 * lönefälten bara med löneunderlaget. Grinden är `hasModule` och
 * `hasWorkHours` och inte bara en dold kryssruta: sidan och
 * åtgärden är samma väg in, och en gömd ruta är ingen spärr. Se
 * lib/company-modules.ts och tests/module-coverage.test.ts.
 *
 * Sökningen ligger i adressen som `q`, som i kundregistret, och tittar på namn
 * och anställningsnummer.
 */
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sida?: string; antal?: string }>;
}) {
  const session = await requireAdmin();
  const { db, companyId } = session;
  const { q, sida, antal } = await searchParams;
  const query = q?.trim() ?? "";

  const payroll = await hasModule(companyId, "PAYROLL");
  // De egna arbetstiderna finns med löneunderlaget ELLER planeringen, som
  // båda läser dem (ändrat 2026-10-17). Se work-hours.ts.
  const workHours = await hasWorkHours(companyId);
  const timeZone = await companyTimeZone(companyId);

  // Arbetstidsformerna i företagets avtal, för valet i rutan. Utan avtal, eller
  // utan löneunderlaget, finns inget val att göra.
  const company = payroll
    ? await unsafeGlobalPrisma.company.findUnique({
        where: { id: companyId },
        select: { atfAgreement: true },
      })
    : null;
  const agreement = findAgreement(company?.atfAgreement);
  const atfForms = agreement
    ? {
        defaultForm: agreement.defaultForm,
        forms: agreement.forms.map(({ key, label }) => ({ key, label })),
      }
    : undefined;

  const employeeFilter = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { employeeNumber: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  // Antalet först, så att ett sidnummer bortom slutet kan visa sista sidan.
  const total = await db.employee.count({ where: employeeFilter });
  const page = listPaging(total, { sida, antal });

  const employees = await db.employee.findMany({
    where: employeeFilter,
    // Id:t sist: Postgres lovar ingenting om rader som är lika, och två
    // personer med samma namn kunde då byta plats mellan två sidor i listan.
    orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
    skip: page.skip,
    take: page.take,
    select: {
      id: true,
      name: true,
      active: true,
      employeeNumber: true,
      costRateOre: true,
      // Bara OM ett foto finns, aldrig själva bytena. En lista med tjugo
      // porträtt skulle annars bli flera megabyte i sidans svar.
      photoMimeType: true,
      // Bara OM en kod finns. Hashen lamnar aldrig servern.
      flexCodeHash: true,
      hourly: true,
      balanceOpeningDate: true,
      atfWorkForm: true,
      _count: { select: { timeEntries: true } },
    },
  });

  // Hämtas i EN fråga för hela listan och inte en per person. Tjugo anställda
  // hade annars blivit tjugo uppslag för fält som oftast är tomma.
  const schedules: Map<string, ScheduleDayInput[]> = workHours
    ? await ownScheduleDays(
        db,
        employees.map((employee) => employee.id)
      )
    : new Map();

  const newEmployee = (
    <EmployeeDialog
      trigger="Ny anställd"
      title="Lägg till anställd"
      action={createEmployee}
      submitLabel="Lägg till"
      payroll={payroll}
      workHours={workHours}
      atfForms={atfForms}
    />
  );

  return (
    <>
      <PageHeader
        title="Anställda"
        help="anstallda"
        action={newEmployee}
      />

      {total === 0 && !query ? (
        <EmptyState
          title="Inga anställda upplagda"
          action={newEmployee}
        />
      ) : (
        <Card>
          <CardHeader
            title={
              query
                ? `${total} ${total === 1 ? "träff" : "träffar"}`
                : `${total} ${total === 1 ? "person" : "personer"}`
            }
            description={query ? `Sökning på ”${query}”` : undefined}
            action={
              <SearchForm
                query={query}
                label="Sök anställda"
                placeholder="Namn, anställningsnr…"
                clearHref="/admin/anstallda"
                perPage={page.take}
              />
            }
          />

          {total === 0 ? (
            <p className="px-5 py-6 text-[13px] text-neutral-500">
              Ingen anställd matchar ”{query}”. Sökningen tittar på namn och
              anställningsnummer.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Namn</Th>
                  <Th>Anställningsnummer</Th>
                  <Th>Status</Th>
                  <Th numeric>Stämplingar</Th>
                  <Th>
                    <span className="sr-only">Åtgärder</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <Tr key={employee.id} dimmed={!employee.active}>
                    <Td>
                      <span className="flex items-center gap-3">
                        <EmployeeAvatar
                          employeeId={employee.id}
                          name={employee.name}
                          hasPhoto={Boolean(employee.photoMimeType)}
                          size={36}
                        />
                        <span className="font-medium">{employee.name}</span>
                      </span>
                    </Td>
                    <Td muted>
                      {employee.employeeNumber ?? (
                        <span className="text-neutral-300">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {employee.active ? (
                          <Badge tone="active">Aktiv</Badge>
                        ) : (
                          <Badge tone="muted">Avaktiverad</Badge>
                        )}

                        {/* Syns i listan och inte bara i rutan: att en person
                            saknar flexsaldo är det första man undrar över när
                            man står i tidrapporten. */}
                        {payroll && employee.hourly && (
                          <Badge>Timanställd</Badge>
                        )}
                      </span>
                    </Td>
                    <Td numeric muted>
                      {employee._count.timeEntries}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <EmployeeDialog
                          trigger="Ändra"
                          triggerTone="ghost"
                          title="Ändra anställd"
                          action={updateEmployee}
                          submitLabel="Spara"
                          employee={{
                            id: employee.id,
                            name: employee.name,
                            employeeNumber: employee.employeeNumber,
                            costRateOre: employee.costRateOre,
                            hasPhoto: Boolean(employee.photoMimeType),
                            hasFlexCode: Boolean(employee.flexCodeHash),
                            hourly: employee.hourly,
                            startDate: employee.balanceOpeningDate
                              ? toDateInput(employee.balanceOpeningDate, timeZone)
                              : null,
                            atfWorkForm: employee.atfWorkForm,
                          }}
                          payroll={payroll}
                          workHours={workHours}
                          atfForms={atfForms}
                          scheduleDays={toDayValues(schedules.get(employee.id))}
                        />

                        <form action={toggleEmployee}>
                          <input type="hidden" name="id" value={employee.id} />
                          <input
                            type="hidden"
                            name="active"
                            value={String(employee.active)}
                          />
                          <Button type="submit" tone="secondary">
                            {employee.active ? "Avaktivera" : "Återaktivera"}
                          </Button>
                        </form>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}

          <Pager
            paging={page}
            total={total}
            unit="personer"
            path="/admin/anstallda"
            keep={{ q: query }}
          />
        </Card>
      )}
    </>
  );
}

/**
 * Minuter från midnatt tillbaka till klockslag.
 *
 * Databasen räknar i minuter eftersom ett schema ska gå att räkna på;
 * formuläret visar "06:30" eftersom det är vad en människa skriver.
 */
function toDayValues(
  days:
    | {
        weekday: number;
        startMinute: number;
        endMinute: number;
        breaks: { startMinute: number; endMinute: number }[];
      }[]
    | undefined
): ScheduleDayValue[] | null {
  if (!days || days.length === 0) return null;

  return days.map((day) => ({
    weekday: day.weekday,
    start: formatMinuteOfDay(day.startMinute),
    end: formatMinuteOfDay(day.endMinute),
    breaks: day.breaks.map((rest) => ({
      start: formatMinuteOfDay(rest.startMinute),
      end: formatMinuteOfDay(rest.endMinute),
    })),
  }));
}
