import { requireAdmin } from "@/lib/admin-session";
import EmployeeDialog from "@/components/admin/EmployeeDialog";
import EmployeeAvatar from "@/components/ui/EmployeeAvatar";
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

export default async function EmployeesPage() {
  const { db } = await requireAdmin();

  const employees = await db.employee.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      employeeNumber: true,
      // Bara OM ett foto finns, aldrig själva bytena. En lista med tjugo
      // porträtt skulle annars bli flera megabyte i sidans svar.
      photoMimeType: true,
      _count: { select: { timeEntries: true } },
    },
  });

  const newEmployee = (
    <EmployeeDialog
      trigger="Ny anställd"
      title="Lägg till anställd"
      description="Visas som knapp på stämplingsskärmen."
      action={createEmployee}
      submitLabel="Lägg till"
    />
  );

  return (
    <>
      <PageHeader
        title="Anställda"
        description="Avaktiverade döljs på skärmen men behåller sin tid."
        action={newEmployee}
      />

      {employees.length === 0 ? (
        <EmptyState
          title="Inga anställda upplagda"
          description="Lägg upp de personer som ska kunna stämpla."
          action={newEmployee}
        />
      ) : (
        <Card>
          <CardHeader
            title={`${employees.length} ${employees.length === 1 ? "person" : "personer"}`}
            description="Aktiva först."
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
                        description="Namn, anställningsnummer och bild."
                        action={updateEmployee}
                        submitLabel="Spara"
                        employee={{
                          id: employee.id,
                          name: employee.name,
                          employeeNumber: employee.employeeNumber,
                          hasPhoto: Boolean(employee.photoMimeType),
                        }}
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
