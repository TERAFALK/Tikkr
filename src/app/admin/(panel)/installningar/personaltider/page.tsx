import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { loadStaffHours } from "@/lib/staff-hours";
import { staffFor } from "@/lib/staff-planning";
import { describeWeek, formatMinuteOfDay } from "@/lib/weekly-hours";
import SaveForm from "@/components/admin/SaveForm";
import ScheduleDays, {
  type ScheduleDayValue,
} from "@/components/admin/ScheduleDays";
import ActionDialog from "@/components/ui/ActionDialog";
import { Button, Card, CardHeader, Table, Td, Th, Tr } from "@/components/ui";
import {
  removeOwnStaffHoursAction,
  saveOwnStaffHoursAction,
  saveStandardStaffHoursAction,
} from "./actions";

/**
 * PERSONALENS ARBETSTIDER (tillagt 2026-10-17, fas 3 av issue #21).
 *
 * Planeringens egna tider för personalen, skilda från löneunderlagets schema:
 * modulerna säljs var för sig och delar ingen kod. Se lib/staff-hours.ts.
 *
 * FÖRETAGETS STANDARD överst, EGNA TIDER per anställd under. Båda på samma
 * sida och inte på tavlan, eftersom Produktion inte har någon personalvy att
 * trycka på ett namn i, och tiderna gäller i båda lägena: i Tjänst ritar
 * tavlan dem, i Produktion varnar Bemanna för pass utanför dem.
 */

export const dynamic = "force-dynamic";

export default async function StaffHoursPage() {
  const session = await requireAdmin();
  await requireModule(session, "PLANNING");

  const [hours, staff] = await Promise.all([
    loadStaffHours(session.db),
    staffFor(session.db),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Personalens arbetstider" help="planering" />

        <SaveForm
          action={saveStandardStaffHoursAction}
          className="space-y-4 p-5"
        >
          <p className="text-xs text-neutral-500">
            Gäller alla utan egna tider
          </p>
          <ScheduleDays
            initial={toDayValues(hours.standard)}
            totalLabel="Arbetstid per vecka"
          />
        </SaveForm>
      </Card>

      <Card>
        <CardHeader title="Egna tider" />

        {staff.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-neutral-500">
            Inga anställda upplagda.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Anställd</Th>
                <Th>Arbetstider</Th>
                <Th>
                  <span className="sr-only">Åtgärd</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => {
                const own = hours.own.get(member.id) ?? null;

                return (
                  <Tr key={member.id}>
                    <Td>
                      <span className="font-medium">{member.name}</span>
                    </Td>
                    <Td muted={!own}>
                      {own
                        ? describeWeek(own)
                        : hours.standard.length > 0
                          ? "Företagets"
                          : "Inga"}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        {own && (
                          <form action={removeOwnStaffHoursAction}>
                            <input
                              type="hidden"
                              name="employeeId"
                              value={member.id}
                            />
                            <Button type="submit" tone="ghost">
                              Använd företagets
                            </Button>
                          </form>
                        )}

                        <ActionDialog
                          trigger={own ? "Ändra" : "Egna tider"}
                          title={"Arbetstider för " + member.name}
                          action={saveOwnStaffHoursAction}
                          initial={{}}
                          submitLabel="Spara"
                        >
                          <input
                            type="hidden"
                            name="employeeId"
                            value={member.id}
                          />
                          <ScheduleDays
                            initial={toDayValues(own ?? hours.standard)}
                            compact
                            totalLabel="Arbetstid per vecka"
                          />
                        </ActionDialog>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/** Minuter från midnatt till klockslag, som formuläret vill ha dem. */
function toDayValues(
  days: {
    weekday: number;
    startMinute: number;
    endMinute: number;
    breaks: { startMinute: number; endMinute: number }[];
  }[]
): ScheduleDayValue[] {
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
