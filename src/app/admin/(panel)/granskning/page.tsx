import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
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
          description="Samtliga stämplingar har en registrerad utstämpling. Poster visas här när utstämpling saknas vid dagens slut."
        />
      ) : (
        <Card>
          <CardHeader
            title={`${entries.length} ${entries.length === 1 ? "post" : "poster"} att gå igenom`}
            description="Ange korrekt sluttid om den är känd, i annat fall godkänn den beräknade tiden. Båda alternativen markerar posten som granskad."
          />
          <Table>
            <thead>
              <tr>
                <Th>Anställd och jobb</Th>
                <Th>Instämplad</Th>
                <Th numeric>Gissad tid</Th>
                <Th>Rätta sluttid</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <Tr key={entry.id}>
                  <Td>
                    <span className="font-medium">{entry.employee.name}</span>
                    <span className="mt-0.5 block text-sm text-neutral-500">
                      {entry.order.orderNumber}
                      {entry.order.customerName && ` · ${entry.order.customerName}`}
                      {` · ${entry.moment.name}`}
                    </span>
                  </Td>

                  <Td muted>{formatDateTime(entry.clockInAt, timeZone)}</Td>

                  <Td numeric>
                    <Badge tone="warning">
                      {formatDuration(
                        minutesBetween(entry.clockInAt, entry.clockOutAt)
                      )}
                    </Badge>
                    <span className="mt-1 block text-xs text-neutral-400">
                      beräknad till{" "}
                      {entry.clockOutAt &&
                        formatDateTime(entry.clockOutAt, timeZone)}
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
                        <Button type="submit">Spara tiden</Button>
                      </form>

                      <form action={approveEntry}>
                        <input type="hidden" name="id" value={entry.id} />
                        <Button type="submit" tone="secondary">
                          Gissningen stämmer
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

/** Formaterar en tidpunkt som datum/tid-fältet förstår, i rätt tidszon. */
function toInputValue(value: Date, timeZone: string): string {
  const wall = wallTimeIn(value, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}
