import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireAdmin } from "@/lib/admin-session";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
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
import LiveValue from "@/components/ui/LiveValue";
import { Skeleton } from "@/components/ui/Skeleton";
import AutoRefresh from "@/components/admin/AutoRefresh";
import BudgetBar from "@/components/admin/BudgetBar";
import {
  formatDateTime,
  formatDuration,
  formatTime,
  minutesBetween,
} from "@/lib/format";
import { getOnboardingState } from "@/lib/onboarding";
import { companyTimeZone } from "@/lib/company";
import { hasModule } from "@/lib/company-modules";
import { dayNumberIn, startOfWeekIn } from "@/lib/time-zone";
import { cronStatus, SILENT_DEVICE_HOURS } from "@/lib/platform-health";
import { buildWeek, isoWeekNumber } from "@/lib/week";
import { orderRows } from "@/lib/orders";
import { planToday, type PlanStatus } from "@/lib/plan-today";
import { planningModeOf } from "@/lib/planning";
import type { CompanyDb } from "@/lib/tenant";

export const metadata = { title: "Översikt · Tikkr" };

export const dynamic = "force-dynamic";

/**
 * ÖVERSIKTEN (omgjord 2026-10-20, produktägarens godkända förslag).
 *
 * Svarar på vad som händer nu och vad som väntar på någon. Allt här finns
 * redan någon annanstans i panelen; sidan samlar det man annars öppnar fem
 * sidor för varje morgon. Inga diagram för diagrammens skull.
 *
 * Överst det som är billigt att räkna: nyckeltalen, pågående arbete och det
 * som väntar. Ordrar i arbete och dagens plan hämtas för sig, och sidan visas
 * utan att vänta på dem — de står som skelett tills de kommit (Suspense).
 *
 * Sidan hämtas om varje minut medan den syns (AutoRefresh). Det som står
 * kvar tills det nya kommit, och ett tal som ändrats lyser upp (LiveValue).
 */

