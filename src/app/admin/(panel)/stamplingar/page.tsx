import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import NewEntryDialog from "@/components/admin/NewEntryDialog";
import FormDialog from "@/components/admin/FormDialog";
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
import { formatDateTime, formatDuration, minutesBetween } from "@/lib/format";
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
        order: { select: { orderNumber: true, customerName: true } },
        moment: { select: { name: true } },
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
      ? `${order.orderNumber}, ${order.customerName}`
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
        description="Samtliga registrerade tider. Här rättas och kompletteras de."
        action={
          <NewEntryDialog
            employees={employeeOptions}
            orders={orderOptions}
            moments={momentOptions}
          />
        }
      />

      <Card className="mb-6">
        <CardHeader title="Filter" />
        <form className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Från och med">
            <Input
              type="date"
              name="from"
              defaultValue={params.from ?? defaultFrom.toISOString().slice(0, 10)}
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
          description="Utöka datumintervallet, eller lägg till en stämpling."
        />
      ) : (
        <Card>
          <CardHeader
            title={`${entries.length} ${entries.length === 1 ? "post" : "poster"}`}
            description="Senaste posten först. Manuella ändringar markeras i listan."
          />
          <Table>
            <thead>
              <tr>
                <Th>Anställd</Th>
                <Th>Order och moment</Th>
                <Th>Instämplad</Th>
                <Th>Utstämplad</Th>
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

                    <Td muted>
                      {entry.order.orderNumber} · {entry.moment.name}
                      {entry.order.customerName && (
                        <span className="mt-0.5 block text-xs text-neutral-400">
                          {entry.order.customerName}
                        </span>
                      )}
                    </Td>

                    <Td muted>{formatDateTime(entry.clockInAt, timeZone)}</Td>

                    <Td muted>
                      {ongoing ? (
                        <Badge tone="active">Pågår</Badge>
                      ) : (
                        formatDateTime(entry.clockOutAt!, timeZone)
                      )}
                    </Td>

                    <Td numeric>
                      {formatDuration(
                        minutesBetween(entry.clockInAt, entry.clockOutAt)
                      )}
                    </Td>

                    <Td>
                      {/* Pågående poster ändras inte här. Att skriva in en
                          sluttid på ett jobb som fortfarande pågår skulle
                          stänga det bakom ryggen på den som står vid skärmen. */}
                      {ongoing ? (
                        <span className="block text-right text-xs text-neutral-400">
                          Ändras när den avslutats
                        </span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <FormDialog
                            trigger="Ändra"
                            triggerTone="ghost"
                            title={`Ändra stämpling: ${entry.employee.name}`}
                            description="Ändringen markeras som manuell."
                            action={editEntry}
                            submitLabel="Spara"
                          >
                            <input type="hidden" name="id" value={entry.id} />
                            <input
                              type="hidden"
                              name="employeeId"
                              value={entry.employeeId}
                            />

                            <Field label="Order">
                              <Select name="orderId" defaultValue={entry.orderId}>
                                {orderOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            </Field>

                            <Field label="Arbetsmoment">
                              <Select name="momentId" defaultValue={entry.momentId}>
                                {momentOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            </Field>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="Instämplad">
                                <Input
                                  type="datetime-local"
                                  name="clockInAt"
                                  defaultValue={toLocalDateTimeInput(
                                    entry.clockInAt,
                                    timeZone
                                  )}
                                />
                              </Field>
                              <Field label="Utstämplad">
                                <Input
                                  type="datetime-local"
                                  name="clockOutAt"
                                  defaultValue={toLocalDateTimeInput(
                                    entry.clockOutAt!,
                                    timeZone
                                  )}
                                />
                              </Field>
                            </div>
                          </FormDialog>

                          <form action={deleteEntry}>
                            <input type="hidden" name="id" value={entry.id} />
                            <ConfirmButton
                              type="submit"
                              tone="danger"
                              question={`Radera stämplingen för ${entry.employee.name}? Tiden går inte att få tillbaka.`}
                            >
                              Radera
                            </ConfirmButton>
                          </form>
                        </div>
                      )}
                    </Td>
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
