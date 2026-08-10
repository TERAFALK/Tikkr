import { requireAdmin } from "@/lib/admin-session";
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDuration, formatTime, minutesBetween } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { db, companyName } = await requireAdmin();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [working, todaysEntries, needsReview, openOrders] = await Promise.all([
    db.timeEntry.findMany({
      where: { clockOutAt: null },
      orderBy: { clockInAt: "asc" },
      select: {
        id: true,
        clockInAt: true,
        employee: { select: { name: true } },
        order: { select: { orderNumber: true, customerName: true } },
        moment: { select: { name: true } },
      },
    }),
    db.timeEntry.findMany({
      where: { clockInAt: { gte: startOfToday } },
      select: { clockInAt: true, clockOutAt: true },
    }),
    db.timeEntry.count({ where: { needsReview: true } }),
    db.order.count({ where: { status: "OPEN" } }),
  ]);

  const minutesToday = todaysEntries.reduce(
    (total, entry) => total + minutesBetween(entry.clockInAt, entry.clockOutAt),
    0
  );

  return (
    <>
      <PageHeader
        title="Översikt"
        description={`Läget just nu hos ${companyName}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Arbetar just nu"
          value={working.length}
          tone={working.length > 0 ? "active" : "neutral"}
          hint={working.length === 1 ? "person instämplad" : "personer instämplade"}
        />
        <Stat
          label="Registrerat idag"
          value={formatDuration(minutesToday)}
          hint="inklusive pågående jobb"
        />
        <Stat
          label="Att granska"
          value={needsReview}
          tone={needsReview > 0 ? "warning" : "neutral"}
          hint="poster systemet stängt automatiskt"
        />
        <Stat label="Öppna ordrar" value={openOrders} />
      </div>

      {needsReview > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium text-amber-900">
                {needsReview} {needsReview === 1 ? "post" : "poster"} behöver
                granskas
              </p>
              <p className="mt-1 text-sm text-amber-800">
                Någon glömde stämpla ut. Systemet har gissat sluttiden — rätta
                den innan du fakturerar.
              </p>
            </div>
            <ButtonLink href="/admin/granskning">Granska nu</ButtonLink>
          </div>
        </Card>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold">Pågående arbete</h2>

      {working.length === 0 ? (
        <EmptyState
          title="Ingen är instämplad just nu"
          description="När någon stämplar in på en order dyker det upp här direkt."
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Anställd</Th>
                <Th>Order</Th>
                <Th>Arbetsmoment</Th>
                <Th>Sedan</Th>
                <Th numeric>Tid</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {working.map((entry) => (
                <tr key={entry.id}>
                  <Td>
                    <span className="font-medium">{entry.employee.name}</span>
                  </Td>
                  <Td>
                    {entry.order.orderNumber}
                    {entry.order.customerName && (
                      <span className="ml-2 text-slate-500">
                        {entry.order.customerName}
                      </span>
                    )}
                  </Td>
                  <Td muted>{entry.moment.name}</Td>
                  <Td muted>{formatTime(entry.clockInAt)}</Td>
                  <Td numeric>
                    <Badge tone="active">
                      {formatDuration(minutesBetween(entry.clockInAt, null))}
                    </Badge>
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
