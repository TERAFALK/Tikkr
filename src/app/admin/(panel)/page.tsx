import { requireAdmin } from "@/lib/admin-session";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import {
  IconClock,
  IconOrder,
  IconPeople,
  IconReview,
} from "@/components/ui/icons";
import { formatDuration, formatTime, minutesBetween } from "@/lib/format";
import { getOnboardingState } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { db, companyName } = await requireAdmin();
  const onboarding = await getOnboardingState(db);

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
        action={
          <ButtonLink href="/admin/rapporter" tone="secondary">
            Till rapporter
          </ButtonLink>
        }
      />

      {!onboarding.ready && (
        <Card className="mb-6 border-blue-200 bg-blue-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-900">
                {onboarding.completed} av {onboarding.total} steg klara
              </p>
              <p className="mt-0.5 text-[13px] text-blue-800">
                Stämplingsskärmen kan användas när uppsättningen är slutförd.
              </p>
            </div>
            <ButtonLink href="/admin/kom-igang">Fortsätt uppsättningen</ButtonLink>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Arbetar just nu"
          value={working.length}
          tone={working.length > 0 ? "active" : "neutral"}
          hint={working.length === 1 ? "person instämplad" : "personer instämplade"}
          icon={<IconPeople />}
        />
        <Stat
          label="Registrerat idag"
          value={formatDuration(minutesToday)}
          hint="inklusive pågående jobb"
          icon={<IconClock />}
        />
        <Stat
          label="Att granska"
          value={needsReview}
          tone={needsReview > 0 ? "warning" : "neutral"}
          hint="poster systemet stängt automatiskt"
          icon={<IconReview />}
        />
        <Stat label="Öppna ordrar" value={openOrders} icon={<IconOrder />} />
      </div>

      {needsReview > 0 && (
        <Card className="mt-6 border-amber-200 bg-amber-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-900">
                {needsReview} {needsReview === 1 ? "post" : "poster"} behöver
                granskas
              </p>
              <p className="mt-0.5 text-[13px] text-amber-800">
                Utstämpling saknas. Sluttiden är beräknad av systemet och bör
                kontrolleras före fakturering.
              </p>
            </div>
            <ButtonLink href="/admin/granskning">Granska nu</ButtonLink>
          </div>
        </Card>
      )}

      <div className="mt-6">
        {working.length === 0 ? (
          <EmptyState
            title="Ingen är instämplad just nu"
            description="Pågående arbete visas här så snart någon stämplat in."
          />
        ) : (
          <Card>
            <CardHeader
              title="Pågående arbete"
              description="Tiden räknas upp till dess att posten avslutas."
            />
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
            <tbody>
              {working.map((entry) => (
                <Tr key={entry.id}>
                  <Td>
                    <span className="font-medium">{entry.employee.name}</span>
                  </Td>
                  <Td>
                    {entry.order.orderNumber}
                    {entry.order.customerName && (
                      <span className="ml-2 text-neutral-500">
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
                </Tr>
              ))}
            </tbody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
