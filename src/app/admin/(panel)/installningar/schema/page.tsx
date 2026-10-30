import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ActionDialog from "@/components/ui/ActionDialog";
import {
  Badge,
  Card,
  CardHeader,
  Field,
  Input,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { createBreakType, toggleBreakType } from "./actions";

export const metadata = { title: "Raster · Tikkr" };

/**
 * RASTERNA, alltså rasttyperna på stämplingsskärmen. Löneunderlagets.
 *
 * Företagets arbetstider låg här till 2026-10-17. De är arbetsytans nu och
 * ligger under Inställningar, Arbetsytan, Arbetstider, eftersom planeringen
 * läser samma tider. Se lib/work-hours.ts.
 */

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const session = await requireAdmin();
  await requireModule(session, "PAYROLL");

  const { db } = session;

  const breakTypes = await db.breakType.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      active: true,
      _count: { select: { breakEntries: true } },
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Raster"
          help="arbetstider"
          action={
            <ActionDialog
              trigger="Ny rast"
              triggerTone="primary"
              title="Lägg till rast"
              action={createBreakType}
              initial={{}}
              submitLabel="Lägg till"
            >
              <Field label="Namn">
                <Input name="name" placeholder="Frukost" required autoFocus />
              </Field>
            </ActionDialog>
          }
        />

        {breakTypes.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-neutral-500">
            Inga raster upplagda.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Namn</Th>
                <Th>Status</Th>
                <Th numeric>Registrerade</Th>
                <Th>
                  <span className="sr-only">Åtgärd</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {breakTypes.map((type) => (
                <Tr key={type.id} dimmed={!type.active}>
                  <Td>
                    <span className="font-medium">{type.name}</span>
                  </Td>
                  <Td>
                    {type.active ? (
                      <Badge tone="active">Aktiv</Badge>
                    ) : (
                      <Badge tone="muted">Avaktiverad</Badge>
                    )}
                  </Td>
                  <Td numeric muted>
                    {type._count.breakEntries}
                  </Td>
                  <Td>
                    <form action={toggleBreakType}>
                      <input type="hidden" name="id" value={type.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(type.active)}
                      />
                      <ConfirmButton
                        type="submit"
                        tone={type.active ? "danger" : "secondary"}
                        question={
                          type.active
                            ? `Avaktivera ${type.name}? Rasten döljs på stämplingsskärmen men registrerad tid finns kvar.`
                            : `Aktivera ${type.name} igen?`
                        }
                      >
                        {type.active ? "Avaktivera" : "Aktivera"}
                      </ConfirmButton>
                    </form>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