export default async function OverviewPage() {
  const { db, companyId } = await requireAdmin();

  // Dygnet och veckan räknas i FÖRETAGETS tidszon, inte serverns. Containern
  // kör UTC, så ett dygn räknat där börjar 02:00 på verkstadsgolvet på
  // sommaren — och ett kvällspass hamnar på fel dag.
  const timeZone = await companyTimeZone(companyId);
  const now = new Date();
  const silentBefore = new Date(
    now.getTime() - SILENT_DEVICE_HOURS * 60 * 60 * 1000
  );

  const [
    onboarding,
    cron,
    planning,
    working,
    week,
    needsReview,
    quickJobs,
    openOrders,
    silentScreens,
  ] = await Promise.all([
    getOnboardingState(db),
    // Ligger schemajobbet nere stängs inga glömda stämplingar, och posterna
    // räknas upp i evighet. Det måste stå i panelen: en säkerhetsfunktion som
    // tyst slutat köra är värre än ingen alls, eftersom man litar på den.
    cronStatus(),
    hasModule(companyId, "PLANNING"),
    db.timeEntry.findMany({
      where: { clockOutAt: null },
      orderBy: [{ clockInAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        employeeId: true,
        clockInAt: true,
        employee: { select: { name: true } },
        kind: true,
        order: {
          select: { orderNumber: true, customer: { select: { name: true } } },
        },
        moment: { select: { name: true } },
        indirectMoment: { select: { name: true } },
      },
    }),
    // Samma räkning som Veckovy, så att dagens och veckans tal är samma tal
    // som där: bara huvudstämplingen, per person och dag. Ett sidojobb är
    // inte en extra timme någon varit på plats. Rapporten för samma dag
    // visar mer, och ska göra det — se spans.ts.
    buildWeek(db, startOfWeekIn(now, timeZone), timeZone),
    db.timeEntry.count({ where: { needsReview: true } }),
    db.order.count({ where: { isQuickJob: true } }),
    db.order.count({ where: { status: "OPEN" } }),
    // Samma gräns som plattformens lista över tysta skärmar: ett dygn. En
    // kortare gräns hade larmat varje morgon för skärmar som stått avstängda
    // över natten.
    db.kioskDevice.findMany({
      where: { tokenHash: { not: null }, lastSeenAt: { lt: silentBefore } },
      orderBy: { lastSeenAt: "asc" },
      select: { id: true, name: true, lastSeenAt: true },
    }),
  ]);

  // Antalet PERSONER som arbetar, inte antalet öppna stämplingar. Sedan en
  // operatör kan köra två maskiner är de två olika tal, och rutan påstår
  // annars att verkstaden är dubbelt så full som den är.
  const peopleWorking = new Set(working.map((entry) => entry.employeeId)).size;

  const todayIndex = dayNumberIn(now, timeZone) - dayNumberIn(week.from, timeZone);
  const minutesToday = week.dayTotals[todayIndex] ?? 0;

  const todo: TodoItem[] = [
    ...(cron.stale
      ? [
          {
            key: "cron",
            // Rött och inte gult. Tid som inte stängs blir fel
            // fakturaunderlag, och varje dygn som går lägger till en post.
            tone: "danger" as const,
            title: "Automatisk utstämpling körs inte",
            detail: `${
              cron.lastRun
                ? `Senaste körning för ${cron.minutesAgo} minuter sedan.`
                : "Jobbet har aldrig körts."
            } Kontakta den som driftar servern.`,
          },
        ]
      : []),
    ...(needsReview > 0
      ? [
          {
            key: "review",
            tone: "warning" as const,
            title: `${needsReview} ${
              needsReview === 1 ? "stämpling" : "stämplingar"
            } att granska`,
            href: "/admin/granskning",
          },
        ]
      : []),
    ...(quickJobs > 0
      ? [
          {
            key: "quick",
            tone: "warning" as const,
            title: `${quickJobs} ${
              quickJobs === 1 ? "order" : "ordrar"
            } att komplettera`,
            detail: "Skapade från en stämplingsskärm.",
            href: "/admin/granskning",
          },
        ]
      : []),
    // En tyst stämplingsskärm kan ha en kö av tryck som inte nått fram.
    ...silentScreens.map((screen) => ({
      key: screen.id,
      tone: "warning" as const,
      title: screen.name,
      detail: `Ingen kontakt sedan ${formatDateTime(screen.lastSeenAt!, timeZone)}.`,
      href: "/admin/installningar/skarmar",
    })),
  ];

  return (
    <>
      <AutoRefresh />

      {/* Genvägarna till det man oftast gör härifrån. Ny stämpling och Ny
          order öppnar rutan direkt på sin sida (`?ny=1`). */}
      <PageHeader
        title="Översikt"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/stamplingar?ny=1" tone="secondary">
              Ny stämpling
            </ButtonLink>
            <ButtonLink href="/admin/ordrar?ny=1" tone="secondary">
              Ny order
            </ButtonLink>
            <ButtonLink href="/admin/rapporter" tone="secondary">
              Rapporter
            </ButtonLink>
          </div>
        }
      />

      {!onboarding.ready && (
        <Card className="mb-6 border-blue-300 bg-blue-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-900">
                {onboarding.completed} av {onboarding.total} steg klara
              </p>
              <p className="mt-0.5 text-[13px] text-blue-700">
                Stämplingsskärmen kan användas när stegen är klara.
              </p>
            </div>
            <ButtonLink href="/admin/kom-igang">Fortsätt uppsättningen</ButtonLink>
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Arbetar just nu"
          value={<LiveValue value={peopleWorking} />}
          tone={peopleWorking > 0 ? "active" : "neutral"}
          hint={
            // Antalet PERSONER, inte antalet stämplingar. En operatör som kör
            // två maskiner har två öppna poster men är fortfarande en person.
            working.length > peopleWorking
              ? `${working.length} pågående jobb`
              : peopleWorking === 1
                ? "person instämplad"
                : "personer instämplade"
          }
          icon={<IconPeople />}
          href="/admin/stamplingar"
        />
        <Stat
          label="Registrerat idag"
          value={
            <LiveValue value={minutesToday}>
              {formatDuration(minutesToday)}
            </LiveValue>
          }
          hint={`Vecka ${isoWeekNumber(now, timeZone)}: ${formatDuration(
            week.totalMinutes
          )}`}
          icon={<IconClock />}
          href="/admin/vecka"
        />
        {/* Samma tal som i menyn: stämplingarna OCH snabbjobben. Rutan visade
            bara stämplingarna, och två tal för samma sak får folk att tvivla på
            båda. Uppdelningen står under Att göra. */}
        <Stat
          label="Att granska"
          value={<LiveValue value={needsReview + quickJobs} />}
          tone={needsReview + quickJobs > 0 ? "warning" : "neutral"}
          icon={<IconReview />}
          href="/admin/granskning"
        />
        <Stat
          label="Öppna ordrar"
          value={<LiveValue value={openOrders} />}
          icon={<IconOrder />}
          href="/admin/ordrar"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader title="Pågående arbete" />
          {working.length === 0 ? (
            <CardEmpty>Ingen är instämplad just nu</CardEmpty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Anställd</Th>
                  <Th>Order</Th>
                  <Th>Arbetsmoment</Th>
                  <Th>Sedan</Th>
                  <Th numeric>Tid (timmar)</Th>
                </tr>
              </thead>
              <tbody>
                {working.map((entry) => (
                  <Tr key={entry.id}>
                    <Td>
                      <span className="font-medium">{entry.employee.name}</span>
                    </Td>
                    <Td>
                      {entry.order?.orderNumber ?? (
                        <Badge tone="muted">Improduktiv</Badge>
                      )}
                      {entry.order?.customer && (
                        <span className="ml-2 text-neutral-500">
                          {entry.order.customer.name}
                        </span>
                      )}
                    </Td>
                    <Td muted>
                      {entry.moment?.name ?? entry.indirectMoment?.name ?? "—"}
                    </Td>
                    <Td muted>{formatTime(entry.clockInAt, timeZone)}</Td>
                    <Td numeric>
                      <Badge tone="active">
                        {formatDuration(minutesBetween(entry.clockInAt, null))}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Todo items={todo} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className={`min-w-0 ${planning ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <Suspense fallback={<WidgetSkeleton title="Ordrar i arbete" />}>
            <OrdersInProgress db={db} />
          </Suspense>
        </div>

        {/* Bara med tillvalet. Grinden ligger här i koden och inte i menyn,
            se CLAUDE.md § 3.1: utan modulen hämtas ingenting ur planeringen. */}
        {planning && (
          <div className="min-w-0">
            <Suspense fallback={<WidgetSkeleton title="Planerat idag" />}>
              <PlannedToday
                db={db}
                companyId={companyId}
                timeZone={timeZone}
              />
            </Suspense>
          </div>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Att göra                                                                    */
/* -------------------------------------------------------------------------- */

interface TodoItem {
  key: string;
  tone: "warning" | "danger";
  title: string;
  detail?: string;
  href?: string;
}

/**
 * DET SOM VÄNTAR PÅ NÅGON.
 *
 * Samlar det som tidigare var lösa remsor över och under nyckeltalen:
 * granskning, ordrar att komplettera och automatisk utstämpling. Tysta
 * stämplingsskärmar är nya här — en skärm som inte hört av sig kan ha tryck i
 * sin kö som inte nått fram, och det märks annars först i rapporten.
 */
function Todo({ items }: { items: TodoItem[] }) {
  const dot = {
    warning: "bg-amber-500",
    danger: "bg-red-600",
  };

  return (
    <Card className="min-w-0">
      <CardHeader title="Att göra" />
      {items.length === 0 ? (
        <CardEmpty>Inget att göra</CardEmpty>
      ) : (
        <ul>
          {items.map((item) => {
            const body = (
              <>
                <span
                  aria-hidden
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dot[item.tone]}`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[13px] font-medium ${
                      item.tone === "danger" ? "text-red-900" : "text-neutral-900"
                    }`}
                  >
                    {item.title}
                  </span>
                  {item.detail && (
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {item.detail}
                    </span>
                  )}
                </span>
                {item.href && (
                  <span aria-hidden className="text-neutral-400">
                    →
                  </span>
                )}
              </>
            );

            return (
              <li
                key={item.key}
                className="border-b border-neutral-100 last:border-0"
              >
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-neutral-50"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-5 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Ordrar i arbete                                                             */
/* -------------------------------------------------------------------------- */

/** Så långt tillbaka en order räknas som i arbete. */
const IN_PROGRESS_DAYS = 7;

/** Fler än så ryms inte utan att kortet blir en orderlista. */
const IN_PROGRESS_LIMIT = 8;

/**
 * ORDRAR SOM RÖR SIG, OCH HUR DE STÅR MOT BERÄKNINGEN.
 *
 * Ordrar med ordertid de senaste sju dagarna, senast stämplade först. Tiden
 * och den beräknade tiden räknas av `orderRows`, samma funktion som
 * orderlistan, så att talen är samma tal på båda ställena. Gult när en order
 * dragit över, aldrig ett hinder (CLAUDE.md § 3 regel 6).
 */
async function OrdersInProgress({ db }: { db: CompanyDb }) {
  const since = new Date(Date.now() - IN_PROGRESS_DAYS * 24 * 60 * 60 * 1000);

  const recent = await db.timeEntry.groupBy({
    by: ["orderId"],
    where: {
      kind: "ORDER",
      orderId: { not: null },
      OR: [{ clockInAt: { gte: since } }, { clockOutAt: null }],
    },
    _max: { clockInAt: true },
    orderBy: { _max: { clockInAt: "desc" } },
    take: IN_PROGRESS_LIMIT,
  });

  const ids = recent
    .map((row) => row.orderId)
    .filter((id): id is string => id !== null);

  const rows = ids.length > 0 ? await orderRows(db, { ids }) : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const orders = ids
    .map((id) => byId.get(id))
    .filter((row) => row !== undefined);

  return (
    <Card>
      <CardHeader
        title="Ordrar i arbete"
        description="Stämplade de senaste sju dagarna"
      />
      {orders.length === 0 ? (
        <CardEmpty>Ingen ordertid de senaste sju dagarna</CardEmpty>
      ) : (
        <ul>
          {orders.map((order) => (
            <li
              key={order.id}
              // En flexrad och inte ett rutnät (ändrat 2026-10-20). Rutnätet
              // flyttade timmarna till första kolumnen på bred skärm, eftersom
              // en ruta med fast rad placeras före de andra. Här står allt i
              // den ordning det skrivs: order, stapel, timmar. På en telefon
              // går stapeln ned på en egen rad under (`order-last`).
              className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-b border-neutral-100 px-5 py-3 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {/* Ordernumret öppnar ordern (ändrat 2026-10-30, ledde till
                    rapporten). Där stängs den och där tas underlagen ut, och
                    rapporten ligger ett tryck bort. */}
                <Link
                  href={`/admin/ordrar/${order.id}`}
                  className="font-medium text-tick-deep hover:underline"
                >
                  {order.orderNumber}
                </Link>
                {order.customerName && (
                  <span className="ml-2 text-neutral-500">
                    {order.customerName}
                  </span>
                )}
              </span>

              <div className="order-last w-full sm:order-none sm:w-48 sm:shrink-0">
                {order.budgetMinutes ? (
                  <BudgetBar
                    budgetMinutes={order.budgetMinutes}
                    usedMinutes={order.minutes}
                  />
                ) : (
                  <span className="text-xs text-neutral-400">
                    Ingen beräknad tid
                  </span>
                )}
              </div>

              <span className="w-14 shrink-0 text-right text-[13px] font-medium tabular-nums text-neutral-900">
                {formatDuration(order.minutes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Planerat idag                                                               */
/* -------------------------------------------------------------------------- */

/**
 * HAR DAGENS KÖRNINGAR KOMMIT IGÅNG?
 *
 * Räknas av plan-today.ts med tavlans egna delar, så att översikten aldrig
 * säger något annat än tavlan. Planerad tid är varken arbetad eller
 * fakturerbar (CLAUDE.md § 3 regel 8); här står den bara bredvid utfallet.
 */
async function PlannedToday({
  db,
  companyId,
  timeZone,
}: {
  db: CompanyDb;
  companyId: string;
  timeZone: string;
}) {
  // Sidan frågar redan, men kortet frågar själv. Det är kortet som läser
  // planeringen, och vakten ska sitta där läsningen sker.
  if (!(await hasModule(companyId, "PLANNING"))) return null;

  const mode = await planningModeOf(companyId);
  const rows = await planToday(db, timeZone, mode);

  return (
    <Card>
      <CardHeader
        title="Planerat idag"
        action={
          <Link
            href="/admin/planering"
            className="text-[13px] font-medium text-tick-deep hover:underline"
          >
            Planering
          </Link>
        }
      />
      {rows.length === 0 ? (
        <CardEmpty>Inget planerat idag</CardEmpty>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3 last:border-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-neutral-900">
                  {row.resource}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {row.orderNumber} · {row.momentName}
                </span>
              </span>
              <PlanState
                status={row.status}
                startsAt={formatTime(row.startsAt, timeZone)}
                clockedMinutes={row.clockedMinutes}
                minutes={row.minutes}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PlanState({
  status,
  startsAt,
  clockedMinutes,
  minutes,
}: {
  status: PlanStatus;
  startsAt: string;
  clockedMinutes: number | null;
  minutes: number;
}) {
  switch (status) {
    case "running":
      return <Badge tone="active">Pågår</Badge>;
    case "late":
      return <Badge tone="warning">Ej startad</Badge>;
    case "upcoming":
      return (
        <span className="shrink-0 text-[13px] tabular-nums text-neutral-500">
          {startsAt}
        </span>
      );
    case "stopped":
      return (
        <span className="shrink-0 text-[13px] tabular-nums text-neutral-500">
          {formatDuration(clockedMinutes ?? 0)} av {formatDuration(minutes)}
        </span>
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Delar                                                                       */
/* -------------------------------------------------------------------------- */

/** Tomt läge inuti ett kort. Kortet står kvar, så att sidan inte hoppar. */
function CardEmpty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-[13px] text-neutral-500">{children}</p>;
}

/**
 * Ett kort som hämtas för sig. Rubriken står direkt, raderna som skelett, så
 * att kortet har sin plats på sidan innan innehållet kommit.
 */
function WidgetSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div role="status" className="skeleton-delay">
        <span className="sr-only">Laddar</span>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-6 border-b border-neutral-100 px-5 py-3.5 last:border-0"
          >
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-1.5 w-40 rounded-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}
