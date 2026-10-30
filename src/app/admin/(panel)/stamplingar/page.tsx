import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { companyTimeZone } from "@/lib/company";
import NewEntryDialog from "@/components/admin/NewEntryDialog";
import { EditEntryButton, EntryEditor } from "@/components/admin/EntryEditor";
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
import ConfirmButton from "@/components/admin/ConfirmButton";
import Pager, { PerPageField } from "@/components/platform/Pager";
import { listHref, listPaging } from "@/lib/paging";
import { deleteEntry } from "./actions";

export const dynamic = "force-dynamic";

/**
 * EN SIDA I TAGET (ändrat 2026-10-17, issue #24).
 *
 * Listan visade de 200 senaste avslutade och slutade där, med en rad som bad
 * om ett datum för äldre. Varje rad bär en ruta för att ändra posten, och 200
 * sådana gjorde sidan långsam att öppna. Nu visas 50, och äldre poster nås med
 * Föregående och Nästa i stället för att behöva filtreras fram.
 *
 * Bläddringen sker i databasen: bara sidans rader hämtas, och antalet räknas.
 */

interface SearchParams {
  employeeId?: string;
  from?: string;
  to?: string;
  sida?: string;
  antal?: string;
  /** Öppnar Ny stämpling direkt. Genvägen på översikten. */
  ny?: string;
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

  const finishedFilter = { ...entryFilter, clockOutAt: { not: null } };

  // Antalet först, så att ett sidnummer bortom slutet kan visa sista sidan.
  const finishedTotal = await db.timeEntry.count({ where: finishedFilter });
  const page = listPaging(finishedTotal, params);

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
      // PÅGÅENDE FÖRST, utan tak, och bara på första sidan.
      //
      // De är det man letar efter: någon som står instämplad och inte borde
      // göra det. Låg de i samma fråga som resten kunde de trilla utanför
      // första sidan så fort en dag varit full av stämplingar, och då syns
      // just det man kom för att leta efter inte alls. På sida två och framåt
      // har man redan sett dem, och där vore de bara i vägen. De hämtas ändå,
      // eftersom de räknas i rubrikens antal; de är högst några per person.
      db.timeEntry.findMany({
        where: { ...entryFilter, clockOutAt: null },
        orderBy: [{ clockInAt: "desc" }, { id: "asc" }],
        select: entrySelect,
      }),
      db.timeEntry.findMany({
        where: finishedFilter,
        orderBy: [{ clockInAt: "desc" }, { id: "asc" }],
        skip: page.skip,
        take: page.take,
        select: entrySelect,
      }),
    ]);

  // Pågående överst på första sidan, resten under. Båda listorna är redan
  // sorterade med senaste först.
  const entries = page.page === 1 ? [...ongoing, ...finished] : finished;
  const total = ongoing.length + finishedTotal;

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

  // En BEFINTLIG post behåller däremot sitt eget moment i listan, även
  // avaktiverat. Det avgörs i rutan, se moment-options.ts.

  return (
    <>
      <PageHeader
        title="Stämplingar"
        help="andra-stampling"
        action={
          <NewEntryDialog
            employees={employeeOptions}
            orders={orderOptions}
            moments={pickableMoments}
            indirectMoments={indirectMoments
              .filter((moment) => moment.active)
              .map((moment) => ({ id: moment.id, label: moment.name }))}
            openOnMount={params.ny === "1"}
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
                      href={listHref("/admin/stamplingar", {
                        keep: {
                          from: preset.from,
                          to: preset.to,
                          employeeId: params.employeeId,
                        },
                        page: 1,
                        perPage: page.take,
                      })}
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
          <PerPageField perPage={page.take} />

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

      {total === 0 ? (
        <EmptyState
          title="Inga stämplingar"
        />
      ) : (
        <EntryEditor
          orders={orderOptions}
          moments={moments}
          indirectMoments={indirectMoments}
        >
        <Card>
          <CardHeader
            title={`${total.toLocaleString("sv-SE")} ${total === 1 ? "post" : "poster"}`}
          />
          <Table>
            <thead>
              <tr>
                <Th>Anställd</Th>
                <Th>Order och moment</Th>
                <Th>Instämplad</Th>
                <Th>Utstämplad</Th>
                <Th numeric>Längd (timmar)</Th>
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
                        // ÄNDRA OCH TA BORT. Borttagningen fanns inte mellan
                        // 2026-09-29 och 2026-10-13; den lämnar numera hela
                        // posten i ändringsloggen. Se deleteEntryManually.
                        <div className="flex items-center justify-end gap-2">
                          {withHistory.has(entry.id) && (
                            <Link
                              href={`/admin/installningar/logg?post=${entry.id}`}
                              className="px-2 text-[13px] font-medium text-tick-deep hover:underline"
                            >
                              Historik
                            </Link>
                          )}
                          {/* En gemensam ruta för hela listan, se
                              EntryEditor. Den KAN avvisas: en sluttid före
                              starttiden, en överlappande post eller en
                              stängd order syns inuti rutan. */}
                          <EditEntryButton
                            entry={{
                              id: entry.id,
                              employeeId: entry.employeeId,
                              employeeName: entry.employee.name,
                              kind: entry.kind,
                              orderId: entry.orderId,
                              momentId: entry.momentId,
                              indirectMomentId: entry.indirectMomentId,
                              clockInAt: toLocalDateTimeInput(
                                entry.clockInAt,
                                timeZone
                              ),
                              clockOutAt: toLocalDateTimeInput(
                                entry.clockOutAt!,
                                timeZone
                              ),
                            }}
                          />

                          <form action={deleteEntry}>
                            <input type="hidden" name="id" value={entry.id} />
                            <ConfirmButton
                              type="submit"
                              tone="ghost"
                              question={`Ta bort stämplingen för ${
                                entry.employee.name
                              }, ${formatDateTime(entry.clockInAt, timeZone)}? Kan inte ångras. Posten sparas i ändringsloggen.`}
                            >
                              Ta bort
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

          <Pager
            paging={page}
            total={finishedTotal}
            unit="avslutade"
            path="/admin/stamplingar"
            keep={{
              from: params.from,
              to: params.to,
              employeeId: params.employeeId,
            }}
          />
        </Card>
        </EntryEditor>
      )}
    </>
  );
}
