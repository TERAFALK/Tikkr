import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import ActionDialog from "@/components/ui/ActionDialog";
import ConfirmButton from "@/components/admin/ConfirmButton";
import {
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { isoWeekdayIn } from "@/lib/schedule";
import { parseLocalDate, startOfDayIn, wallTimeIn } from "@/lib/time-zone";
import { addHolidayAction, deleteHolidayAction, type HolidayState } from "./actions";

export const metadata = { title: "Röda dagar · Tikkr" };

/**
 * RÖDA DAGAR (tillagt 2026-10-13).
 *
 * Kundens egen lista, ett år i taget. En röd dag har ingen planerad tid för
 * någon i arbetsytan. Se src/lib/holidays.ts.
 */

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ ar?: string }>;
}) {
  const session = await requireAdmin();
  await requireModule(session, "PAYROLL");

  const { db, companyId } = session;
  const timeZone = await companyTimeZone(companyId);
  const params = await searchParams;

  const thisYear = wallTimeIn(new Date(), timeZone).year;
  const requested = Number(params.ar);
  const year =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100
      ? requested
      : thisYear;

  // Årets gränser på väggen i företagets tidszon.
  const from = startOfDayIn(parseLocalDate(`${year}-01-01`, timeZone)!, timeZone);
  const to = startOfDayIn(parseLocalDate(`${year + 1}-01-01`, timeZone)!, timeZone);

  const holidays = await db.holiday.findMany({
    where: { date: { gte: from, lt: to } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, name: true },
  });

  const newHoliday = (
    <ActionDialog<HolidayState>
      trigger="Ny röd dag"
      title="Lägg till röd dag"
      action={addHolidayAction}
      initial={{}}
      submitLabel="Lägg till"
    >
      <Field label="Datum">
        <Input type="date" name="date" required />
      </Field>
      <Field label="Namn">
        <Input name="name" placeholder="Juldagen" required />
      </Field>
    </ActionDialog>
  );

  const yearLink = (value: number, label: string) => (
    <Link
      href={`/admin/installningar/roda-dagar?ar=${value}`}
      className="rounded-md px-2 py-1 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100"
      aria-label={`År ${value}`}
    >
      {label}
    </Link>
  );

  return (
    <Card>
      <CardHeader
        title={`Röda dagar ${year}`}
        help="arbetstider"
        action={
          <div className="flex items-center gap-2">
            {yearLink(year - 1, "‹")}
            {yearLink(year + 1, "›")}
            {newHoliday}
          </div>
        }
      />

      {holidays.length === 0 ? (
        <div className="p-5">
          <EmptyState title={`Inga röda dagar för ${year}`} action={newHoliday} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Datum</Th>
              <Th>Dag</Th>
              <Th>Namn</Th>
              <Th>
                <span className="sr-only">Åtgärd</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday) => (
              <Tr key={holiday.id}>
                <Td>{formatDate(holiday.date, timeZone)}</Td>
                <Td muted>{WEEKDAYS[isoWeekdayIn(holiday.date, timeZone) - 1]}</Td>
                <Td>
                  <span className="font-medium">{holiday.name}</span>
                </Td>
                <Td>
                  <form action={deleteHolidayAction} className="flex justify-end">
                    <input type="hidden" name="id" value={holiday.id} />
                    <ConfirmButton
                      type="submit"
                      tone="ghost"
                      question={`Ta bort ${holiday.name} ${formatDate(
                        holiday.date,
                        timeZone
                      )}? Dagen får då planerad tid igen.`}
                    >
                      Ta bort
                    </ConfirmButton>
                  </form>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
