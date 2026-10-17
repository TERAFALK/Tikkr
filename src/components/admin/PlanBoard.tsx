"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  SNAP_MINUTES,
  blockEnd,
  dayWindow,
  fitsFrom,
  snap,
  stationDayLoad,
  workingWindows,
  type StationHours,
} from "@/lib/plan-calendar";
import { laneTotals, type BlockProgress } from "@/lib/plan-live";
import { formatDuration } from "@/lib/format";
import {
  addDaysInZone,
  instantFromWallTime,
  wallTimeIn,
} from "@/lib/time-zone";
import {
  DAY_BORDER,
  WEEK_SCALE_FLOOR,
  axisLabels,
  dayAt,
  fitScale,
  hourLines,
  layoutDays,
  layoutWidth,
  plannedDays,
  stepDays,
  type DayAxis,
} from "@/lib/plan-geometry";
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  Textarea,
  dialogSurface,
} from "@/components/ui";
import {
  moveBlockAction,
  moveStaffBlockAction,
  noteBlockAction,
  noteStaffBlockAction,
  placeBlockAction,
  placeStaffBlockAction,
  removeBlockAction,
  removeStaffBlockAction,
  resizeBlockAction,
  resizeStaffBlockAction,
} from "@/app/admin/(panel)/planering/actions";

/**
 * TAVLAN.
 *
 * En rad per resurs, dagarna åt höger, och rutor som hämtar sin tid ur
 * orderns beräkning.
 *
 * ── TVÅ SORTERS RADER (ändrat 2026-10-14, fas 2 av issue #21) ───────────
 *
 * En rad är en STATION eller en ANSTÄLLD, och samma tavla ritar båda. En
 * kopia för personalen hade varit tvåtusen rader som gled isär vid första
 * ändringen.
 *
 * Skillnaderna är tre, och de bärs av raden och inte av villkor i koden:
 *
 *   MOMENTET. En station kör ett arbetsmoment och tar bara emot det. En
 *   anställd har `momentId: null` och tar vilket som helst.
 *
 *   TIDERNA. En station har öppettider och raster. En anställd har inga än
 *   (fas 3), `hours: null`, och då ritas dagen vit, utan stängd tid, och
 *   varnas bara för pass som ligger i varandra.
 *
 *   ÅTGÄRDERNA. Stationens rutor och personalens pass skrivs genom var sin
 *   uppsättning serveråtgärder, med samma form.
 *
 * ── ATT PLACERA ETT JOBB SKA VARA TVÅ TRYCK ──────────────────────────────
 *
 * Första versionen hade bara dragning, och den var opålitlig på ett sätt som
 * inte gick att se. Träffytorna låg i en Map av DOM-noder som byggdes om vid
 * varje omrendering, och en dragning renderar om vid varje pekarrörelse:
 * släppte man i fel ögonblick fanns ingen cell under pekaren och ingenting
 * hände. Det syntes som att tavlan tappade bort jobb på måfå.
 *
 * Nu finns två vägar, och DEN ENKLA ÄR FÖRSTAVALET:
 *
 *   TRYCK på ett jobb i Oplacerat. Det blir valt, och stationerna som kan
 *   köra momentet lyser upp medan resten tonas ned. TRYCK sedan i en sådan
 *   rad. Klart.
 *
 *   DRA jobbet dit i stället, om man hellre siktar direkt.
 *
 * Två tryck fungerar med fingrar, på en sladdrig mus, och för den som inte
 * gissar att en ruta går att dra. Dragningen finns kvar för att den är
 * snabbare när man redan vet var jobbet ska.
 *
 * ── TRÄFFYTAN RÄKNAS, DEN SLÅS INTE UPP ──────────────────────────────────
 *
 * Vilken station och vilket klockslag pekaren står på räknas fram ur ETT mått
 * på radernas behållare. Raderna är lika höga och dagarnas bredder är kända,
 * så svaret är ren aritmetik. Det går inte sönder av en omrendering.
 *
 * ── VECKA OCH DAG (ändrat 2026-10-17) ────────────────────────────────────
 *
 * Vecka lägger alla sju dagar i den bredd som finns. Dag lägger en dag i full
 * bredd, och är vägen till läsbara timmar och till en tavla som går att
 * använda på en telefon. Den valda dagen står i
 * adressfältet som `dag`, så att den överlever en omritning och ett bokmärke.
 * Dagen ersatte zoomknapparna, som förstorade hela veckan och lämnade resten
 * av den utanför kanten.
 *
 * Var dagarna ligger, vad ett tryck träffar och var klockslagen står räknas i
 * lib/plan-geometry.ts, en gång, för rubriken, rutnätet och träffytan.
 *
 * ── OPLACERAT LIGGER ÖVER, INTE BREDVID ──────────────────────────────────
 *
 * Som en rad över tavlan. Panelen vid sidan tog tvåhundrafemtio pixlar av
 * veckans bredd även när den stod tom, och veckan är det man är här för.
 */

/* -------------------------------------------------------------------------- */
/* Formen                                                                      */
/* -------------------------------------------------------------------------- */

/** Vad raderna är. Avgör åtgärderna och texterna. */
export type LaneKind = "stations" | "staff";

/** En rad på tavlan: en station eller en anställd. */
export interface BoardLane {
  id: string;
  name: string;
  /** Raden under namnet: stationens arbetsmoment, eller tomt. */
  detail: string | null;
  /** Momentet raden tar emot. Null betyder vilket som helst. */
  momentId: string | null;
  /** Öppettiderna per veckodag. Null när raden inte har några tider. */
  hours: StationHours[] | null;
}

/** En anställd att bemanna en stationsruta med. */
export interface BoardEmployee {
  id: string;
  name: string;
}

/** Ett pass som bemannar en stationsruta, som rutans dialog visar det. */
export interface BoardStaffing {
  id: string;
  employeeName: string;
  startsAt: string;
  minutes: number;
  /** Passet ligger utanför personens arbetstid. */
  outsideHours: boolean;
  /** Personen har ett annat pass samtidigt. */
  overlaps: boolean;
  /** Stämplat inom passet. Saknas innan utfallet hämtats. */
  clockedMinutes?: number;
}

export interface BoardBlock {
  id: string;
  /** Raden rutan ligger på: stationens eller den anställdas id. */
  laneId: string;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  momentId: string;
  momentName: string;
  startsAt: string;
  minutes: number;
  note: string | null;
  /** Stationen ett pass bemannar. Null för stationsrutor och fria pass. */
  context: string | null;
}

export interface BoardUnplaced {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  dueDate: string | null;
  momentId: string;
  momentName: string;
  budgetMinutes: number | null;
  placedMinutes: number;
  remainingMinutes: number;
  plannable: boolean;
  /** Momentets plats i orderns egen ordning. Noll först. */
  sequence: number;
}

/* -------------------------------------------------------------------------- */
/* Mått och konstanter                                                         */
/* -------------------------------------------------------------------------- */

/** Hur ofta utfallet hämtas. Tio sekunder känns samtidigt utan att märkas. */
const LIVE_MS = 10_000;

/** Stationskolumnens bredd. Används både för att rita och för att räkna. */
const STATION_COLUMN = 160;

/** Radhöjden. MÅSTE stämma med klassen nedan — träffytan räknar med den. */
const ROW_HEIGHT = 72;
const ROW_CLASS = "h-[72px]";


/** Hur långt pekaren får röra sig och ändå räknas som ett tryck. */
const CLICK_SLOP = 5;

const DAY_LONG = [
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
  "Söndag",
];
const DAY_SHORT = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

const MS_PER_MINUTE = 60_000;

/**
 * STÄNGD TID OCH RASTER: ytan utanför arbetstiden, och förklaringens ruta.
 *
 * Ett enda klassnamn för båda (ändrat 2026-10-17). Cellerna ritades med
 * `neutral-100` på 70 procent, nästan vitt mot vitt, medan förklaringen visade
 * Lav. Det gick inte att se vilka tider en person arbetade, och rutan
 * "Stängt eller rast" stämde inte med det som ritades. Lav är guidens färg för
 * tysta ytor.
 */
const CLOSED_CLASS = "bg-neutral-200/80";

/**
 * Serveråtgärderna per sorts rad. Samma form, så att tavlan inte behöver veta
 * vilken den talar med utöver fältet som pekar ut raden.
 */
const STATION_ACTIONS = {
  place: placeBlockAction,
  move: moveBlockAction,
  resize: resizeBlockAction,
  note: noteBlockAction,
  remove: removeBlockAction,
};

const STAFF_ACTIONS = {
  place: placeStaffBlockAction,
  move: moveStaffBlockAction,
  resize: resizeStaffBlockAction,
  note: noteStaffBlockAction,
  remove: removeStaffBlockAction,
};

/* -------------------------------------------------------------------------- */
/* Dragningens tillstånd                                                       */
/* -------------------------------------------------------------------------- */

interface Slot {
  laneId: string;
  dayIndex: number;
  /** Starttiden pekaren svarar mot, redan snäppt. */
  startsAt: Date;
}

