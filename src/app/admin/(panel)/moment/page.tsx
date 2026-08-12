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
import { createMoment, renameMoment, toggleMoment } from "./actions";

export const dynamic = "force-dynamic";

export default async function MomentsPage() {
  const { db } = await requireAdmin();

  const moments = await db.workMoment.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      _count: { select: { timeEntries: true } },
    },
  });

  const newMoment = (
    <FormDialog
      trigger="Nytt arbetsmoment"
      title="Lägg till arbetsmoment"
      description="En kort lista rekommenderas. Fem till tio moment ger överskådliga val på skärmen och läsbara rapporter."
      action={createMoment}
      submitLabel="Lägg till"
    >
      <Field label="Namn">
        <Input name="name" placeholder="Svetsning" required autoFocus />
      </Field>
    </FormDialog>
  );

  return (
    <>
      <PageHeader
        title="Arbetsmoment"
        description="Den typ av arbete tiden avser. Väljs efter order på stämplingsskärmen."
        action={newMoment}
      />

      {moments.length === 0 ? (
        <EmptyState
          title="Inga arbetsmoment upplagda"
          description="Minst ett arbetsmoment krävs för att kunna stämpla in. Börja med de vanligaste och komplettera vid behov."
          action={newMoment}
        />
      ) : (
        <Card>
          <CardHeader
            title={`${moments.length} moment`}
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
              {moments.map((moment) => (
                <Tr key={moment.id} dimmed={!moment.active}>
                  <Td>
                    <span className="font-medium">{moment.name}</span>
                  </Td>
                  <Td>
                    {moment.active ? (
                      <Badge tone="active">Aktiv</Badge>
                    ) : (
                      <Badge tone="muted">Avaktiverad</Badge>
                    )}
                  </Td>
                  <Td numeric muted>
                    {moment._count.timeEntries}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <FormDialog
                        trigger="Ändra"
                        triggerTone="ghost"
                        title="Ändra arbetsmoment"
                        action={renameMoment}
                        submitLabel="Spara"
                      >
                        <input type="hidden" name="id" value={moment.id} />
                        <Field label="Namn">
                          <Input
                            name="name"
                            defaultValue={moment.name}
                            required
                            autoFocus
                          />
                        </Field>
                      </FormDialog>

                      <form action={toggleMoment}>
                        <input type="hidden" name="id" value={moment.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(moment.active)}
                        />
                        <Button type="submit" tone="secondary">
                          {moment.active ? "Avaktivera" : "Återaktivera"}
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
