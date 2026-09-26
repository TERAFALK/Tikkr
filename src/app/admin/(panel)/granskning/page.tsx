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
import { describeEntry } from "@/lib/entry-label";
import { wallTimeIn } from "@/lib/time-zone";
import { reviewEntry } from "./actions";

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
      kind: true,
      order: {
        select: { orderNumber: true, customer: { select: { name: true } } },
      },
      moment: { select: { name: true } },
      indirectMoment: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Granskning"
        description={`Poster utan utstämpling, stängda ${company?.autoCloseAt ?? "18:00"} med beräknad sluttid.`}
      />

      {entries.length === 0 ? (
        <EmptyState
          title="Inget att granska"
        />
      ) : (
        <Card>
          <CardHeader
            title={`${entries.length} ${entries.length === 1 ? "post" : "poster"} att gå igenom`}
            description="Rätta sluttiden, eller godkänn den beräknade."
          />
          <Table>
            <thead>
              <tr>
                <Th>Anställd och jobb</Th>
                <Th>Instämplad</Th>
                <Th numeric>Beräknad tid (tim:min)</Th>
                <Th>Sluttid</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <Tr key={entry.id}>
                  <Td>
                    <span className="font-medium">{entry.employee.name}</span>
                    <span className="mt-0.5 block text-sm text-neutral-500">
                      {describeEntry(entry).text}
                      {entry.order?.customer &&
                        ` · ${entry.order.customer.name}`}
                    </span>
                    {entry.kind === "INDIRECT" && (
                      <span className="mt-1 inline-block">
                        <Badge tone="muted">Improduktiv</Badge>
                      </span>
                    )}
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
                    {/* ETT FÄLT OCH EN KNAPP. Servern jämför tiden i fältet med
                        den som står på posten och avgör själv vad som hände:
                        orörd tid godkänns och förblir AUTO_CLOSE, ändrad tid
                        rättas och märks ADMIN_MANUAL. Se reviewEntry.
                        
                        Utfallen låg förut på varsin knapp. Det lade ett val på
                        den som granskar som servern kan göra bättre — och som
                        var lätt att göra fel, eftersom knapparna såg ut att
                        göra samma sak. Här finns en fråga att svara på: när
                        slutade arbetet? */}
                    <form action={reviewEntry} className="flex gap-2">
                      <input type="hidden" name="id" value={entry.id} />
                      <Input
                        type="datetime-local"
                        name="clockOutAt"
                        defaultValue={
                          entry.clockOutAt
                            ? toInputValue(entry.clockOutAt, timeZone)
                            : ""
                        }
                        aria-label="Sluttid"
                        className="w-52"
                      />
                      <Button type="submit">Godkänn</Button>
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

/** Formaterar en tidpunkt som datum/tid-fältet förstår, i rätt tidszon. */
function toInputValue(value: Date, timeZone: string): string {
  const wall = wallTimeIn(value, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}
