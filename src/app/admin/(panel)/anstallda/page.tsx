import { requireAdmin } from "@/lib/admin-session";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
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

  return (
    <>
      <PageHeader
        title="Anställda"
        description="De som visas på stämplingsskärmen. Avaktiverade döljs där men behåller sin registrerade tid."
      />

      <Card className="mb-6">
        <CardHeader title="Lägg till anställd" />
        <form action={createEmployee} className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-64 flex-1">
            <Input name="name" placeholder="För- och efternamn" required />
          </div>
          <Button type="submit">Lägg till</Button>
        </form>
      </Card>

      {employees.length === 0 ? (
        <EmptyState
          title="Inga anställda upplagda"
          description="Lägg till alla som ska kunna stämpla. Namnen visas som knappar på skärmen, så skriv dem som folk känner igen dem."
        />
      ) : (
        <Card>
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
                    <form action={renameEmployee} className="flex gap-2">
                      <input type="hidden" name="id" value={employee.id} />
                      <Input
                        name="name"
                        defaultValue={employee.name}
                        className="max-w-xs"
                        aria-label={`Namn för ${employee.name}`}
                      />
                      <Button type="submit" tone="secondary">
                        Spara
                      </Button>
                    </form>
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
