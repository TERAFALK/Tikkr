import Link from "next/link";
import SearchSelect from "@/components/admin/SearchSelect";
import { requireAdmin } from "@/lib/admin-session";
import { companyTimeZone } from "@/lib/company";
import NewEntryDialog from "@/components/admin/NewEntryDialog";
import FormDialog from "@/components/admin/FormDialog";
import FilterForm from "@/components/admin/FilterForm";
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
import { describeEntry } from "@/lib/entry-label";
import {
  addDaysInZone,
  endOfDayIn,
  parseLocalDate,
  startOfDayIn,
  toDateInput,
  toLocalDateTimeInput,
} from "@/lib/time-zone";
import { datePresets } from "@/lib/date-presets";
import { deleteEntry, editEntry } from "./actions";

export const dynamic = "force-dynamic";

interface SearchParams {
  employeeId?: string;
  from?: string;
  to?: string;
}

export default async function EntriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { db, companyId } = await requireAdmin();
  const params = await searchParams;

  const timeZone = await companyTimeZone(companyId);

  // Standard: de senaste två veckorna. En obegränsad lista blir oanvändbar
  // efter några månaders drift.
  //
  // Datumen räknas i företagets tidszon. Gjorde de inte det skulle filtret
  // "från och med idag" börja 02:00 på verkstadsgolvet och tappa morgonens
  // stämplingar — servern kör UTC.
  const defaultFrom = addDaysInZone(new Date(), -14, timeZone);
  const from =
    (params.from ? parseLocalDate(params.from, timeZone) : null) ?? defaultFrom;
  const fromDayStart = startOfDayIn(from, timeZone);

  // "Till och med" sträcker sig till dygnets sista millisekund. Utan det faller
  // hela den sista dagens stämplingar bort, vilket ser ut som att ingen
  // arbetade den dagen.
  //
  // Utelämnat betyder ingen övre gräns, så pågående jobb syns alltid. Ett
  // filter som tyst klipper bort dem hade gjort listan opålitlig just när man
  // letar efter någon som står instämplad.
  const toDate = params.to ? parseLocalDate(params.to, timeZone) : null;
  const toDayEnd = toDate ? endOfDayIn(toDate, timeZone) : null;

  const { presets } = datePresets(timeZone);

  const [employees, orders, moments, indirectMoments, entries] =
    await Promise.all([
      db.employee.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.order.findMany({
        orderBy: { orderNumber: "asc" },
        select: {
          id: true,
          orderNumber: true,
          customer: { select: { name: true } },
        },
      }),
      db.workMoment.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.indirectMoment.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.timeEntry.findMany({
        where: {
          employeeId: params.employeeId || undefined,
          clockInAt: { gte: fromDayStart, ...(toDayEnd ? { lte: toDayEnd } : {}) },
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
          indirectMomentId: true,
          employee: { select: { name: true } },
          kind: true,
          order: {
            select: {
              orderNumber: true,
              customer: { select: { name: true } },
            },
          },
          moment: { select: { name: true } },
          indirectMoment: { select: { name: true } },
        },
      }),
    ]);

  const employeeOptions = employees.map((employee) => ({
    id: employee.id,
    label: employee.name,
  }));
  const orderOptions = orders.map((order) => ({
    id: order.id,
    label: order.orderNumber,
    hint: order.customer?.name,
  }));
  const momentOptions = moments.map((moment) => ({
    id: moment.id,
    label: moment.name,
  }));
  const indirectOptions = indirectMoments.map((moment) => ({
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
        <CardHeader
          title="Filter"
          action={
            // Samma snabbval som i rapportvyn, av samma skäl: två datumfält per
            // gång blir många knapptryck för det man gör oftast.
            <div className="flex flex-wrap gap-1">
              {presets.map((preset) => {
                const active =
                  params.from === preset.from && params.to === preset.to;

                return (
                  <Link
                    key={preset.label}
                    href={`/admin/stamplingar?from=${preset.from}&to=${preset.to}${
                      params.employeeId
                        ? `&employeeId=${params.employeeId}`
                        : ""
                    }`}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-neutral-900 text-white"
                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                    }`}
                  >
                    {preset.label}
                  </Link>
                );
              })}
            </div>
          }
        />
        <FilterForm className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Från och med">
            <Input
              type="date"
              name="from"
              defaultValue={params.from ?? toDateInput(defaultFrom, timeZone)}
            />
          </Field>

          <Field label="Till och med" hint="Lämna tomt för att se allt framåt.">
            <Input type="date" name="to" defaultValue={params.to ?? ""} />
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
        </FilterForm>
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
                <Th numeric>Längd (tim:min)</Th>
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
                      {describeEntry(entry).text}
                      {entry.order?.customer && (
                        <span className="mt-0.5 block text-xs text-neutral-400">
                          {entry.order.customer.name}
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

                            {/* Posten behåller sin sort. En improduktiv
                                stämpling har varken order eller arbetsmoment,
                                och visades den i orderformuläret skulle ett
                                sparat formulär göra en städtimme till
                                fakturerbar ordertid — tyst. */}
                            <input
                              type="hidden"
                              name="kind"
                              value={entry.kind}
                            />

                            {entry.kind === "INDIRECT" ? (
                              <Field label="Improduktivt moment">
                                <Select
                                  name="indirectMomentId"
                                  defaultValue={entry.indirectMomentId ?? ""}
                                >
                                  {indirectOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                            ) : (
                              <>
                                <Field label="Order">
                                  <SearchSelect
                                    name="orderId"
                                    options={orderOptions}
                                    defaultValue={entry.orderId}
                                    placeholder="Sök order…"
                                    emptyLabel="Välj order…"
                                    required
                                  />
                                </Field>

                                <Field label="Arbetsmoment">
                                  <Select
                                    name="momentId"
                                    defaultValue={entry.momentId ?? ""}
                                  >
                                    {momentOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                              </>
                            )}

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
