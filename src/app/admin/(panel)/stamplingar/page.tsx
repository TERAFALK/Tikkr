import Link from "next/link";
import SearchSelect from "@/components/admin/SearchSelect";
import { requireAdmin } from "@/lib/admin-session";
import { companyTimeZone } from "@/lib/company";
import NewEntryDialog from "@/components/admin/NewEntryDialog";
import ActionDialog from "@/components/ui/ActionDialog";
import FilterForm from "@/components/admin/FilterForm";
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
  endOfDayIn,
  parseLocalDate,
  startOfDayIn,
  toLocalDateTimeInput,
} from "@/lib/time-zone";
import { datePresets } from "@/lib/date-presets";
import { weekStep } from "@/lib/week-nav";
import WeekStepper from "@/components/admin/WeekStepper";
import { editEntry, type EditEntryState } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Hur många poster listan visar innan den slutar.
 *
 * Taket ersätter det datum som tidigare stod förifyllt i "Från och med".
 * Skillnaden är att ett tak syns: raden under rubriken säger att listan är
 * kapad, och då vet man att det finns mer att filtrera fram.
 */
const PAGE_SIZE = 200;

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

  // INGET FÖRVALT FRÅNDATUM (ändrat 2026-09-29). Listan började tidigare två
  // veckor tillbaka, med skälet att en obegränsad lista blir oanvändbar. Det
  // var fel sorts skydd: den som letade efter en stämpling från förra månaden
  // fick en tom lista och inget som sa varför. Taket nedan gör samma jobb utan
  // att gömma något, och det syns i listan när det slår till.
  //
  // Datumen räknas i företagets tidszon. Gjorde de inte det skulle filtret
  // "från och med idag" börja 02:00 på verkstadsgolvet och tappa morgonens
  // stämplingar — servern kör UTC.
  const from = params.from ? parseLocalDate(params.from, timeZone) : null;
  const fromDayStart = from ? startOfDayIn(from, timeZone) : null;

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
  const week = weekStep("/admin/stamplingar", params, timeZone);

  /**
   * Filtret, som BÅDA stämplingsfrågorna delar.
   *
   * Pågående och avslutade hämtas var för sig, se nedan. Stod villkoret på
   * två ställen skulle de hinna glida isär, och då hade en filtrerad lista
   * visat pågående poster som inte hörde till urvalet.
   */
  const entryFilter = {
    employeeId: params.employeeId || undefined,
    // Utelämnas helt när inget datum valts. Ett tomt villkorsobjekt hade gett
    // samma svar, men den här formen säger rakt ut att ingen gräns finns.
    ...(fromDayStart || toDayEnd
      ? {
          clockInAt: {
            ...(fromDayStart ? { gte: fromDayStart } : {}),
            ...(toDayEnd ? { lte: toDayEnd } : {}),
          },
        }
      : {}),
  };

  const entrySelect = {
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
  } as const;

  const [employees, orders, moments, indirectMoments, ongoing, finished] =
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
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: { id: true, name: true, active: true },
      }),
      db.indirectMoment.findMany({
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: { id: true, name: true, active: true },
      }),
      // PÅGÅENDE FÖRST, och utan tak.
      //
      // De är det man letar efter: någon som står instämplad och inte borde
      // göra det. Låg de i samma fråga som resten kunde de trilla utanför de
      // 200 senaste så fort en dag varit full av stämplingar, och då syns
      // just det man kom för att leta efter inte alls.
      db.timeEntry.findMany({
        where: { ...entryFilter, clockOutAt: null },
        orderBy: [{ clockInAt: "desc" }, { id: "asc" }],
        select: entrySelect,
      }),
      db.timeEntry.findMany({
        where: { ...entryFilter, clockOutAt: { not: null } },
        orderBy: [{ clockInAt: "desc" }, { id: "asc" }],
        take: PAGE_SIZE,
        select: entrySelect,
      }),
    ]);

  // Pågående överst, resten under. Båda listorna är redan sorterade med
  // senaste först.
  const entries = [...ongoing, ...finished];

  // Vilka av raderna som har ändrats. De får en länk till sin historik; en
  // länk på varje rad vore brus, eftersom de flesta aldrig rörts.
  const withHistory = new Set(
    (
      await db.auditEvent.groupBy({
        by: ["entityId"],
        where: {
          entity: "TimeEntry",
          entityId: { in: entries.map((entry) => entry.id) },
        },
      })
    ).map((row) => row.entityId)
  );

  const employeeOptions = employees.map((employee) => ({
    id: employee.id,
    label: employee.name,
  }));
  const orderOptions = orders.map((order) => ({
    id: order.id,
    label: order.orderNumber,
    hint: order.customer?.name,
  }));
  // ETT AVAKTIVERAT MOMENT GÅR INTE ATT BOKA NY TID PÅ.
  //
  // Samma regel som på stämplingsskärmen, som bara visar de aktiva: ett moment
  // verkstaden lagt ner ska bort ur varje val som SKAPAR tid, också när tiden
  // skrivs in för hand. Behövs ett nedlagt moment för en efterregistrering
  // återaktiveras det först — annars hade en avaktivering inte betytt något.
  const pickableMoments = moments
    .filter((moment) => moment.active)
    .map((moment) => ({ id: moment.id, label: moment.name }));

  // En BEFINTLIG post behåller däremot sitt eget moment i listan, avaktiverat
  // eller inte. Föll det bort skulle rutan visa ett annat moment som valt, och
  // ett sparat formulär flytta tiden dit — tyst, på ett underlag som kanske
  // redan fakturerats.
  const momentOptionsFor = (currentId: string | null) =>
    moments
      .filter((moment) => moment.active || moment.id === currentId)
      .map((moment) => ({
        id: moment.id,
        label: moment.active ? moment.name : `${moment.name} (avaktiverat)`,
      }));

  const indirectOptionsFor = (currentId: string | null) =>
    indirectMoments
      .filter((moment) => moment.active || moment.id === currentId)
      .map((moment) => ({
        id: moment.id,
        label: moment.active ? moment.name : `${moment.name} (avaktiverat)`,
      }));

  return (
    <>
      <PageHeader
        title="Stämplingar"
        action={
          <NewEntryDialog
            employees={employeeOptions}
            orders={orderOptions}
            moments={pickableMoments}
          />
        }
      />

      <Card className="mb-6">
        <CardHeader
          title="Filter"
          action={
            // Samma snabbval som i rapportvyn, av samma skäl: två datumfält per
            // gång blir många knapptryck för det man gör oftast.
            <div className="flex flex-wrap items-center gap-2">
              {/* Veckostegaren bredvid snabbvalen, som i rapportvyn. */}
              <WeekStepper {...week} />

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
            </div>
          }
        />
        <FilterForm className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Från och med">
            <Input type="date" name="from" defaultValue={params.from ?? ""} />
          </Field>

          <Field label="Till och med">
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
          title="Inga stämplingar"
        />
      ) : (
        <Card>
          <CardHeader
            title={`${entries.length} ${entries.length === 1 ? "post" : "poster"}`}
            description={
              finished.length === PAGE_SIZE
                ? `Listan visar de ${PAGE_SIZE} senaste avslutade. Välj datum för äldre.`
                : undefined
            }
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
                        // BARA ÄNDRA, INGEN RADERING (ändrat 2026-09-29).
                        // Knappen fanns för felregistreringar, men en
                        // felstämpling rättas genom att skrivas om: tiden är
                        // fakturaunderlag och numera även löneunderlag, och en
                        // rad som försvinner går inte att få tillbaka. En
                        // ändrad post bär dessutom spår av vem som ändrade
                        // den, vilket en raderad inte gör.
                        <div className="flex items-center justify-end gap-2">
                          {withHistory.has(entry.id) && (
                            <Link
                              href={`/admin/installningar/logg?post=${entry.id}`}
                              className="px-2 text-[13px] font-medium text-tick-deep hover:underline"
                            >
                              Historik
                            </Link>
                          )}
                          {/* ActionDialog och inte FormDialog: den här rutan
                              KAN avvisas. En sluttid före starttiden, en
                              överlappande post eller en stängd order ska
                              synas inuti rutan i stället för att stänga den
                              som om allt gått bra. */}
                          <ActionDialog<EditEntryState>
                            trigger="Ändra"
                            triggerTone="ghost"
                            title={`Ändra stämpling: ${entry.employee.name}`}
                            action={editEntry}
                            initial={{}}
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
                                  {indirectOptionsFor(
                                    entry.indirectMomentId
                                  ).map((option) => (
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
                                    inDialog
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
                                    {momentOptionsFor(entry.momentId).map(
                                      (option) => (
                                        <option
                                          key={option.id}
                                          value={option.id}
                                        >
                                          {option.label}
                                        </option>
                                      )
                                    )}
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
                          </ActionDialog>
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
