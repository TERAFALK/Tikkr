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

  return (
    <>
      <PageHeader
        title="Arbetsmoment"
        description="Vad tiden läggs på — svetsning, fräsning, montering. Väljs efter ordern på stämplingsskärmen."
      />

      <Card className="mb-6">
        <CardHeader title="Lägg till arbetsmoment" />
        <form action={createMoment} className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-64 flex-1">
            <Input name="name" placeholder="Svetsning" required />
          </div>
          <Button type="submit">Lägg till</Button>
        </form>
      </Card>

      {moments.length === 0 ? (
        <EmptyState
          title="Inga arbetsmoment upplagda"
          description="Håll listan kort. Många moment gör skärmen svårare att använda, och rapporterna svårare att läsa. Fem till tio brukar räcka."
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
              {moments.map((moment) => (
                <Tr key={moment.id} dimmed={!moment.active}>
                  <Td>
                    <form action={renameMoment} className="flex gap-2">
                      <input type="hidden" name="id" value={moment.id} />
                      <Input
                        name="name"
                        defaultValue={moment.name}
                        className="max-w-xs"
                        aria-label={`Namn för ${moment.name}`}
                      />
                      <Button type="submit" tone="ghost">
                        Spara
                      </Button>
                    </form>
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
