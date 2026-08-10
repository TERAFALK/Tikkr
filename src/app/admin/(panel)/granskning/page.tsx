import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDateTime, formatDuration, minutesBetween } from "@/lib/format";
import { wallTimeIn } from "@/lib/time-zone";
import { approveEntry, correctEntry } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { db, companyId } = await requireAdmin();

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true, autoCloseAt: true },
  });
  const timeZone = company?.timezone ?? "Europe/Stockholm";

  const entries = await db.timeEntry.findMany({
    where: { needsReview: true },
    orderBy: { clockInAt: "desc" },
    select: {
      id: true,
      clockInAt: true,
      clockOutAt: true,
      reviewNote: true,
      employee: { select: { name: true } },
      order: { select: { orderNumber: true, customerName: true } },
      moment: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Granskning"
        description={`Poster där ingen stämplade ut. Systemet har stängt dem ${company?.autoCloseAt ?? "18:00"} och gissat sluttiden — rätta den innan du fakturerar.`}
      />

      {entries.length === 0 ? (
        <EmptyState
          title="Inget att granska"
          description="Alla stämplingar har en utstämpling som någon faktiskt gjort. Dyker det upp poster här har någon glömt stämpla ut."
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Anställd och jobb</Th>
                <Th>Instämplad</Th>
                <Th numeric>Gissad tid</Th>
                <Th>Rätta sluttid</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <Td>
                    <span className="font-medium">{entry.employee.name}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {entry.order.orderNumber}
                      {entry.order.customerName && ` · ${entry.order.customerName}`}
                      {` · ${entry.moment.name}`}
                    </span>
                  </Td>

                  <Td muted>{formatDateTime(entry.clockInAt, timeZone)}</Td>

                  <Td numeric>
                    {formatDuration(
                      minutesBetween(entry.clockInAt, entry.clockOutAt)
                    )}
                    <span className="mt-0.5 block text-xs text-amber-700">
                      till {entry.clockOutAt && formatDateTime(entry.clockOutAt, timeZone)}
                    </span>
                  </Td>

                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={correctEntry} className="flex gap-2">
                        <input type="hidden" name="id" value={entry.id} />
                        <Input
                          type="datetime-local"
                          name="clockOutAt"
                          defaultValue={
                            entry.clockOutAt
                              ? toInputValue(entry.clockOutAt, timeZone)
                              : ""
                          }
                          aria-label="Rätt sluttid"
                          className="w-52"
                        />
                        <Button type="submit">Spara</Button>
                      </form>

                      <form action={approveEntry}>
                        <input type="hidden" name="id" value={entry.id} />
                        <Button type="submit" tone="secondary">
                          Stämmer
                        </Button>
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}

/** Formaterar en tidpunkt som datum/tid-fältet förstår, i rätt tidszon. */
function toInputValue(value: Date, timeZone: string): string {
  const wall = wallTimeIn(value, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}
