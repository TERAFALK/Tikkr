import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import OrdersTable from "@/components/admin/OrdersTable";
import { orderRows } from "@/lib/orders";
import { customerOptions } from "@/lib/customers";
import { toggleOrder, updateOrder } from "../ordrar/actions";
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

/**
 * GRANSKNING — DET SOM KRÄVER ATT NÅGON GÖR NÅGOT.
 *
 * Två slags poster, och de har olika fel:
 *
 *  - SNABBJOBBEN är ordrar som verkstaden lagt upp själv vid skärmen. De har
 *    ofta ett avskrivet nummer och saknar kund, och tiden på dem ska ändå
 *    faktureras. Tillagt här 2026-09-29: de stod bara som en rad överst i
 *    orderlistan, alltså på en sida man öppnar när man har ett annat ärende.
 *    Nu ligger de där allt annat ogjort ligger, och räknas in i siffran i
 *    menyn.
 *  - STÄMPLINGARNA är poster systemet räknat fram en sluttid på.
 *
 * Snabbjobben står först. En order utan nummer går inte att fakturera alls;
 * en beräknad sluttid är en siffra som behöver bekräftas.
 *
 * Rutan för att rätta ett snabbjobb är orderlistans egen, med flit: den kan
 * redan allt som behövs och visar sina fel inuti sig. En egen liten
 * kompletteringsruta hade blivit ett andra ställe som ändrar samma order.
 */
export default async function ReviewPage() {
  const { db, companyId } = await requireAdmin();

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true, autoCloseAt: true },
  });
  const timeZone = company?.timezone ?? "Europe/Stockholm";

  const [entries, quickJobs, customers, moments] = await Promise.all([
    db.timeEntry.findMany({
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
    }),
    orderRows(db, { onlyQuickJobs: true }),
    customerOptions(db),
    db.workMoment.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Granskning"
        description={`Snabbjobb att komplettera, och poster utan utstämpling som stängts ${company?.autoCloseAt ?? "18:00"} med beräknad sluttid.`}
      />

      {quickJobs.length > 0 && (
        <div className="mb-6">
          <OrdersTable
            orders={quickJobs}
            customers={customers}
            moments={moments}
            updateAction={updateOrder}
            toggleAction={toggleOrder}
            selectable={false}
            title={`${quickJobs.length} snabbjobb att komplettera`}
          />
        </div>
      )}

      {entries.length === 0 ? (
        quickJobs.length === 0 && <EmptyState title="Inget att granska" />
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
