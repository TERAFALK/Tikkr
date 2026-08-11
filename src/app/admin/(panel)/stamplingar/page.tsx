import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import NewEntryForm from "@/components/admin/NewEntryForm";
import ConfirmButton from "@/components/admin/ConfirmButton";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { formatDuration, minutesBetween } from "@/lib/format";
import { toLocalDateTimeInput } from "@/lib/time-zone";
import { deleteEntry, editEntry } from "./actions";

export const dynamic = "force-dynamic";

interface SearchParams {
  employeeId?: string;
  from?: string;
}

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { db, companyId } = await requireAdmin();
  const params = await searchParams;

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true },
  });
  const timeZone = company?.timezone ?? "Europe/Stockholm";

  // Standard: de senaste två veckorna. En obegränsad lista blir oanvändbar
  // efter några månaders drift.
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 14);
  const from = params.from ? new Date(`${params.from}T00:00:00`) : defaultFrom;

  const [employees, orders, moments, entries] = await Promise.all([
    db.employee.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.order.findMany({
      orderBy: { orderNumber: "asc" },
      select: { id: true, orderNumber: true, customerName: true },
    }),
    db.workMoment.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.timeEntry.findMany({
      where: {
        employeeId: params.employeeId || undefined,
        clockInAt: { gte: from },
      },
      orderBy: { clockInAt: "desc" },
      take: 200,
      select: {
        id: true,
        clockInAt: true,
        clockOutAt: true,
        source: true,
        needsReview: true,
        employeeId: true,
        orderId: true,
        momentId: true,
        employee: { select: { name: true } },
        order: { select: { orderNumber: true } },
      },
    }),
  ]);

  const employeeOptions = employees.map((employee) => ({
    id: employee.id,
    label: employee.name,
  }));
  const orderOptions = orders.map((order) => ({
    id: order.id,
    label: order.customerName
      ? `${order.orderNumber} — ${order.customerName}`
      : order.orderNumber,
  }));
  const momentOptions = moments.map((moment) => ({
    id: moment.id,
    label: moment.name,
  }));

  return (
    <>
      <PageHeader
        title="Stämplingar"
        description="Alla registrerade tider. Här läggs tid in som aldrig blev stämplad, och felaktiga poster rättas."
      />

      <NewEntryForm
        employees={employeeOptions}
        orders={orderOptions}
        moments={momentOptions}
      />

      <Card className="mb-6">
        <CardHeader title="Filter" />
        <form className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Från och med">
            <Input
              type="date"
              name="from"
              defaultValue={
                params.from ?? defaultFrom.toISOString().slice(0, 10)
              }
            />
          </Field>

          <Field label="Anställd">
            <Select name="employeeId" defaultValue={params.employeeId ?? ""}>
              <option value="">Alla</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end gap-2">
            <Button type="submit">Visa</Button>
            <ButtonLink href="/admin/stamplingar" tone="secondary">
              Rensa
            </ButtonLink>
          </div>
        </form>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          title="Inga stämplingar i perioden"
          description="Vidga datumintervallet, eller lägg till en stämpling ovan om tid saknas."
        />
      ) : (
        <Card>
          <CardHeader
            title="Registrerade tider"
            description={`${entries.length} poster, senaste först. Ändringar märks som manuella.`}
          />
          <Table>
            <thead>
              <tr>
                <Th>Anställd</Th>
                <Th>Order och moment</Th>
                <Th>Tider</Th>
                <Th numeric>Längd</Th>
                <Th>
                  <span className="sr-only">Åtgärder</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const ongoing = entry.clockOutAt === null;

                return (
                  <Tr key={entry.id}>
                    <Td>
                      <span className="font-medium">{entry.employee.name}</span>
                      {entry.source === "ADMIN_MANUAL" && (
                        <span className="ml-2">
                          <Badge>Manuell</Badge>
                        </span>
                      )}
                      {entry.needsReview && (
                        <span className="ml-2">
                          <Badge tone="warning">Ogranskad</Badge>
                        </span>
                      )}
                    </Td>

                    {/* Pågående poster ändras inte här. Att skriva in en
                        sluttid på ett jobb som fortfarande pågår skulle stänga
                        det bakom ryggen på den som står vid skärmen. */}
                    {ongoing ? (
                      <>
                        <Td muted>{entry.order.orderNumber}</Td>
                        <Td>
                          <Badge tone="active">Pågår just nu</Badge>
                        </Td>
                        <Td numeric>
                          {formatDuration(minutesBetween(entry.clockInAt, null))}
                        </Td>
                        <Td />
                      </>
                    ) : (
                      <Td colSpan={4}>
                        <form
                          action={editEntry}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="id" value={entry.id} />
                          <input
                            type="hidden"
                            name="employeeId"
                            value={entry.employeeId}
                          />

                          <Select
                            name="orderId"
                            defaultValue={entry.orderId}
                            className="w-44"
                            aria-label="Order"
                          >
                            {orderOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </Select>

                          <Select
                            name="momentId"
                            defaultValue={entry.momentId}
                            className="w-36"
                            aria-label="Arbetsmoment"
                          >
                            {momentOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </Select>

                          <Input
                            type="datetime-local"
                            name="clockInAt"
                            defaultValue={toLocalDateTimeInput(
                              entry.clockInAt,
                              timeZone
                            )}
                            className="w-48"
                            aria-label="Instämplad"
                          />
                          <Input
                            type="datetime-local"
                            name="clockOutAt"
                            defaultValue={toLocalDateTimeInput(
                              entry.clockOutAt!,
                              timeZone
                            )}
                            className="w-48"
                            aria-label="Utstämplad"
                          />

                          <span className="w-20 text-right tabular-nums text-neutral-500">
                            {formatDuration(
                              minutesBetween(entry.clockInAt, entry.clockOutAt)
                            )}
                          </span>

                          <Button type="submit" tone="secondary">
                            Spara
                          </Button>

                          {/* formAction låter samma formulär skickas till en
                              annan serveråtgärd, så raderingen får med sig
                              posten utan ett eget formulär i raden. */}
                          <ConfirmButton
                            type="submit"
                            tone="danger"
                            formAction={deleteEntry}
                            question={`Radera stämplingen för ${entry.employee.name}? Tiden går inte att få tillbaka.`}
                          >
                            Radera
                          </ConfirmButton>
                        </form>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

    </>
  );
}
