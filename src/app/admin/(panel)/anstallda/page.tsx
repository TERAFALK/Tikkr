import { requireAdmin } from "@/lib/admin-session";
import FormDialog from "@/components/admin/FormDialog";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { createEmployee, renameEmployee, toggleEmployee } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const { db } = await requireAdmin();

  const employees = await db.employee.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      _count: { select: { timeEntries: true } },
    },
  });

  const newEmployee = (
    <FormDialog
      trigger="Ny anställd"
      title="Lägg till anställd"
      description="Namnet blir en knapp på stämplingsskärmen. Skriv det som folk känner igen det, inte som det står i personalsystemet."
      action={createEmployee}
      submitLabel="Lägg till"
    >
      <Field label="Namn">
        <Input name="name" placeholder="Anna Andersson" required autoFocus />
      </Field>
    </FormDialog>
  );

  return (
    <>
      <PageHeader
        title="Anställda"
        description="De som visas på stämplingsskärmen. Avaktiverade döljs där men behåller sin registrerade tid."
        action={newEmployee}
      />

      {employees.length === 0 ? (
        <EmptyState
          title="Inga anställda upplagda"
          description="Lägg till alla som ska kunna stämpla. Utan minst en anställd visar skärmen ingenting."
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
                    <span className="font-medium">{employee.name}</span>
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
                      <FormDialog
                        trigger="Ändra"
                        triggerTone="ghost"
                        title="Ändra namn"
                        action={renameEmployee}
                        submitLabel="Spara"
                      >
                        <input type="hidden" name="id" value={employee.id} />
                        <Field label="Namn">
                          <Input
                            name="name"
                            defaultValue={employee.name}
                            required
                            autoFocus
                          />
                        </Field>
                      </FormDialog>

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
