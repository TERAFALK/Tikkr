import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { companyTimeZone } from "@/lib/company";
import {
  blocksInWeek,
  orderSequences,
  planningModeOf,
  stationsFor,
  unplacedWork,
} from "@/lib/planning";
import {
  PLANNING_VIEWS,
  pickView,
  viewsFor,
  type PlanningView,
} from "@/lib/planning-modes";
import { isoWeekNumber } from "@/lib/week";
import {
  addDaysInZone,
  parseLocalDate,
  startOfWeekIn,
  toDateInput,
} from "@/lib/time-zone";
import { formatDate } from "@/lib/format";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import PlanBoard, {
  type BoardBlock,
  type BoardStation,
  type BoardUnplaced,
} from "@/components/admin/PlanBoard";

/**
 * TAVLAN — PLANERINGENS VECKOVY.
 *
 * Svarar på en fråga som varken rapporterna eller tidrapporten kan svara på:
 * NÄR ska jobbet köras, och på vilken maskin. Beräkningen per arbetsmoment
 * finns redan på ordern; den här sidan placerar ut den i tiden.
 *
 * PLANERAD TID ÄR EN AVSIKT. Den når aldrig ett fakturaunderlag eller en
 * tidrapport — se toppkommentaren i lib/planning.ts, och
 * tests/planning-boundary.test.ts som ser till att det förblir sant.
 *
 * VYERNA KOMMER UR PLANERINGSLÄGET (tillagt 2026-10-14, issue #21). En
 * verkstad har Stationer och Personal, ett tjänsteföretag bara Personal. Se
 * lib/planning-modes.ts. Vyn står i adressfältet som `vy`, så att veckopilarna
 * och ett bokmärke behåller den.
 *
 * Sidan hämtar, mappar och lämnar över. Dragandet och det levande lagret bor i
 * PlanBoard, som är en klientkomponent: servern kan inte räkna om en rutas
 * bredd vid varje pekarrörelse.
 */

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; vy?: string }>;
}) {
  const session = await requireAdmin();
  await requireModule(session, "PLANNING");

  const { db, companyId } = session;
  const params = await searchParams;

  // Veckan räknas i FÖRETAGETS tidszon, inte serverns. Gjorde den inte det
  // skulle en ruta sent på söndagen hamna i veckan efter, och planeraren leta
  // efter den i en timme.
  const [timeZone, mode] = await Promise.all([
    companyTimeZone(companyId),
    planningModeOf(companyId),
  ]);

  const view = pickView(mode, params.vy);
  const views = viewsFor(mode);

  // Ett ogiltigt värde i adressfältet ger denna vecka i stället för ett fel.
  // Samma hållning som veckovyn: tavlan är till för att arbeta i.
  const picked = params.v ? parseLocalDate(params.v, timeZone) : null;
  const monday = startOfWeekIn(picked ?? new Date(), timeZone);

  // Stationsvyns data hämtas bara när den visas. Personalvyn har ingen
  // användning för stationerna, och Oplacerat räknas där mot personalens pass.
  const [stations, blocks, unplaced] =
    view === "stations"
      ? await Promise.all([
          stationsFor(db, timeZone),
          blocksInWeek(db, monday, timeZone),
          unplacedWork(db),
        ])
      : [[], [], []];

  const open = stations.filter((station) => station.active);

  // I vilken ordning varje orders moment ska göras. Bara för de ordrar som
  // faktiskt har en ruta i veckan — tavlan ritar pilar mellan dem, och en
  // order utan rutor har inget att peka på.
  const sequences = await orderSequences(
    db,
    blocks.map((block) => block.orderId)
  );

  /** Adressen till tavlan, med vyn kvar. Förvald vy skrivs inte ut. */
  const href = (week: string | null, to: PlanningView = view) => {
    const query = new URLSearchParams();
    if (week) query.set("v", week);
    if (to !== views[0]) query.set("vy", PLANNING_VIEWS[to].slug);

    const text = query.toString();
    return text ? `/admin/planering?${text}` : "/admin/planering";
  };

  const shift = (days: number) =>
    href(toDateInput(addDaysInZone(monday, days, timeZone), timeZone));

  const isCurrentWeek =
    startOfWeekIn(new Date(), timeZone).getTime() === monday.getTime();

  // Flikarna behåller veckan man står i. Denna vecka skrivs inte ut.
  const thisWeek = isCurrentWeek ? null : toDateInput(monday, timeZone);

  const sunday = addDaysInZone(monday, 6, timeZone);

  return (
    <>
      <PageHeader
        title="Planering"
        help="planering"
        action={
          <div className="flex items-center gap-2">
            <Link
              href={shift(-7)}
              aria-label="Föregående vecka"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
            >
              ‹
            </Link>
            <Link
              href={href(null)}
              className="inline-flex h-8 items-center rounded-md border border-neutral-300 bg-white px-3 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Denna vecka
            </Link>
            <Link
              href={shift(7)}
              aria-label="Nästa vecka"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
            >
              ›
            </Link>
            {view === "stations" && (
              <ButtonLink
                href="/admin/installningar/stationer"
                tone="secondary"
              >
                Stationer
              </ButtonLink>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-neutral-500">
          {formatDate(monday, timeZone)} till {formatDate(sunday, timeZone)}
        </p>

        {views.length > 1 && (
          <nav aria-label="Vy" className="flex flex-wrap gap-1">
            {views.map((item) => (
              <Link
                key={item}
                href={href(thisWeek, item)}
                aria-current={item === view ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                  item === view
                    ? "bg-fjord text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {PLANNING_VIEWS[item].label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {view === "staff" ? (
        <EmptyState title="Inga planerade pass" />
      ) : open.length === 0 ? (
        <EmptyState
          title="Inga stationer upplagda"
          description="En station är en maskin eller arbetsplats som kör ett arbetsmoment."
          action={
            <ButtonLink href="/admin/installningar/stationer">
              Lägg upp stationer
            </ButtonLink>
          }
        />
      ) : (
        <PlanBoard
          stations={open.map(toBoardStation)}
          blocks={blocks.map(toBoardBlock)}
          unplaced={unplaced.map(toBoardUnplaced)}
          monday={monday.toISOString()}
          weekNumber={isoWeekNumber(monday, timeZone)}
          timeZone={timeZone}
          sequences={sequences}
          isCurrentWeek={isCurrentWeek}
          readOnly={Boolean(session.support)}
        />
      )}
    </>
  );
}

/* --- Översättning till tavlans egen form ----------------------------------
 *
 * PlanBoard definierar sina props själv i stället för att importera typerna ur
 * lib/planning.ts, som drar in Prisma. Mappningen är priset för den gränsen,
 * och den är värd att betala: en klientkomponent som importerar databaslagret
 * är ett steg från att använda det. Samma uppdelning som kiosken har. */

function toBoardStation(station: {
  id: string;
  name: string;
  momentId: string;
  momentName: string;
  hours: {
    weekday: number;
    startMinute: number;
    endMinute: number;
    breaks: { startMinute: number; endMinute: number }[];
  }[];
}): BoardStation {
  return {
    id: station.id,
    name: station.name,
    momentId: station.momentId,
    momentName: station.momentName,
    hours: station.hours,
  };
}

function toBoardBlock(block: {
  id: string;
  stationId: string;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  momentId: string;
  momentName: string;
  startsAt: Date;
  minutes: number;
  note: string | null;
}): BoardBlock {
  return { ...block, startsAt: block.startsAt.toISOString() };
}

function toBoardUnplaced(row: {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  dueDate: Date | null;
  momentId: string;
  momentName: string;
  budgetMinutes: number | null;
  placedMinutes: number;
  remainingMinutes: number;
  plannable: boolean;
  sequence: number;
}): BoardUnplaced {
  return { ...row, dueDate: row.dueDate?.toISOString() ?? null };
}
