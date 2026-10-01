import { requireAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import EmployeeDialog from "@/components/admin/EmployeeDialog";
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
 * Arbetstiderna i ändra-rutan hör till lönemodulen och visas bara för den som
 * har den. Grinden är `hasModule` och inte bara en dold kryssruta: sidan och
 * åtgärden är samma väg in, och en gömd ruta är ingen spärr. Se
 * lib/company-modules.ts och tests/module-coverage.test.ts.
 */
export default async function EmployeesPage() {
  const session = await requireAdmin();
  const { db, companyId } = session;

  const payroll = await hasModule(companyId, "PAYROLL");

  const employees = await db.employee.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
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
      _count: { select: { timeEntries: true } },
    },
  });

  // Hämtas i EN fråga för hela listan och inte en per person. Tjugo anställda
  // hade annars blivit tjugo uppslag för fält som oftast är tomma.
  const schedules: Map<string, ScheduleDayInput[]> = payroll
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
    />
  );

  return (
    <>
      <PageHeader
        title="Anställda"
        action={newEmployee}
      />

      {employees.length === 0 ? (
        <EmptyState
          title="Inga anställda upplagda"
          action={newEmployee}
        />
      ) : (
        <Card>
          <CardHeader
            title={`${employees.length} ${employees.length === 1 ? "person" : "personer"}`}
          />
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
                    {employee.active ? (
                      <Badge tone="active">Aktiv</Badge>
                    ) : (
                      <Badge tone="muted">Avaktiverad</Badge>
                    )}
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
                        }}
                        payroll={payroll}
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
