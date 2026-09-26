import { requireAdmin } from "@/lib/admin-session";
import ScheduleForm, {
  type ScheduleDayValue,
} from "@/components/admin/ScheduleForm";
import ConfirmButton from "@/components/admin/ConfirmButton";
import FormDialog from "@/components/admin/FormDialog";
import {
  Alert,
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
import { formatMinuteOfDay } from "@/lib/schedule";
import { createBreakType, saveSchedule, toggleBreakType } from "./actions";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const { db } = await requireAdmin();

  const [schedule, breakTypes] = await Promise.all([
    db.workSchedule.findFirst({
      where: { isDefault: true },
      select: {
        days: {
          orderBy: { weekday: "asc" },
          select: {
            weekday: true,
            startMinute: true,
            endMinute: true,
            breaks: {
              orderBy: { startMinute: "asc" },
              select: { startMinute: true, endMinute: true },
            },
          },
        },
      },
    }),
    db.breakType.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        name: true,
        active: true,
        _count: { select: { breakEntries: true } },
      },
    }),
  ]);

  const initial: ScheduleDayValue[] = (schedule?.days ?? []).map((day) => ({
    weekday: day.weekday,
    start: formatMinuteOfDay(day.startMinute),
    end: formatMinuteOfDay(day.endMinute),
    breaks: day.breaks.map((rest) => ({
      start: formatMinuteOfDay(rest.startMinute),
      end: formatMinuteOfDay(rest.endMinute),
    })),
  }));

  return (
    <div className="space-y-6">
      <ScheduleForm action={saveSchedule} initial={initial} />

      <Card>
        <CardHeader
          title="Raster"
          action={
            <FormDialog
              trigger="Ny rast"
              title="Lägg till rast"
              action={createBreakType}
              submitLabel="Lägg till"
            >
              <Field label="Namn">
                <Input name="name" placeholder="Frukost" required autoFocus />
              </Field>
            </FormDialog>
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