type Drag =
  | {
      kind: "new";
      row: BoardUnplaced;
      at: { x: number; y: number };
      slot: Slot | null;
    }
  | {
      kind: "move";
      block: BoardBlock;
      /** Var i rutan man tog tag, i minuter från rutans början. */
      grabMinutes: number;
      at: { x: number; y: number };
      slot: Slot | null;
    }
  | {
      kind: "resize";
      block: BoardBlock;
      /** Rutans längd när draget började, och pekarens x-läge då. */
      fromMinutes: number;
      originX: number;
      minutes: number;
    };

/* -------------------------------------------------------------------------- */
/* Komponenten                                                                 */
/* -------------------------------------------------------------------------- */

export default function PlanBoard({
  kind,
  lanes,
  blocks: initialBlocks,
  unplaced: initialUnplaced,
  placesFromUnplaced,
  employees,
  staffing = {},
  monday,
  weekNumber,
  timeZone,
  isCurrentWeek,
  today,
  focusDay,
  showWeekend,
  sequences,
  readOnly,
}: {
  kind: LaneKind;
  lanes: BoardLane[];
  blocks: BoardBlock[];
  unplaced: BoardUnplaced[];
  /**
   * Om raderna räknar av orderns beräknade tid, och Oplacerat därför visas.
   * Personalen i en verkstad är bemanning och gör det inte, se
   * lib/planning-modes.ts.
   */
  placesFromUnplaced: boolean;
  /**
   * Anställda att bemanna stationsrutor med. Utelämnat när raderna inte är
   * stationer, och då har rutans dialog ingen bemanning.
   */
  employees?: BoardEmployee[];
  /** Bemanningen per stationsruta. */
  staffing?: Record<string, BoardStaffing[]>;
  /** Måndagens dygnsbörjan, som ISO. */
  monday: string;
  weekNumber: number;
  timeZone: string;
  isCurrentWeek: boolean;
  /** Dagens datum, "ÅÅÅÅ-MM-DD", i företagets tidszon. */
  today: string;
  /** Den valda dagen i dagvyn, "ÅÅÅÅ-MM-DD". Null betyder veckovyn. */
  focusDay: string | null;
  /** Om lördag och söndag ritas. Dolda som standard, se plannedDays. */
  showWeekend: boolean;
  /**
   * I vilken ordning varje orders moment ska göras, som moment-id per order.
   *
   * Tavlan ritar pilar efter den: svetsningen pekar på lackeringen. En order
   * som saknas här har ingen känd följd, och då ritas inga pilar.
   */
  sequences: Record<string, string[]>;
  /** Supportläge. Tavlan går att läsa, inte att ändra. */
  readOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isStaff = kind === "staff";
  const laneField = isStaff ? "employeeId" : "stationId";
  const actions = isStaff ? STAFF_ACTIONS : STATION_ACTIONS;

  const [blocks, setBlocks] = useState(initialBlocks);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [armed, setArmed] = useState<BoardUnplaced | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, BlockProgress>>({});
  /** Om utfallet hämtats för veckan. Noll stämplat är ett svar, inget svar är inget. */
  const [liveLoaded, setLiveLoaded] = useState(false);
  /** Utfallet för bemanningen av stationsrutorna, per pass. */
  const [staffingProgress, setStaffingProgress] = useState<
    Record<string, BlockProgress>
  >({});
  const [now, setNow] = useState<number | null>(null);
  const [editing, setEditing] = useState<BoardBlock | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  /** Radernas behållare. Enda måttet träffytan räknas ur. */
  const bodyRef = useRef<HTMLDivElement>(null);

  // Serverns bild vinner när sidan ritats om. Utan detta skulle en
  // omrendering efter revalidatePath lämna de optimistiska rutorna kvar, och
  // en avvisad ändring synas som genomförd tills fliken laddades om.
  useEffect(() => setBlocks(initialBlocks), [initialBlocks]);

  const mondayStart = useMemo(() => new Date(monday), [monday]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const measure = () => setBoardWidth(node.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  /** Veckans sju dygnsbörjan, som tidpunkter. */
  const days = useMemo(
    () => buildDays(mondayStart, timeZone),
    [mondayStart, timeZone]
  );

  /** Veckans dagar som "ÅÅÅÅ-MM-DD". Samma form som adressfältet. */
  const dayKeys = useMemo(
    () => days.map((day) => toDateParam(day, timeZone)),
    [days, timeZone]
  );

  const todayIndex = indexOrNull(dayKeys.indexOf(today));
  const focusIndex = focusDay ? indexOrNull(dayKeys.indexOf(focusDay)) : null;
  const isDay = focusIndex !== null;

  // LINJEN FÖR NU går på webbläsarens klocka och flyttas varje halvminut.
  // Den hämtades tidigare med utfallet, och syntes därför bara i stationsvyn.
  useEffect(() => {
    if (!isCurrentWeek) {
      setNow(null);
      return;
    }

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);

    return () => clearInterval(timer);
  }, [isCurrentWeek]);

  /**
   * Till en dag i dagvyn, eller tillbaka till veckan.
   *
   * Genom adressfältet och inte ett lokalt läge: sidan hämtar veckan ur
   * datumet, så en dag i nästa vecka är bara ett annat datum.
   */
  const show = useCallback(
    (day: string | null) => {
      const query = new URLSearchParams(searchParams.toString());

      if (day) {
        query.set("dag", day);
        query.delete("v");
      } else {
        query.delete("dag");
        query.set("v", dayKeys[0]);
      }

      router.push(`${pathname}?${query.toString()}`);
    },
    [dayKeys, pathname, router, searchParams]
  );

  /** Dagen före eller efter den valda, även över veckans kant. */
  const step = useCallback(
    (direction: -1 | 1) => {
      if (focusIndex === null) return;

      // Över helgen när den är dold, se stepDays.
      const offset = stepDays(focusIndex, direction, showWeekend);
      const target = focusIndex + offset;

      show(
        target >= 0 && target < 7
          ? dayKeys[target]
          : toDateParam(addDaysInZone(days[focusIndex], offset, timeZone), timeZone)
      );
    },
    [dayKeys, days, focusIndex, show, showWeekend, timeZone]
  );

  /**
   * Visar eller döljer helgen. I adressfältet som `helg=visa`, som dagvyn, och
   * inte i en kaka: valet följer med mellan veckor och dagar, och nästa gång
   * tavlan öppnas är helgen dold igen. En kaka hade dessutom behövt stå i
   * integritetspolicyns uppräkning.
   */
  const toggleWeekend = useCallback(() => {
    const query = new URLSearchParams(searchParams.toString());

    if (showWeekend) query.delete("helg");
    else query.set("helg", "visa");

    router.push(`${pathname}?${query.toString()}`);
  }, [pathname, router, searchParams, showWeekend]);

  /* --- Utfallet ---------------------------------------------------------- */

  const syncProgress = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/plan/live?v=${toDateParam(mondayStart, timeZone)}${
          isStaff ? "&vy=personal" : ""
        }`,
        { cache: "no-store" }
      );

      if (!response.ok) return;

      const data = (await response.json()) as {
        progress: Record<string, BlockProgress>;
        staffing?: Record<string, BlockProgress>;
      };

      setProgress(data.progress);
      setStaffingProgress(data.staffing ?? {});
      setLiveLoaded(true);
    } catch {
      // Nätet glappade. Behåll det vi vet i stället för att tömma vyn.
    }
  }, [isStaff, mondayStart, timeZone]);

  useEffect(() => {
    // INGEN POLLNING I EN VECKA SOM INTE PÅGÅR. I en vecka som varit finns
    // ingenting levande att hämta, men utfallet hämtas EN gång: planerat mot
    // stämplat är lika mycket värt i efterhand (fas 4, 2026-10-17). En vecka
    // som inte börjat har inget utfall alls.
    setLiveLoaded(false);

    if (!isCurrentWeek) {
      setProgress({});
      setStaffingProgress({});

      if (mondayStart.getTime() < Date.now()) void syncProgress();
      return;
    }

    void syncProgress();

    const timer = setInterval(() => void syncProgress(), LIVE_MS);
    const onWake = () => void syncProgress();

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [isCurrentWeek, mondayStart, syncProgress]);

  /* --- Måtten ------------------------------------------------------------ */

  const hoursFor = useCallback(
    (laneId: string, dayIndex: number): StationHours | null => {
      const lane = lanes.find((item) => item.id === laneId);
      if (!lane?.hours) return null;

      return lane.hours.find((day) => day.weekday === dayIndex + 1) ?? null;
    },
    [lanes]
  );

  /**
   * Vilka dagar som ritas: alla sju, eller bara den valda dagen. Se
   * plannedDays i lib/plan-geometry.ts.
   */
  const plans = useMemo(
    () => plannedDays(focusIndex, showWeekend),
    [focusIndex, showWeekend]
  );

  /**
   * Planerat på lördag och söndag. Står på knappen när helgen är dold, så att
   * ett jobb på en lördag inte försvinner ur sikte bara för att knappen står
   * på Dölj.
   */
  const weekendBlocks = blocks.filter(
    (block) => (dayIndexOf(new Date(block.startsAt), days) ?? 0) >= 5
  ).length;

  const visibleDays = useMemo(() => plans.map((plan) => plan.index), [plans]);

  /**
   * Tidsaxeln per dag.
   *
   * RÄKNAS UR SERVERNS RUTOR, inte ur de optimistiska. Axeln sträcks ut av en
   * ruta som ligger utanför öppettiderna, och med den lokala listan som
   * underlag ändrades därmed varje kolumns bredd mitt under en dragning — allt
   * på tavlan bytte storlek medan man höll i det. Nu rör sig bredderna en gång,
   * när servern svarat, i stället för två gånger varav en under handen.
   */
  const windows = useMemo(() => {
    const result = new Map<number, DayAxis>();

    for (const index of visibleDays) {
      const spans = initialBlocks
        .filter((block) => dayIndexOf(new Date(block.startsAt), days) === index)
        .map((block) => ({
          startsAt: new Date(block.startsAt),
          minutes: block.minutes,
          hours: hoursFor(block.laneId, index),
        }));

      const hours = lanes.map((lane) => hoursFor(lane.id, index));

      result.set(index, dayWindow(hours, spans, days[index], timeZone));
    }

    return result;
  }, [days, hoursFor, initialBlocks, lanes, timeZone, visibleDays]);

  const axisOf = useCallback(
    (index: number): DayAxis =>
      windows.get(index) ?? { startMinute: 0, endMinute: 0 },
    [windows]
  );

  /**
   * Skalan: pixlar per minut, så att de dagar som ritas fyller bredden.
   *
   * Måtten är kända först när dagfönstren räknats, eftersom en dag med en
   * station som går till 20:00 är bredare än en som slutar 16:00.
   */
  const pxPerMinute = useMemo(
    () =>
      boardWidth === 0
        ? 0.5
        : fitScale({
            available: boardWidth - STATION_COLUMN,
            plans,
            axisOf,
            floor: WEEK_SCALE_FLOOR,
          }),
    [axisOf, boardWidth, plans]
  );

  /** Var varje dag ligger. Rubriken, rutnätet och träffytan läser härifrån. */
  const columns = useMemo(
    () =>
      layoutDays(
        plans,
        axisOf,
        pxPerMinute,
        boardWidth === 0 ? undefined : boardWidth - STATION_COLUMN
      ),
    [axisOf, boardWidth, plans, pxPerMinute]
  );

  /* --- Träffytan --------------------------------------------------------- */

  /**
   * Vilken station och vilket klockslag en punkt på skärmen svarar mot.
   *
   * RÄKNAS, SLÅS INTE UPP. Ett enda `getBoundingClientRect` på radernas
   * behållare, och resten är aritmetik: raderna är lika höga, dagarnas
   * bredder är kända. Rektangeln bär redan rullningen i sig, så den behöver
   * inte läggas till.
   *
   * Den tidigare versionen gick igenom en Map av DOM-noder som byggdes om vid
   * varje omrendering. En dragning renderar om vid varje pekarrörelse, så
   * uppslaget kunde ske mitt i ombyggnaden och svara tomt. Det var hela skälet
   * att dragningen kändes trasig.
   */
  const slotAt = useCallback(
    (clientX: number, clientY: number): Slot | null => {
      const body = bodyRef.current;
      if (!body) return null;

      const rect = body.getBoundingClientRect();

      const row = Math.floor((clientY - rect.top) / ROW_HEIGHT);
      if (row < 0 || row >= lanes.length) return null;

      const hit = dayAt(
        columns,
        clientX - rect.left - STATION_COLUMN,
        axisOf,
        pxPerMinute,
        SNAP_MINUTES
      );

      if (!hit) return null;

      return {
        laneId: lanes[row].id,
        dayIndex: hit.index,
        startsAt: new Date(days[hit.index].getTime() + hit.minute * MS_PER_MINUTE),
      };
    },
    [axisOf, columns, days, lanes, pxPerMinute]
  );

  /** Pixlar från tavlans vänsterkant till innehållet i en dag. */
  const dayOffset = useCallback(
    (dayIndex: number) => {
      const column = columns.find(
        (item) => item.index === dayIndex
      );
      return column ? STATION_COLUMN + column.left : null;
    },
    [columns]
  );

  /* --- Skrivningarna ----------------------------------------------------- */

  /** Kör en åtgärd och lägger tillbaka den optimistiska bilden vid fel. */
  const run = useCallback(
    async (
      before: BoardBlock[],
      optimistic: () => void,
      send: () => Promise<{ error?: string }>
    ) => {
      optimistic();

      const result = await send();

      if (result.error) {
        setBlocks(before);
        setError(result.error);
        return;
      }

      setError(null);

      // Serverns svar hämtas in. Den kan ha kapat rutan mot midnatt eller
      // avrundat annorlunda än vi gissade, och då ska dess siffra gälla.
      router.refresh();
    },
    [router]
  );

  const place = useCallback(
    async (row: BoardUnplaced, slot: Slot) => {
      const lane = lanes.find((item) => item.id === slot.laneId);
      if (!lane) return;

      if (lane.momentId !== null && lane.momentId !== row.momentId) {
        setError(`${lane.name} kör inte ${row.momentName}.`);
        return;
      }

      const hours = hoursFor(lane.id, slot.dayIndex);
      const room = fitsFrom(hours, slot.startsAt, timeZone);

      if (room < 1) {
        setError("Starttiden ligger för sent på dygnet.");
        return;
      }

      const minutes = Math.min(
        snap(Math.max(SNAP_MINUTES, row.remainingMinutes)),
        room
      );

      // Tillfälligt id. Ersätts av serverns när sidan ritas om.
      const draft: BoardBlock = {
        id: `ny-${Date.now()}`,
        laneId: lane.id,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        customerName: row.customerName,
        momentId: row.momentId,
        momentName: row.momentName,
        startsAt: slot.startsAt.toISOString(),
        minutes,
        note: null,
        context: null,
      };

      setArmed(null);

      await run(
        blocks,
        () => setBlocks((current) => [...current, draft]),
        () => {
          const data = new FormData();
          data.set("orderId", row.orderId);
          data.set("momentId", row.momentId);
          data.set(laneField, lane.id);
          data.set("startsAt", slot.startsAt.toISOString());
          data.set("minutes", String(minutes));
          return actions.place({}, data);
        }
      );
    },
    [actions, blocks, hoursFor, laneField, lanes, run, timeZone]
  );

  const moveTo = useCallback(
    async (block: BoardBlock, slot: Slot) => {
      const lane = lanes.find((item) => item.id === slot.laneId);
      if (!lane) return;

      if (lane.momentId !== null && lane.momentId !== block.momentId) {
        setError(`${lane.name} kör inte ${block.momentName}.`);
        return;
      }

      await run(
        blocks,
        () =>
          setBlocks((current) =>
            current.map((item) =>
              item.id === block.id
                ? {
                    ...item,
                    laneId: lane.id,
                    startsAt: slot.startsAt.toISOString(),
                  }
                : item
            )
          ),
        () => {
          const data = new FormData();
          data.set("blockId", block.id);
          data.set(laneField, lane.id);
          data.set("startsAt", slot.startsAt.toISOString());
          return actions.move({}, data);
        }
      );
    },
    [actions, blocks, laneField, lanes, run]
  );

  const resize = useCallback(
    async (block: BoardBlock, minutes: number) => {
      if (minutes === block.minutes) return;

      await run(
        blocks,
        () =>
          setBlocks((current) =>
            current.map((item) =>
              item.id === block.id ? { ...item, minutes } : item
            )
          ),
        () => {
          const data = new FormData();
          data.set("blockId", block.id);
          data.set("minutes", String(minutes));
          return actions.resize({}, data);
        }
      );
    },
    [actions, blocks, run]
  );

  const saveNote = useCallback(
    async (block: BoardBlock, note: string) => {
      if ((block.note ?? "") === note.trim()) return;

      await run(
        blocks,
        () =>
          setBlocks((current) =>
            current.map((item) =>
              item.id === block.id
                ? { ...item, note: note.trim() || null }
                : item
            )
          ),
        () => {
          const data = new FormData();
          data.set("blockId", block.id);
          data.set("note", note);
          return actions.note({}, data);
        }
      );
    },
    [actions, blocks, run]
  );

  const remove = useCallback(
    async (block: BoardBlock) => {
      setEditing(null);

      await run(
        blocks,
        () =>
          setBlocks((current) => current.filter((item) => item.id !== block.id)),
        () => {
          const data = new FormData();
          data.set("blockId", block.id);
          return actions.remove({}, data);
        }
      );
    },
    [actions, blocks, run]
  );

  /**
   * Bemannar en stationsruta: ett pass för en anställd, kopplat till rutan.
   *
   * Svarar med felet i stället för att lägga det överst på tavlan. Dialogen
   * ligger över tavlan, och ett fel bakom den hade ingen sett.
   */
  const staff = useCallback(
    async (
      block: BoardBlock,
      employeeId: string,
      startsAt: Date,
      minutes: number
    ): Promise<string | null> => {
      const data = new FormData();
      data.set("employeeId", employeeId);
      data.set("orderId", block.orderId);
      data.set("momentId", block.momentId);
      data.set("plannedBlockId", block.id);
      data.set("startsAt", startsAt.toISOString());
      data.set("minutes", String(minutes));

      const result = await placeStaffBlockAction({}, data);
      if (result.error) return result.error;

      router.refresh();
      return null;
    },
    [router]
  );

  const unstaff = useCallback(
    async (id: string): Promise<string | null> => {
      const data = new FormData();
      data.set("blockId", id);

      const result = await removeStaffBlockAction({}, data);
      if (result.error) return result.error;

      router.refresh();
      return null;
    },
    [router]
  );

  /* --- Pekaren ----------------------------------------------------------- */

  const origin = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  function beginNew(event: ReactPointerEvent<HTMLElement>, row: BoardUnplaced) {
    if (readOnly || !row.plannable) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { x: event.clientX, y: event.clientY };
    moved.current = false;

    setError(null);
    setDrag({
      kind: "new",
      row,
      at: { x: event.clientX, y: event.clientY },
      slot: null,
    });
  }

  function beginMove(event: ReactPointerEvent<HTMLElement>, block: BoardBlock) {
    if (readOnly) return;

    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { x: event.clientX, y: event.clientY };
    moved.current = false;

    setDrag({
      kind: "move",
      block,
      grabMinutes: (event.clientX - rect.left) / Math.max(pxPerMinute, 0.01),
      at: { x: event.clientX, y: event.clientY },
      slot: null,
    });
  }

  function beginResize(
    event: ReactPointerEvent<HTMLElement>,
    block: BoardBlock
  ) {
    if (readOnly) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { x: event.clientX, y: event.clientY };
    moved.current = false;

    setDrag({
      kind: "resize",
      block,
      fromMinutes: block.minutes,
      originX: event.clientX,
      minutes: block.minutes,
    });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag) return;

    const start = origin.current;

    if (
      start &&
      (Math.abs(event.clientX - start.x) > CLICK_SLOP ||
        Math.abs(event.clientY - start.y) > CLICK_SLOP)
    ) {
      moved.current = true;
    }

    if (drag.kind === "resize") {
      const delta = (event.clientX - drag.originX) / Math.max(pxPerMinute, 0.01);
      setDrag({ ...drag, minutes: snap(drag.fromMinutes + delta) });
      return;
    }

    const slot = slotAt(event.clientX, event.clientY);

    if (drag.kind === "new") {
      setDrag({ ...drag, at: { x: event.clientX, y: event.clientY }, slot });
      return;
    }

    // Pekaren pekar på var man HÅLLER, inte på rutans början. Utan
    // greppavståndet hoppar rutan så att dess vänsterkant hamnar under
    // fingret, vilket känns som att den rycker till.
    const shifted = slot
      ? {
          ...slot,
          startsAt: new Date(
            slot.startsAt.getTime() -
              Math.round(drag.grabMinutes / SNAP_MINUTES) *
                SNAP_MINUTES *
                MS_PER_MINUTE
          ),
        }
      : null;

    setDrag({
      ...drag,
      at: { x: event.clientX, y: event.clientY },
      slot: shifted,
    });
  }

  async function onPointerUp() {
    const current = drag;
    const didMove = moved.current;

    setDrag(null);
    origin.current = null;
    moved.current = false;

    if (!current) return;

    if (current.kind === "resize") {
      if (didMove) await resize(current.block, current.minutes);
      return;
    }

    // ETT TRYCK UTAN RÖRELSE ÄR INTE EN DRAGNING.
    //
    // På ett jobb i Oplacerat betyder det "välj det här", och nästa tryck på
    // tavlan placerar det. På en ruta betyder det "öppna den".
    if (!didMove) {
      if (current.kind === "new") {
        setArmed((value) =>
          value &&
          value.orderId === current.row.orderId &&
          value.momentId === current.row.momentId
            ? null
            : current.row
        );
      } else {
        setEditing(current.block);
      }
      return;
    }

    if (!current.slot) return;

    if (current.kind === "new") await place(current.row, current.slot);
    else await moveTo(current.block, current.slot);
  }

  /** Ett tryck på tavlan när ett jobb är valt placerar det där. */
  function onBodyPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (drag || !armed || readOnly) return;

    const slot = slotAt(event.clientX, event.clientY);
    if (slot) void place(armed, slot);
  }

  // Escape avbryter ett val. Den som ångrat sig ska inte behöva träffa samma
  // ruta igen för att komma ur läget.
  useEffect(() => {
    if (!armed) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setArmed(null);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed]);

  /* --- Det som ritas ----------------------------------------------------- */

  /** Rutorna som de ser ut just nu, med dragningen inräknad. */
  const shown = useMemo(() => {
    if (!drag) return blocks;

    if (drag.kind === "resize") {
      return blocks.map((block) =>
        block.id === drag.block.id ? { ...block, minutes: drag.minutes } : block
      );
    }

    if (drag.kind === "move" && drag.slot) {
      const { laneId, startsAt } = drag.slot;
      const moving = drag.block.id;

      return blocks.map((block) =>
        block.id === moving
          ? { ...block, laneId, startsAt: startsAt.toISOString() }
          : block
      );
    }

    return blocks;
  }, [blocks, drag]);

  /**
   * Raderna som visas i Oplacerat.
   *
   * Allt utom det som gått jämnt ut. En rad med noll kvar ligger ute på tavlan
   * och är färdigplanerad; en rad med MINUS kvar är planerad över sin
   * beräkning, och den ska synas.
   *
   * Filtret var `remainingMinutes > 0` till 2026-10-04, vilket tog bort just
   * de raderna. Att planera sju timmar på ett moment beräknat till sex gick
   * alltså igenom helt osynligt: brickan försvann ur Oplacerat som om allt
   * stämde. Systemet HINDRAR inte överplanering, av samma skäl som det inte
   * hindrar stämpling över beräkningen — men det ska säga ifrån.
   */
  const unplaced = useMemo(
    () =>
      initialUnplaced.filter(
        (row) => row.remainingMinutes !== 0 || row.budgetMinutes === null
      ),
    [initialUnplaced]
  );

  /**
   * Momentet som söker en plats just nu, draget eller valt.
   *
   * Stationerna som kan köra det lyser upp, resten tonas ned. Att visa VAR
   * något får ligga är billigare än ett felmeddelande efteråt.
   */
  const seeking =
    drag?.kind === "new"
      ? drag.row.momentId
      : drag?.kind === "move"
        ? drag.block.momentId
        : (armed?.momentId ?? null);

  const draggedBlockId = drag && drag.kind !== "new" ? drag.block.id : null;
  const dropSlot = drag && drag.kind !== "resize" ? drag.slot : null;

  /** Tavlans hela bredd. Pilarnas lager spänner över den. */
  const contentWidth = STATION_COLUMN + layoutWidth(columns);

  /**
   * Veckans planerade och stämplade tid per anställd. Står under namnet i
   * personalvyn, se laneTotals i lib/plan-live.ts.
   */
  const totals = useMemo(() => laneTotals(blocks, progress), [blocks, progress]);

  /**
   * PILARNA SOM VISAR FÖLJDEN I ETT JOBB.
   *
   * Två sorter, och båda betyder "det här kommer efter det där":
   *
   *   MELLAN MOMENT. Svetsningen pekar på fräsningen, enligt orderns egen
   *   ordning (OrderBudget.sortOrder). Dras från den SENAST avslutade rutan i
   *   ett moment till den TIDIGAST påbörjade i nästa: det är den punkt där
   *   nästa steg tidigast kan börja, och alltså den enda som säger något.
   *
   *   INOM ETT MOMENT. Sex timmars fräsning som delats på fyra timmar måndag
   *   och två på tisdag är fortfarande ett arbete. Utan pil mellan delarna såg
   *   det ut som två orelaterade jobb som råkade ha samma ordernummer, och
   *   man fick själv hålla reda på att den ena var en fortsättning.
   *
   * Delarna kedjas i STARTTIDSORDNING, oavsett vilken station de ligger på.
   * Ett moment som delats mellan två fräsar hör ihop lika mycket som ett som
   * delats över två dagar.
   *
   * ── NÄR PILEN BLIR GUL ───────────────────────────────────────────────────
   *
   * Bara mellan moment, och bara när nästa steg börjar innan det förra är
   * klart. Då är stegen planerade i otakt, och det ska synas. Den hindras inte
   * — ibland är det precis vad som måste hända.
   *
   * INOM ett moment flaggas ingenting. Två fräsar som kör samma fräsning
   * samtidigt är inte otakt, det är två maskiner på samma jobb, och en gul
   * pil där hade varit ett falsklarm på något helt normalt.
   *
   * Ordrar UTAN beräkning får också sina delar kedjade. Följden mellan moment
   * är okänd då, men att en fräsning delats på två dagar vet vi ändå.
   */
  const arrows = useMemo(() => {
    // Bara där raderna räknar av beräkningen. Bemanningen i en verkstad följer
    // stationens rutor, och samma pilar en gång till på personalens rader
    // säger ingenting nytt.
    if (!placesFromUnplaced) return [];

    const rows = new Map(lanes.map((lane, index) => [lane.id, index]));

    const found: {
      key: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      backwards: boolean;
    }[] = [];

    // Rutorna grupperade per order och moment, varje grupp i starttidsordning.
    const byOrder = new Map<string, Map<string, BoardBlock[]>>();

    for (const block of shown) {
      const moments = byOrder.get(block.orderId) ?? new Map();
      const list = moments.get(block.momentId) ?? [];

      list.push(block);
      moments.set(block.momentId, list);
      byOrder.set(block.orderId, moments);
    }

    for (const moments of byOrder.values()) {
      for (const list of moments.values()) {
        list.sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
        );
      }
    }

    for (const [orderId, moments] of byOrder) {
      /* --- Delarna av samma moment, kedjade ------------------------------ */
      for (const [momentId, parts] of moments) {
        for (let index = 0; index < parts.length - 1; index++) {
          const a = pointOf(parts[index], "end");
          const b = pointOf(parts[index + 1], "start");

          if (!a || !b) continue;

          found.push({
            key: `${orderId}:${momentId}:${index}`,
            fromX: a.x,
            fromY: a.y,
            toX: b.x,
            toY: b.y,
            backwards: false,
          });
        }
      }

      /* --- Mellan momenten, i orderns egen ordning ----------------------- */
      const sequence = sequences[orderId] ?? [];

      for (let step = 0; step < sequence.length - 1; step++) {
        const from = moments.get(sequence[step]);
        const to = moments.get(sequence[step + 1]);

        if (!from?.length || !to?.length) continue;

        // Listorna är sorterade på starttid. Den sista är inte nödvändigtvis
        // den som slutar sist, eftersom rutor kan vara olika långa — därför
        // letas slutet upp och antas inte.
        const last = from.reduce((best, block) =>
          endMs(block, hoursFor, days, timeZone) >
          endMs(best, hoursFor, days, timeZone)
            ? block
            : best
        );

        const a = pointOf(last, "end");
        const b = pointOf(to[0], "start");

        if (!a || !b) continue;

        found.push({
          key: `${orderId}:steg:${step}`,
          fromX: a.x,
          fromY: a.y,
          toX: b.x,
          toY: b.y,
          backwards: b.time < a.time,
        });
      }
    }

    return found;

    /** Rutans kant som en punkt på tavlan, eller null utanför veckan. */
    function pointOf(block: BoardBlock, edge: "start" | "end") {
      const startsAt = new Date(block.startsAt);
      const dayIndex = dayIndexOf(startsAt, days);
      if (dayIndex === null) return null;

      const axis = windows.get(dayIndex);
      const base = dayOffset(dayIndex);
      const row = rows.get(block.laneId);

      if (!axis || base === null || row === undefined) return null;

      const time =
        edge === "start"
          ? startsAt.getTime()
          : endMs(block, hoursFor, days, timeZone);

      return {
        x: base + offsetPx(time, days[dayIndex], axis, pxPerMinute),
        y: row * ROW_HEIGHT + ROW_HEIGHT / 2,
        time,
      };
    }
  }, [
    dayOffset,
    days,
    hoursFor,
    lanes,
    placesFromUnplaced,
    pxPerMinute,
    sequences,
    shown,
    timeZone,
    windows,
  ]);


  return (
    <div
      className="space-y-3"
      onPointerMove={onPointerMove}
      onPointerUp={() => void onPointerUp()}
      onPointerCancel={() => {
        setDrag(null);
        origin.current = null;
        moved.current = false;
      }}
    >
      {error && <Alert>{error}</Alert>}

      {placesFromUnplaced && (
        <UnplacedStrip
          kind={kind}
          rows={unplaced}
          armed={armed}
          readOnly={readOnly}
          onPointerDownRow={beginNew}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-neutral-500">
          Vecka {weekNumber}
          {isCurrentWeek && (
            <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Pågår
            </span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {focusIndex !== null && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Föregående dag"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100"
              >
                ‹
              </button>
              <span
                className={`min-w-[8.5rem] text-center text-[13px] font-medium ${
                  focusIndex === todayIndex ? "text-tick-deep" : "text-neutral-900"
                }`}
              >
                {DAY_LONG[focusIndex]} {dayLabel(days[focusIndex], timeZone)}
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Nästa dag"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100"
              >
                ›
              </button>
            </div>
          )}

          {!isDay && (
            <button
              type="button"
              onClick={toggleWeekend}
              aria-pressed={showWeekend}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100"
            >
              {showWeekend ? "Dölj helg" : "Visa helg"}
              {!showWeekend && weekendBlocks > 0 && (
                <span
                  title={`${weekendBlocks} planerade i helgen`}
                  className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800"
                >
                  {weekendBlocks}
                </span>
              )}
            </button>
          )}

          <div role="group" aria-label="Visa" className="flex gap-1">
            {(
              [
                ["Vecka", false],
                ["Dag", true],
              ] as const
            ).map(([label, day]) => (
              <button
                key={label}
                type="button"
                aria-pressed={isDay === day}
                onClick={() =>
                  isDay === day
                    ? undefined
                    : show(day ? dayKeys[todayIndex ?? 0] : null)
                }
                className={`rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
                  isDay === day
                    ? "bg-fjord text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {lanes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-6 py-14 text-center">
          <p className="text-sm font-medium text-neutral-900">
            {isStaff ? "Inga aktiva anställda" : "Inga öppna stationer"}
          </p>
          {!isStaff && (
            <p className="mx-auto mt-1 max-w-md text-[13px] text-neutral-500">
              Lägg upp stationerna innan du planerar.
            </p>
          )}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-x-auto rounded-lg border border-neutral-200 bg-white"
        >
          <div className="inline-block min-w-full">
            {/* Dagrubrikerna.

                FÖRSTA DAGENS SKILJELINJE ÄR GENOMSKINLIG, här och i varje rad.
                Den låg bredvid stationskolumnens kant och blev en dubbel linje.
                Den finns kvar som bredd, så att måtten i lib/plan-geometry.ts
                gäller varje dag lika. */}
            <div className="flex border-b border-neutral-200 bg-neutral-50 [&>*:nth-child(2)]:border-l-transparent">
              <div
                style={{ width: STATION_COLUMN }}
                className="sticky left-0 z-20 shrink-0 border-r border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400"
              >
                {isStaff ? "Anställd" : "Station"}
              </div>

              {/* VARJE KOLUMN ÄR SKILJELINJEN PLUS INNEHÅLLET, och bredden
                  sätts till båda. Klockslagen räknas från innehållets kant,
                  precis som rutnätet under, se lib/plan-geometry.ts. */}
              {columns.map((column) => {
                const isToday = column.index === todayIndex;

                return (
                  <div
                    key={column.index}
                    style={{ width: column.width + DAY_BORDER }}
                    className="shrink-0 border-l-2 border-neutral-200 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => show(dayKeys[column.index])}
                      disabled={isDay}
                      className={`block max-w-full truncate px-2 text-left text-[13px] font-medium enabled:hover:underline ${
                        isToday ? "text-tick-deep" : "text-neutral-900"
                      }`}
                    >
                      {column.width > 160
                        ? DAY_LONG[column.index]
                        : DAY_SHORT[column.index]}{" "}
                      <span
                        className={`font-normal ${
                          isToday ? "text-tick-deep" : "text-neutral-400"
                        }`}
                      >
                        {dayLabel(days[column.index], timeZone)}
                      </span>
                    </button>
                    <Axis
                      axis={windows.get(column.index)}
                      pxPerMinute={pxPerMinute}
                    />
                  </div>
                );
              })}
            </div>

            {/* Raderna. Enda måttet träffytan räknas ur. */}
            <div ref={bodyRef} onPointerUp={onBodyPointerUp} className="relative">
              {/* PILARNA MELLAN EN ORDERS MOMENT, över rutorna men utan att ta
                  emot tryck. Ligger i ett eget lager och inte i cellerna,
                  eftersom en pil går mellan två rader och två dagar.

                  LAGRET LIGGER UNDER STATIONSKOLUMNEN (z-15 mot kolumnens
                  z-20), och det är inte en smaksak. Kolumnen är fruset fönster:
                  den står still medan dagarna rullar under den. En pil till en
                  ruta som rullat ut åt vänster ritades annars OVANPÅ kolumnen,
                  och såg ut som ett streck som kom ut ur stationsnamnet. Rutorna
                  ligger på z-10, så pilarna syns fortfarande över dem. */}
              {arrows.length > 0 && (
                <svg
                  className="pointer-events-none absolute left-0 top-0 z-[15]"
                  width={contentWidth}
                  height={lanes.length * ROW_HEIGHT}
                  aria-hidden="true"
                >
                  <defs>
                    <marker
                      id="plan-arrow"
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M0 0 L8 4 L0 8 z" fill="currentColor" />
                    </marker>
                  </defs>

                  {arrows.map((arrow) => (
                    <path
                      key={arrow.key}
                      d={arrowPath(arrow)}
                      fill="none"
                      strokeWidth={1.5}
                      markerEnd="url(#plan-arrow)"
                      className={
                        arrow.backwards ? "text-amber-600" : "text-skiffer"
                      }
                      stroke="currentColor"
                      strokeDasharray={arrow.backwards ? "4 3" : undefined}
                    />
                  ))}
                </svg>
              )}

              {lanes.map((lane) => {
                const takes =
                  lane.momentId === null || lane.momentId === seeking;
                const dim = seeking !== null && !takes;
                const target = seeking !== null && takes;

                return (
                  <div
                    key={lane.id}
                    className={`flex border-b border-neutral-100 last:border-b-0 [&>*:nth-child(2)]:border-l-transparent ${ROW_CLASS} ${
                      dim ? "opacity-40" : ""
                    }`}
                  >
                    <div
                      style={{ width: STATION_COLUMN }}
                      className={`sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-neutral-200 px-3 ${
                        target ? "bg-blue-50" : "bg-white"
                      }`}
                    >
                      <p className="truncate text-[13px] font-medium text-neutral-900">
                        {lane.name}
                      </p>
                      {lane.detail && (
                        <p className="truncate text-[11px] text-neutral-400">
                          {lane.detail}
                        </p>
                      )}
                      {isStaff && totals.has(lane.id) && (
                        <p className="truncate text-[11px] tabular-nums text-neutral-500">
                          Planerat{" "}
                          {formatDuration(totals.get(lane.id)!.plannedMinutes)}
                          {liveLoaded &&
                            ` · Stämplat ${formatDuration(
                              totals.get(lane.id)!.clockedMinutes
                            )}`}
                        </p>
                      )}
                    </div>

                    {columns.map((column) => {
                      const dayIndex = column.index;

                      return (
                      <DayCell
                        key={dayIndex}
                        laneName={lane.name}
                        hoursKnown={lane.hours !== null}
                        day={days[dayIndex]}
                        days={days}
                        dayIndex={dayIndex}
                        axis={windows.get(dayIndex)}
                        width={column.width}
                        pxPerMinute={pxPerMinute}
                        timeZone={timeZone}
                        hours={hoursFor(lane.id, dayIndex)}
                        blocks={shown.filter(
                          (block) =>
                            block.laneId === lane.id &&
                            dayIndexOf(new Date(block.startsAt), days) ===
                              dayIndex
                        )}
                        progress={progress}
                        now={now}
                        highlight={
                          dropSlot?.laneId === lane.id &&
                          dropSlot.dayIndex === dayIndex
                        }
                        draggedBlockId={draggedBlockId}
                        pickable={target && armed !== null}
                        readOnly={readOnly}
                        onBlockPointerDown={beginMove}
                        onResizeStart={beginResize}
                      />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Legend kind={kind} armed={armed} placing={placesFromUnplaced} />

      {/* SPÖKET SOM FÖLJER PEKAREN under en dragning från Oplacerat.
          Utan det ser en dragning ut som att ingenting händer, vilket var en
          stor del av varför den kändes trasig.

          Visas från första ögonblicket och inte först när pekaren hittat en
          giltig plats: ett spöke som blinkar fram och tillbaka är sämre än
          inget. Att platsen duger syns på färgen i stället. */}
      {drag?.kind === "new" && (
        <div
          className={`pointer-events-none fixed z-50 rounded-md px-2 py-1 text-[12px] font-semibold shadow-lg ${
            drag.slot
              ? "bg-tick-deep text-white"
              : "bg-neutral-700 text-white opacity-70"
          }`}
          style={{ left: drag.at.x + 14, top: drag.at.y + 14 }}
        >
          {drag.row.orderNumber} · {drag.row.momentName}
        </div>
      )}

      {editing && (
        <BlockDialog
          block={editing}
          end={endOf(editing, hoursFor, days, timeZone)}
          progress={progress[editing.id]}
          timeZone={timeZone}
          readOnly={readOnly}
          employees={employees}
          staffing={(staffing[editing.id] ?? []).map((pass) => ({
            ...pass,
            clockedMinutes: liveLoaded
              ? (staffingProgress[pass.id]?.clockedMinutes ?? 0)
              : undefined,
          }))}
          onStaff={(employeeId, startsAt, minutes) =>
            staff(editing, employeeId, startsAt, minutes)
          }
          onUnstaff={unstaff}
          onClose={() => setEditing(null)}
          onRemove={() => void remove(editing)}
          onSave={(minutes, note) => {
            const block = editing;
            setEditing(null);

            void (async () => {
              await resize(block, minutes);
              await saveNote(block, note);
            })();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Oplacerat                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Jobben som väntar på en plats, som en rad ÖVER tavlan.
 *
 * Låg som en panel till vänster och tog tvåhundrafemtio pixlar av veckans
 * bredd även när den stod tom. Veckan är det man är här för att se.
 *
 * Rullar i sidled när de blir många. Det är rätt håll: en lista som växer
 * nedåt trycker ned tavlan, och tavlan ska ligga still.
 */
function UnplacedStrip({
  kind,
  rows,
  armed,
  readOnly,
  onPointerDownRow,
}: {
  kind: LaneKind;
  rows: BoardUnplaced[];
  armed: BoardUnplaced | null;
  readOnly: boolean;
  onPointerDownRow: (
    event: ReactPointerEvent<HTMLElement>,
    row: BoardUnplaced
  ) => void;
}) {
  const plannable = rows.filter((row) => row.plannable);
  const blocked = rows.filter((row) => !row.plannable);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-neutral-900">Oplacerat</h2>

        {rows.length > 0 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800">
            {rows.length}
          </span>
        )}

        {armed && (
          <span className="ml-auto truncate text-[12px] font-medium text-tick-deep">
            Tryck på {kind === "staff" ? "en anställd" : "en station"} för att
            placera {armed.orderNumber}
          </span>
        )}
      </div>

      {/* HÖJDEN ÄR DEN SAMMA TOM SOM FULL. Raden krympte när sista brickan
          placerats, och hela tavlan under hoppade uppåt i samma ögonblick som
          man släppte. Att ytan man just arbetat i flyttar sig är det som får en
          vy att kännas opålitlig, även när allt den gjorde var rätt. */}
      {rows.length === 0 ? (
        <p className="flex h-[88px] items-center px-4 text-[13px] text-neutral-500">
          Allt beräknat arbete ligger på tavlan.
        </p>
      ) : (
        <div className="flex h-[88px] items-stretch gap-2 overflow-x-auto px-3 py-2">
          {plannable.map((row) => (
            <Chip
              key={`${row.orderId}:${row.momentId}`}
              kind={kind}
              row={row}
              armed={
                armed?.orderId === row.orderId &&
                armed?.momentId === row.momentId
              }
              readOnly={readOnly}
              onPointerDown={(event) => onPointerDownRow(event, row)}
            />
          ))}

          {blocked.map((row) => (
            <Chip
              key={`${row.orderId}:${row.momentId}`}
              kind={kind}
              row={row}
              armed={false}
              readOnly
              blocked
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  kind,
  row,
  armed,
  readOnly,
  blocked = false,
  onPointerDown,
}: {
  kind: LaneKind;
  row: BoardUnplaced;
  armed: boolean;
  readOnly: boolean;
  blocked?: boolean;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const over = row.remainingMinutes < 0;

  return (
    <div
      onPointerDown={onPointerDown}
      title={
        blocked
          ? kind === "staff"
            ? "Inga aktiva anställda"
            : `Ingen station kör ${row.momentName}`
          : `${row.orderNumber} · ${row.momentName}`
      }
      className={`w-44 shrink-0 rounded-md border px-2.5 py-2 ${
        armed
          ? "border-tick-deep bg-blue-50 ring-2 ring-tick-deep"
          : blocked
            ? "border-neutral-200 bg-neutral-50 opacity-60"
            : "border-neutral-200 bg-white hover:border-neutral-400"
      } ${
        readOnly || blocked
          ? ""
          : "cursor-grab touch-none select-none active:cursor-grabbing"
      }`}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-neutral-900">
          {row.orderNumber}
        </span>
        <span
          className={`shrink-0 text-[13px] tabular-nums ${
            over ? "text-amber-700" : "text-neutral-900"
          }`}
        >
          {row.budgetMinutes === null
            ? formatDuration(row.placedMinutes)
            : formatDuration(Math.abs(row.remainingMinutes))}
        </span>
      </p>

      <p className="truncate text-[11px] text-neutral-500">{row.momentName}</p>

      <p className="truncate text-[11px] text-neutral-400">
        {blocked
          ? kind === "staff"
            ? "Ingen anställd"
            : "Ingen station"
          : row.budgetMinutes === null
            ? "Ingen beräkning"
            : over
              ? "Över beräknat"
              : row.dueDate
                ? `Senast ${shortDate(row.dueDate)}`
                : (row.customerName ?? "")}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tavlans celler                                                              */
/* -------------------------------------------------------------------------- */

function DayCell({
  laneName,
  hoursKnown,
  day,
  days,
  dayIndex,
  axis,
  width,
  pxPerMinute,
  timeZone,
  hours,
  blocks,
  progress,
  now,
  highlight,
  draggedBlockId,
  pickable,
  readOnly,
  onBlockPointerDown,
  onResizeStart,
}: {
  laneName: string;
  /**
   * false för en rad utan arbetstider, som en anställd i fas 2. Dagen ritas
   * då vit, och bara pass som ligger i varandra varnas för: utan tider finns
   * ingen dag att överboka.
   */
  hoursKnown: boolean;
  day: Date;
  days: Date[];
  dayIndex: number;
  axis?: { startMinute: number; endMinute: number };
  width: number;
  pxPerMinute: number;
  timeZone: string;
  hours: StationHours | null;
  blocks: BoardBlock[];
  progress: Record<string, BlockProgress>;
  now: number | null;
  highlight: boolean;
  draggedBlockId: string | null;
  /** Ett valt jobb kan läggas här. Ger pekaren en annan form. */
  pickable: boolean;
  readOnly: boolean;
  onBlockPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    block: BoardBlock
  ) => void;
  onResizeStart: (
    event: ReactPointerEvent<HTMLElement>,
    block: BoardBlock
  ) => void;
}) {
  const load = stationDayLoad(
    hours,
    blocks.map((block) => ({
      startsAt: new Date(block.startsAt),
      minutes: block.minutes,
      hours,
    })),
    timeZone
  );

  const over =
    load.overlaps ||
    (hoursKnown && load.plannedMinutes > load.capacityMinutes);

  return (
    <div
      style={{ width: width + DAY_BORDER }}
      className={`relative shrink-0 border-l-2 border-neutral-200 ${
        highlight ? "bg-blue-100" : ""
      } ${pickable ? "cursor-copy" : ""}`}
    >
      <div className="relative h-full">
        {/* Stängd tid och raster i grått, det öppna vitt. En rad utan tider
            har ingen stängd tid. */}
        {hoursKnown && <div className={`absolute inset-0 ${CLOSED_CLASS}`} />}

        {axis &&
          hoursKnown &&
          workingWindows(hours, day, timeZone).map((span, index) => (
            <div
              key={index}
              className="absolute inset-y-0 bg-white"
              style={{
                left: offsetPx(span.from, day, axis, pxPerMinute),
                width: ((span.to - span.from) / MS_PER_MINUTE) * pxPerMinute,
              }}
            />
          ))}

        {/* Timlinjer, så att ytan läses som en tidslinje och inte som en ruta. */}
        {axis &&
          hourLines(axis).map((minute) => (
            <div
              key={minute}
              className="absolute inset-y-0 w-px bg-neutral-200/70"
              style={{ left: (minute - axis.startMinute) * pxPerMinute }}
            />
          ))}

        {now !== null && axis && dayIndexOf(new Date(now), days) === dayIndex && (
          <div
            className="absolute inset-y-0 z-10 w-0.5 bg-tick-deep"
            style={{ left: offsetPx(now, day, axis, pxPerMinute) }}
          />
        )}

        {axis &&
          blocks.map((block) => (
            <BlockBox
              key={block.id}
              block={block}
              hours={hours}
              day={day}
              axis={axis}
              pxPerMinute={pxPerMinute}
              timeZone={timeZone}
              progress={progress[block.id]}
              dragging={draggedBlockId === block.id}
              readOnly={readOnly}
              onPointerDown={(event) => onBlockPointerDown(event, block)}
              onResizeStart={(event) => onResizeStart(event, block)}
            />
          ))}
      </div>

      {over && (
        <span
          className="absolute right-1 top-1 z-20 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800"
          title={
            load.overlaps
              ? hoursKnown
                ? "Två jobb ligger i varandra"
                : `${laneName} har två pass samtidigt`
              : `${formatDuration(
                  load.plannedMinutes - load.capacityMinutes
                )} mer än ${laneName} hinner`
          }
        >
          {load.overlaps ? "krock" : "över"}
        </span>
      )}
    </div>
  );
}

function BlockBox({
  block,
  hours,
  day,
  axis,
  pxPerMinute,
  timeZone,
  progress,
  dragging,
  readOnly,
  onPointerDown,
  onResizeStart,
}: {
  block: BoardBlock;
  hours: StationHours | null;
  day: Date;
  axis: { startMinute: number; endMinute: number };
  pxPerMinute: number;
  timeZone: string;
  progress?: BlockProgress;
  dragging: boolean;
  readOnly: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const startsAt = new Date(block.startsAt);
  const end = blockEnd(hours, startsAt, block.minutes, timeZone);

  const left = offsetPx(startsAt.getTime(), day, axis, pxPerMinute);
  const width = Math.max(
    8,
    ((end.getTime() - startsAt.getTime()) / MS_PER_MINUTE) * pxPerMinute
  );

  const done = progress
    ? Math.min(100, (progress.clockedMinutes / Math.max(block.minutes, 1)) * 100)
    : 0;

  const label = [
    `${block.orderNumber} · ${block.momentName}`,
    block.customerName,
    `Planerat ${formatDuration(block.minutes)}`,
    progress ? `Stämplat ${formatDuration(progress.clockedMinutes)}` : null,
    progress?.running ? `Pågår: ${progress.people.join(", ")}` : null,
    block.note,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      onPointerDown={onPointerDown}
      title={label}
      style={{ left, width }}
      className={`absolute inset-y-1 z-10 overflow-hidden rounded-md bg-fjord text-white ring-1 ring-inset ${
        progress?.running ? "ring-2 ring-tick" : "ring-black/10"
      } ${dragging ? "opacity-60" : ""} ${
        readOnly
          ? ""
          : "cursor-grab touch-none select-none active:cursor-grabbing"
      }`}
    >
      {progress && (
        <div
          className="absolute inset-y-0 left-0 bg-tick-deep"
          style={{ width: `${done}%` }}
        />
      )}

      {width > 30 && (
        <div className="relative px-1.5 py-1">
          <p className="truncate text-[12px] font-semibold leading-tight">
            {block.orderNumber}
          </p>
          {width > 80 && (
            <p className="truncate text-[11px] leading-tight opacity-80">
              {block.momentName}
            </p>
          )}
          {width > 80 && (
            <p className="truncate text-[11px] leading-tight tabular-nums opacity-70">
              {formatDuration(block.minutes)}
              {progress
                ? ` · stämplat ${formatDuration(progress.clockedMinutes)}`
                : ""}
            </p>
          )}
        </div>
      )}

      {!readOnly && (
        <div
          onPointerDown={onResizeStart}
          className="absolute inset-y-0 right-0 z-10 w-2.5 cursor-ew-resize touch-none bg-white/25 hover:bg-white/40"
        />
      )}
    </div>
  );
}

/**
 * Klockslagen under dagrubriken.
 *
 * Utan inre marginal, och varje siffra MITT PÅ SIN LINJE. Rubriken hade en
 * marginal som rutnätet under inte hade, och "09" stod till höger om
 * 09-linjen. Bara klockslag som ryms inom dagen tas med, se axisLabels.
 */
function Axis({
  axis,
  pxPerMinute,
}: {
  axis?: DayAxis;
  pxPerMinute: number;
}) {
  if (!axis) return null;

  return (
    <div className="relative mt-0.5 h-3">
      {axisLabels(axis, pxPerMinute).map((label) => (
        <span
          key={label.minute}
          className="absolute top-0 -translate-x-1/2 text-[10px] tabular-nums text-neutral-400"
          style={{ left: label.x }}
        >
          {String(Math.floor(label.minute / 60)).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}

function Legend({
  kind,
  armed,
  placing,
}: {
  kind: LaneKind;
  armed: BoardUnplaced | null;
  /** Om jobb placeras från Oplacerat. Annars finns ingen instruktion att ge. */
  placing: boolean;
}) {
  const target = kind === "staff" ? "en anställd" : "en station";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm bg-fjord" />
        Planerat
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm bg-tick-deep" />
        Stämplat
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`h-2.5 w-4 rounded-sm ${CLOSED_CLASS}`} />
        Stängt eller rast
      </span>

      {placing && (
        <span className="ml-auto text-neutral-400">
          {armed
            ? `Tryck på ${target}, eller Esc för att avbryta`
            : `Tryck på ett jobb i Oplacerat, sedan på ${target}`}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rutan som öppnas vid ett tryck                                              */
/* -------------------------------------------------------------------------- */

function BlockDialog({
  block,
  end,
  progress,
  timeZone,
  readOnly,
  employees,
  staffing,
  onStaff,
  onUnstaff,
  onClose,
  onRemove,
  onSave,
}: {
  block: BoardBlock;
  end: Date;
  progress?: BlockProgress;
  timeZone: string;
  readOnly: boolean;
  /** Utelämnat när rutan inte är en stationsruta. Då visas ingen bemanning. */
  employees?: BoardEmployee[];
  staffing: BoardStaffing[];
  onStaff: (
    employeeId: string,
    startsAt: Date,
    minutes: number
  ) => Promise<string | null>;
  onUnstaff: (id: string) => Promise<string | null>;
  onClose: () => void;
  onRemove: () => void;
  onSave: (minutes: number, note: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hours, setHours] = useState(() => formatDuration(block.minutes));
  const [note, setNote] = useState(block.note ?? "");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className={`w-[min(28rem,calc(100vw-2rem))] ${dialogSurface}`}
    >
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-neutral-900">
          {block.orderNumber} · {block.momentName}
        </h2>
        <p className="mt-0.5 text-[13px] text-neutral-500">
          {clockText(new Date(block.startsAt), timeZone)} till{" "}
          {clockText(end, timeZone)}
          {block.customerName ? ` · ${block.customerName}` : ""}
          {block.context ? ` · ${block.context}` : ""}
        </p>
      </div>

      <div className="space-y-4 px-5 py-5">
        {progress && (
          <p className="text-[13px] text-neutral-700">
            Stämplat {formatDuration(progress.clockedMinutes)} av{" "}
            {formatDuration(block.minutes)}
            {progress.running && (
              <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Pågår · {progress.people.join(", ")}
              </span>
            )}
          </p>
        )}

        <Field label="Planerad tid" hint="Timmar, t.ex. 4,5">
          <Input
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            disabled={readOnly}
            autoFocus
          />
        </Field>

        <Field label="Anteckning">
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={readOnly}
          />
        </Field>

        {employees && (
          <Staffing
            block={block}
            timeZone={timeZone}
            readOnly={readOnly}
            employees={employees}
            staffing={staffing}
            onStaff={onStaff}
            onUnstaff={onUnstaff}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
        <Button
          type="button"
          tone="danger"
          onClick={() => {
            dialog.current?.close();
            onRemove();
          }}
          disabled={readOnly}
        >
          Ta bort
        </Button>

        <div className="flex gap-2">
          <Button
            type="button"
            tone="secondary"
            onClick={() => dialog.current?.close()}
          >
            Avbryt
          </Button>
          <Button
            type="button"
            onClick={() => {
              const minutes = parseHourText(hours);
              if (minutes === null) return;
              dialog.current?.close();
              onSave(minutes, note);
            }}
            disabled={readOnly}
          >
            Spara
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * BEMANNINGEN AV EN STATIONSRUTA.
 *
 * Vem som står vid maskinen, och när. Start och längd föreslås ur rutan men
 * går att ändra: en CNC som kör sex timmar obemannad behöver en timmes
 * ställtid, inte sex timmars operatör. Passen räknas inte mot orderns
 * beräkning, se lib/planning-modes.ts.
 */
function Staffing({
  block,
  timeZone,
  readOnly,
  employees,
  staffing,
  onStaff,
  onUnstaff,
}: {
  block: BoardBlock;
  timeZone: string;
  readOnly: boolean;
  employees: BoardEmployee[];
  staffing: BoardStaffing[];
  onStaff: (
    employeeId: string,
    startsAt: Date,
    minutes: number
  ) => Promise<string | null>;
  onUnstaff: (id: string) => Promise<string | null>;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [start, setStart] = useState(() =>
    clockText(new Date(block.startsAt), timeZone)
  );
  const [hours, setHours] = useState(() => formatDuration(block.minutes));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const minutes = parseHourText(hours);
    const startsAt = parseClockOnDay(start, new Date(block.startsAt), timeZone);

    if (!employeeId) return setError("Välj en anställd.");
    if (startsAt === null) return setError("Ange starttid, t.ex. 07:00.");
    if (minutes === null) return setError("Ange planerad tid, t.ex. 1,5.");

    setBusy(true);
    const failed = await onStaff(employeeId, startsAt, minutes);
    setBusy(false);

    setError(failed);
    if (!failed) setEmployeeId("");
  }

  async function remove(id: string) {
    setBusy(true);
    setError(await onUnstaff(id));
    setBusy(false);
  }

  return (
    <div className="space-y-3 border-t border-neutral-200 pt-4">
      <h3 className="text-[13px] font-semibold text-neutral-900">Bemanning</h3>

      {error && <Alert>{error}</Alert>}

      {staffing.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200">
          {staffing.map((pass) => (
            <li
              key={pass.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]"
            >
              <span className="min-w-0">
                <span className="block truncate text-neutral-900">
                  {pass.employeeName}
                </span>
                {(pass.outsideHours || pass.overlaps) && (
                  <span className="block text-[12px] text-amber-700">
                    {[
                      pass.outsideHours ? "Utanför arbetstid" : null,
                      pass.overlaps ? "Dubbelbokad" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3 tabular-nums text-neutral-500">
                {clockText(new Date(pass.startsAt), timeZone)} ·{" "}
                {formatDuration(pass.minutes)}
                {pass.clockedMinutes !== undefined &&
                  ` · stämplat ${formatDuration(pass.clockedMinutes)}`}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => void remove(pass.id)}
                    disabled={busy}
                    className="text-[12px] font-medium text-red-700 hover:underline"
                  >
                    Ta bort
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="grid gap-3 sm:grid-cols-[1fr_5.5rem_5.5rem_auto] sm:items-end">
          <Field label="Anställd">
            <Select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              <option value="">Välj…</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start">
            <Input value={start} onChange={(event) => setStart(event.target.value)} />
          </Field>
          <Field label="Tid">
            <Input value={hours} onChange={(event) => setHours(event.target.value)} />
          </Field>
          <Button
            type="button"
            tone="secondary"
            onClick={() => void submit()}
            disabled={busy}
          >
            Bemanna
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Räknehjälp                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Pilens form: ut ur rutan, över, och in i nästa.
 *
 * En kubisk kurva och inte en rak linje. Två rutor på olika rader och olika
 * dagar ger en diagonal som skär genom allt den passerar; en kurva som går ut
 * vågrätt och kommer in vågrätt läses som ett flöde i stället.
 *
 * Kontrollpunkterna ligger halvvägs i x-led, med ett golv så att en pil mellan
 * två rutor som nästan möts ändå böjer av synligt.
 */
function arrowPath(arrow: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}): string {
  const reach = Math.max(24, Math.abs(arrow.toX - arrow.fromX) / 2);

  return [
    `M ${arrow.fromX} ${arrow.fromY}`,
    `C ${arrow.fromX + reach} ${arrow.fromY}`,
    `${arrow.toX - reach} ${arrow.toY}`,
    `${arrow.toX} ${arrow.toY}`,
  ].join(" ");
}

/** Rutans slut som millisekunder. Används av pilarna. */
function endMs(
  block: BoardBlock,
  hoursFor: (laneId: string, dayIndex: number) => StationHours | null,
  days: Date[],
  timeZone: string
): number {
  return endOf(block, hoursFor, days, timeZone).getTime();
}

/** Rutans slut på väggen, givet radernas tider. */
function endOf(
  block: BoardBlock,
  hoursFor: (laneId: string, dayIndex: number) => StationHours | null,
  days: Date[],
  timeZone: string
): Date {
  const startsAt = new Date(block.startsAt);
  const index = dayIndexOf(startsAt, days);
  const hours = index === null ? null : hoursFor(block.laneId, index);

  return blockEnd(hours, startsAt, block.minutes, timeZone);
}

/** Veckans sju dygnsbörjan, räknade i företagets tidszon. */
function buildDays(monday: Date, timeZone: string): Date[] {
  const days: Date[] = [];

  for (let index = 0; index < 7; index++) {
    // Går via klockslaget på väggen och inte via millisekunder: dygnet då
    // klockan ställs om är inte 24 timmar, och den som lägger till 86 400 000
    // sju gånger landar fel två gånger om året.
    const noon = new Date(monday.getTime() + index * 86_400_000 + 43_200_000);
    days.push(startOfWallDay(noon, timeZone));
  }

  return days;
}

/** Dygnets början på väggen. */
function startOfWallDay(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const intoDay =
    value("hour") * 3_600_000 +
    value("minute") * 60_000 +
    value("second") * 1000;

  return new Date(instant.getTime() - intoDay);
}

/**
 * Vilken av veckans dagar en tidpunkt tillhör, eller null utanför veckan.
 *
 * Gränsen är NÄSTA DAGS början och inte ett antal timmar. Dygnet då klockan
 * ställs om är 23 eller 25 timmar långt, och ett fast tal hade lagt söndagen
 * till lördagen två gånger om året.
 */
function dayIndexOf(instant: Date, days: Date[]): number | null {
  const time = instant.getTime();

  for (let index = 0; index < days.length; index++) {
    const start = days[index].getTime();

    const end =
      index + 1 < days.length
        ? days[index + 1].getTime()
        : start + 25 * 3_600_000;

    if (time >= start && time < end) return index;
  }

  return null;
}

/** Pixlar från kolumnens vänsterkant för en tidpunkt. */
function offsetPx(
  instant: number,
  day: Date,
  axis: { startMinute: number },
  pxPerMinute: number
): number {
  const minute = (instant - day.getTime()) / MS_PER_MINUTE;
  return (minute - axis.startMinute) * pxPerMinute;
}

function dayLabel(day: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    day: "numeric",
    month: "numeric",
  }).format(day);
}

function clockText(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function toDateParam(day: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(day);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * "4:30" eller "4,5" till minuter.
 *
 * Tar båda formerna, av samma skäl som orderns beräkningsfält gör det:
 * systemet visar decimaltimmar, och den som har "4:30" på ett papper ska inte
 * behöva räkna om det för att skriva in samma tid.
 */
function parseHourText(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const colon = text.match(/^(\d+):(\d{1,2})$/);

  if (colon) {
    const minutes = Number(colon[2]);
    if (minutes > 59) return null;

    const total = Number(colon[1]) * 60 + minutes;
    return total > 0 ? snap(total) : null;
  }

  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;

  return snap(Math.round(value * 60));
}

/**
 * "07:00" som en tidpunkt samma dag på väggen som `day`.
 *
 * Bara kolon, eftersom det är ett klockslag och inte en längd (CLAUDE.md
 * § 7.1 punkt 8). "7" godtas som 07:00, som de flesta skriver det.
 */
function parseClockOnDay(
  raw: string,
  day: Date,
  timeZone: string
): Date | null {
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour > 23 || minute > 59) return null;

  const wall = wallTimeIn(day, timeZone);
  return instantFromWallTime({ ...wall, hour, minute }, timeZone);
}

/** -1 från indexOf som null. */
function indexOrNull(index: number): number | null {
  return index < 0 ? null : index;
}
