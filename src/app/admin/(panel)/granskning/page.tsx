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
      kind: true,
      order: { select: { orderNumber: true, customerName: true } },
      moment: { select: { name: true } },
      indirectMoment: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Granskning"
        description={`Poster där ingen stämplade ut. Systemet stängde dem ${company?.autoCloseAt ?? "18:00"} med beräknad sluttid. Rätta innan fakturering.`}
      />

      {entries.length === 0 ? (
        <EmptyState
          title="Inget att granska"
          description="Samtliga stämplingar har en utstämpling."
        />
      ) : (
        <Card>
          <CardHeader
            title={`${entries.length} ${entries.length === 1 ? "post" : "poster"} att gå igenom`}
            description="Ändra sluttiden om du vet när arbetet slutade. Stämmer den beräknade tiden räcker det att godkänna den."
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
                      {entry.order?.customerName &&
                        ` · ${entry.order.customerName}`}
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
                    {/* TVÅ ÅTGÄRDER, eftersom de lämnar olika spår.
                        
                        Ändra skriver en ny sluttid och märker posten
                        ADMIN_MANUAL — någon har skrivit in den. Godkänn rör
                        inte tiden; posten förblir AUTO_CLOSE, nu bekräftad av
                        en människa.
                        
                        Skillnaden syns i rapporterna och spelar roll den dag
                        någon ifrågasätter en faktura. En enda knapp hade
                        tvingat fram ett val mellan att förlora spåret eller
                        att kräva att alla tider skrivs om för hand.
                        
                        Fältet och Ändra hör ihop och står tätt. Godkänn är
                        avskilt med en tunn linje, så att det inte läses som
                        en tredje del av samma formulär. */}
                    <div className="flex flex-wrap items-center gap-3">
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
                          aria-label="Sluttid"
                          className="w-52"
                        />
                        <Button type="submit">Ändra</Button>
                      </form>

                      <form
                        action={approveEntry}
                        className="border-l border-neutral-200 pl-3"
                      >
                        <input type="hidden" name="id" value={entry.id} />
                        <Button type="submit" tone="secondary">
                          Godkänn
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
