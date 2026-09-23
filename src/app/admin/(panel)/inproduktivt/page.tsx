import { requireAdmin } from "@/lib/admin-session";
import FormDialog from "@/components/admin/FormDialog";
import {
  Alert,
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
import {
  createIndirectMoment,
  renameIndirectMoment,
  toggleIndirectMoment,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function IndirectMomentsPage() {
  const { db } = await requireAdmin();

  const moments = await db.indirectMoment.findMany({
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
      trigger="Nytt inproduktivt moment"
      title="Lägg till inproduktivt moment"
      description="Tid som läggs ner men inte på någon kundorder."
      action={createIndirectMoment}
      submitLabel="Lägg till"
    >
      <Field label="Namn">
        <Input name="name" placeholder="Städning" required autoFocus />
      </Field>
    </FormDialog>
  );

  return (
    <>
      <PageHeader
        title="Inproduktiv tid"
        description="Städning, möten och underhåll. Väljs för sig på stämplingsskärmen."
        action={newMoment}
      />

      <div className="mb-4">
        <Alert tone="info">
          Tid som stämplas här hör inte till någon kund och kommer aldrig med i
          ett orderunderlag eller en efterkalkyl. Den syns i rapporterna, så att
          ni ser vart timmarna tar vägen.
        </Alert>
      </div>

      {moments.length === 0 ? (
        <EmptyState
          title="Inga inproduktiva moment upplagda"
          description="Utan dem visas ingen knapp för inproduktiv tid på stämplingsskärmen."
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
                        title="Ändra inproduktivt moment"
                        action={renameIndirectMoment}
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

                      <form action={toggleIndirectMoment}>
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
