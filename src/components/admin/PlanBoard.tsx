"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
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
import type { BlockProgress } from "@/lib/plan-live";
import { formatDuration } from "@/lib/format";
import {
  Alert,
  Button,
  Field,
  Input,
  Textarea,
  dialogSurface,
} from "@/components/ui";
import {
  moveBlockAction,
  noteBlockAction,
  placeBlockAction,
  removeBlockAction,
  resizeBlockAction,
} from "@/app/admin/(panel)/planering/actions";

/**
 * TAVLAN.
 *
 * En rad per station, dagarna åt höger, och rutor som hämtar sin tid ur
 * orderns beräkning.
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
 * ── OPLACERAT LIGGER ÖVER, INTE BREDVID ──────────────────────────────────
 *
 * Som en rad över tavlan. Panelen vid sidan tog tvåhundrafemtio pixlar av
 * veckans bredd även när den stod tom, och veckan är det man är här för.
 */

/* -------------------------------------------------------------------------- */
/* Formen                                                                      */
/* -------------------------------------------------------------------------- */

export interface BoardStation {
  id: string;
  name: string;
  momentId: string;
  momentName: string;
  hours: StationHours[];
}

export interface BoardBlock {
  id: string;
  stationId: string;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  momentId: string;
  momentName: string;
  startsAt: string;
  minutes: number;
  note: string | null;
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

/**
 * Zoomstegen är MULTIPLIKATORER av "hela veckan syns", inte pixlar per minut.
 *
 * Ett fast tal gav en vecka dubbelt så bred som fönstret, och tavlan öppnade
 * på måndag förmiddag med resten utanför kanten.
 */
const ZOOM = [1, 1.75, 3];

/** Stationskolumnens bredd. Används både för att rita och för att räkna. */
const STATION_COLUMN = 160;

/** Radhöjden. MÅSTE stämma med klassen nedan — träffytan räknar med den. */
const ROW_HEIGHT = 72;
const ROW_CLASS = "h-[72px]";

/** Linjen mellan två dagar. Räknas med i träffytan. */
const DAY_BORDER = 2;

/**
 * Minsta läsbara skala.
 *
 * Under det blir en timme smalare än ett ordernummer, och då är en
 * rullningslist bättre än rutor som inte går att skilja åt.
 */
const MIN_PX_PER_MINUTE = 0.25;

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

/* -------------------------------------------------------------------------- */
/* Dragningens tillstånd                                                       */
/* -------------------------------------------------------------------------- */

interface Slot {
  stationId: string;
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
  stations,
  blocks: initialBlocks,
  unplaced: initialUnplaced,
  monday,
  weekNumber,
  timeZone,
  isCurrentWeek,
  sequences,
  readOnly,
}: {
  stations: BoardStation[];
  blocks: BoardBlock[];
  unplaced: BoardUnplaced[];
  /** Måndagens dygnsbörjan, som ISO. */
  monday: string;
  weekNumber: number;
  timeZone: string;
  isCurrentWeek: boolean;
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

  const [blocks, setBlocks] = useState(initialBlocks);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [armed, setArmed] = useState<BoardUnplaced | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);
  const [progress, setProgress] = useState<Record<string, BlockProgress>>({});
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

  /* --- Utfallet ---------------------------------------------------------- */

  const syncProgress = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/plan/live?v=${toDateParam(mondayStart, timeZone)}`,
        { cache: "no-store" }
      );

      if (!response.ok) return;

      const data = (await response.json()) as {
        now: string;
        progress: Record<string, BlockProgress>;
      };

      setProgress(data.progress);
      setNow(new Date(data.now).getTime());
    } catch {
      // Nätet glappade. Behåll det vi vet i stället för att tömma vyn.
    }
  }, [mondayStart, timeZone]);

  useEffect(() => {
    // INGEN POLLNING I EN VECKA SOM INTE PÅGÅR. I en vecka som varit eller
    // inte börjat finns ingenting levande att hämta.
    if (!isCurrentWeek) {
      setProgress({});
      setNow(null);
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
  }, [isCurrentWeek, syncProgress]);

  /* --- Måtten ------------------------------------------------------------ */

  const hoursFor = useCallback(
    (stationId: string, dayIndex: number): StationHours | null => {
      const station = stations.find((item) => item.id === stationId);
      if (!station) return null;

      return station.hours.find((day) => day.weekday === dayIndex + 1) ?? null;
    },
    [stations]
  );

  /** Vilka dagar som ritas. Helg visas när någon station går eller något ligger där. */
  const visibleDays = useMemo(() => {
    const shown: number[] = [];

    for (let index = 0; index < 7; index++) {
      const weekend = index >= 5;

      const open = stations.some((station) =>
        station.hours.some((day) => day.weekday === index + 1)
      );

      const used = blocks.some(
        (block) => dayIndexOf(new Date(block.startsAt), days) === index
      );

      if (!weekend || open || used) shown.push(index);
    }

    return shown;
  }, [blocks, days, stations]);

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
    const result = new Map<number, { startMinute: number; endMinute: number }>();

    for (const index of visibleDays) {
      const spans = initialBlocks
        .filter((block) => dayIndexOf(new Date(block.startsAt), days) === index)
        .map((block) => ({
          startsAt: new Date(block.startsAt),
          minutes: block.minutes,
          hours: hoursFor(block.stationId, index),
        }));

      const hours = stations.map((station) => hoursFor(station.id, index));

      result.set(index, dayWindow(hours, spans, days[index], timeZone));
    }

    return result;
  }, [days, hoursFor, initialBlocks, stations, timeZone, visibleDays]);

  /**
   * Skalan: pixlar per minut.
   *
   * Steg ett lägger hela veckan i den bredd som finns. Måtten är kända först
   * när dagfönstren räknats, eftersom en fredag som slutar 13:00 är smalare
   * än en måndag som slutar 16:00.
   */
  const pxPerMinute = useMemo(() => {
    const minutes = visibleDays.reduce((total, index) => {
      const axis = windows.get(index);
      return total + (axis ? axis.endMinute - axis.startMinute : 0);
    }, 0);

    if (boardWidth === 0 || minutes === 0) return 0.5 * ZOOM[zoom];

    const usable =
      boardWidth - STATION_COLUMN - visibleDays.length * DAY_BORDER;

    return Math.max(MIN_PX_PER_MINUTE, usable / minutes) * ZOOM[zoom];
  }, [boardWidth, visibleDays, windows, zoom]);

  /**
   * En dags bredd i HELA pixlar.
   *
   * Avrundningen är inte kosmetik. Med bruten bredd hamnar kolumnlinjen,
   * timlinjerna och rutornas kanter på var sin sida om samma halva pixel, och
   * webbläsaren väljer olika håll beroende på var i kolumnen de ligger. Det
   * syns som att saker byter storlek med en pixel när något annat ändras, och
   * det är precis den sortens vaghet som får en vy att kännas opålitlig.
   *
   * Träffytan använder samma funktion, så det pekaren pekar på är det som
   * ritats.
   */
  const widthOf = useCallback(
    (dayIndex: number) => {
      const axis = windows.get(dayIndex);
      if (!axis) return 0;
      return Math.round((axis.endMinute - axis.startMinute) * pxPerMinute);
    },
    [pxPerMinute, windows]
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
      if (row < 0 || row >= stations.length) return null;

      let x = clientX - rect.left - STATION_COLUMN;
      if (x < 0) return null;

      for (const dayIndex of visibleDays) {
        const width = widthOf(dayIndex);

        if (x <= width) {
          const axis = windows.get(dayIndex);
          if (!axis) return null;

          const minute = axis.startMinute + x / Math.max(pxPerMinute, 0.01);
          const snapped = Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;

          return {
            stationId: stations[row].id,
            dayIndex,
            startsAt: new Date(
              days[dayIndex].getTime() + Math.max(0, snapped) * MS_PER_MINUTE
            ),
          };
        }

        x -= width + DAY_BORDER;
      }

      return null;
    },
    [days, pxPerMinute, stations, visibleDays, widthOf, windows]
  );

  /** Pixlar från tavlans vänsterkant till en dags början. */
  const dayOffset = useCallback(
    (dayIndex: number) => {
      let x = STATION_COLUMN;

      for (const index of visibleDays) {
        if (index === dayIndex) return x;
        x += widthOf(index) + DAY_BORDER;
      }

      return null;
    },
    [visibleDays, widthOf]
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
      const station = stations.find((item) => item.id === slot.stationId);
      if (!station) return;

      if (station.momentId !== row.momentId) {
        setError(`${station.name} kör inte ${row.momentName}.`);
        return;
      }

      const hours = hoursFor(station.id, slot.dayIndex);
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
        stationId: station.id,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        customerName: row.customerName,
        momentId: row.momentId,
        momentName: row.momentName,
        startsAt: slot.startsAt.toISOString(),
        minutes,
        note: null,
      };

      setArmed(null);

      await run(
        blocks,
        () => setBlocks((current) => [...current, draft]),
        () => {
          const data = new FormData();
          data.set("orderId", row.orderId);
          data.set("momentId", row.momentId);
          data.set("stationId", station.id);
          data.set("startsAt", slot.startsAt.toISOString());
          data.set("minutes", String(minutes));
          return placeBlockAction({}, data);
        }
      );
    },
    [blocks, hoursFor, run, stations, timeZone]
  );

  const moveTo = useCallback(
    async (block: BoardBlock, slot: Slot) => {
      const station = stations.find((item) => item.id === slot.stationId);
      if (!station) return;

      if (station.momentId !== block.momentId) {
        setError(`${station.name} kör inte ${block.momentName}.`);
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
                    stationId: station.id,
                    startsAt: slot.startsAt.toISOString(),
                  }
                : item
            )
          ),
        () => {
          const data = new FormData();
          data.set("blockId", block.id);
          data.set("stationId", station.id);
          data.set("startsAt", slot.startsAt.toISOString());
          return moveBlockAction({}, data);
        }
      );
    },
    [blocks, run, stations]
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
          return resizeBlockAction({}, data);
        }
      );
    },
    [blocks, run]
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
          return noteBlockAction({}, data);
        }
      );
    },
    [blocks, run]
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
          return removeBlockAction({}, data);
        }
      );
    },
    [blocks, run]
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
      const { stationId, startsAt } = drag.slot;
      const moving = drag.block.id;

      return blocks.map((block) =>
        block.id === moving
          ? { ...block, stationId, startsAt: startsAt.toISOString() }
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
  const contentWidth = useMemo(
    () =>
      visibleDays.reduce(
        (total, index) => total + widthOf(index) + DAY_BORDER,
        STATION_COLUMN
      ),
    [visibleDays, widthOf]
  );

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
    const rows = new Map(stations.map((station, index) => [station.id, index]));

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
      const row = rows.get(block.stationId);

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
    pxPerMinute,
    sequences,
    shown,
    stations,
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

      <UnplacedStrip
        rows={unplaced}
        armed={armed}
        readOnly={readOnly}
        onPointerDownRow={beginNew}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-neutral-500">
          Vecka {weekNumber}
          {isCurrentWeek && (
            <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Pågår
            </span>
          )}
        </p>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            tone="ghost"
            onClick={() => setZoom((value) => Math.max(0, value - 1))}
            disabled={zoom === 0}
            aria-label="Zooma ut"
          >
            −
          </Button>
          <Button
            type="button"
            tone="ghost"
            onClick={() =>
              setZoom((value) => Math.min(ZOOM.length - 1, value + 1))
            }
            disabled={zoom === ZOOM.length - 1}
            aria-label="Zooma in"
          >
            +
          </Button>
        </div>
      </div>

      {stations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/50 px-6 py-14 text-center">
          <p className="text-sm font-medium text-neutral-900">
            Inga öppna stationer
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-neutral-500">
            Lägg upp stationerna innan du planerar.
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-x-auto rounded-lg border border-neutral-200 bg-white"
        >
          <div className="inline-block min-w-full">
            {/* Dagrubrikerna */}
            <div className="flex border-b border-neutral-200 bg-neutral-50">
              <div
                style={{ width: STATION_COLUMN }}
                className="sticky left-0 z-20 shrink-0 border-r border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400"
              >
                Station
              </div>

              {visibleDays.map((index) => (
                <div
                  key={index}
                  style={{ width: widthOf(index) }}
                  className="shrink-0 border-l-2 border-neutral-200 px-2 py-2 first:border-l-0"
                >
                  <p className="truncate text-[13px] font-medium text-neutral-900">
                    {widthOf(index) > 160 ? DAY_LONG[index] : DAY_SHORT[index]}{" "}
                    <span className="font-normal text-neutral-400">
                      {dayLabel(days[index], timeZone)}
                    </span>
                  </p>
                  <Axis axis={windows.get(index)} pxPerMinute={pxPerMinute} />
                </div>
              ))}
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
                  height={stations.length * ROW_HEIGHT}
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

              {stations.map((station) => {
                const dim = seeking !== null && seeking !== station.momentId;
                const target = seeking !== null && seeking === station.momentId;

                return (
                  <div
                    key={station.id}
                    className={`flex border-b border-neutral-100 last:border-b-0 ${ROW_CLASS} ${
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
                        {station.name}
                      </p>
                      <p className="truncate text-[11px] text-neutral-400">
                        {station.momentName}
                      </p>
                    </div>

                    {visibleDays.map((dayIndex) => (
                      <DayCell
                        key={dayIndex}
                        stationName={station.name}
                        day={days[dayIndex]}
                        days={days}
                        dayIndex={dayIndex}
                        axis={windows.get(dayIndex)}
                        width={widthOf(dayIndex)}
                        pxPerMinute={pxPerMinute}
                        timeZone={timeZone}
                        hours={hoursFor(station.id, dayIndex)}
                        blocks={shown.filter(
                          (block) =>
                            block.stationId === station.id &&
                            dayIndexOf(new Date(block.startsAt), days) ===
                              dayIndex
                        )}
                        progress={progress}
                        now={now}
                        highlight={
                          dropSlot?.stationId === station.id &&
                          dropSlot.dayIndex === dayIndex
                        }
                        draggedBlockId={draggedBlockId}
                        pickable={target && armed !== null}
                        readOnly={readOnly}
                        onBlockPointerDown={beginMove}
                        onResizeStart={beginResize}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Legend armed={armed} />

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
  rows,
  armed,
  readOnly,
  onPointerDownRow,
}: {
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
            Tryck på en station för att placera {armed.orderNumber}
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
  row,
  armed,
  readOnly,
  blocked = false,
  onPointerDown,
}: {
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
          ? `Ingen station kör ${row.momentName}`
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
          ? "Ingen station"
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
  stationName,
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
  stationName: string;
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

  const over = load.overlaps || load.plannedMinutes > load.capacityMinutes;

  return (
    <div
      style={{ width }}
      className={`relative shrink-0 border-l-2 border-neutral-200 first:border-l-0 ${
        highlight ? "bg-blue-100" : ""
      } ${pickable ? "cursor-copy" : ""}`}
    >
      <div className="relative h-full">
        {/* Stängd tid och raster i grått, det öppna vitt. */}
        <div className="absolute inset-0 bg-neutral-100/70" />

        {axis &&
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
          hourTicks(axis).map((minute) => (
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
              ? "Två jobb ligger i varandra"
              : `${formatDuration(
                  load.plannedMinutes - load.capacityMinutes
                )} mer än ${stationName} hinner`
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

/** Klockslagen under dagrubriken. */
function Axis({
  axis,
  pxPerMinute,
}: {
  axis?: { startMinute: number; endMinute: number };
  pxPerMinute: number;
}) {
  if (!axis) return null;

  return (
    <div className="relative mt-0.5 h-3">
      {hourTicks(axis, pxPerMinute).map((minute) => (
        <span
          key={minute}
          className="absolute top-0 text-[10px] tabular-nums text-neutral-400"
          style={{ left: (minute - axis.startMinute) * pxPerMinute }}
        >
          {String(Math.floor(minute / 60)).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}

/**
 * Klockslagen som får plats.
 *
 * Utan pixelmåttet ges varje hel timme, vilket är rätt för linjerna i
 * bakgrunden. Med måttet glesas de ut så att etiketterna inte skriver över
 * varandra.
 */
function hourTicks(
  axis: { startMinute: number; endMinute: number },
  pxPerMinute?: number
): number[] {
  const step =
    pxPerMinute === undefined
      ? 60
      : pxPerMinute < 0.35
        ? 180
        : pxPerMinute < 0.7
          ? 120
          : 60;

  const ticks: number[] = [];

  for (
    let minute = Math.ceil(axis.startMinute / step) * step;
    minute < axis.endMinute;
    minute += step
  ) {
    ticks.push(minute);
  }

  return ticks;
}

function Legend({ armed }: { armed: BoardUnplaced | null }) {
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
        <span className="h-2.5 w-4 rounded-sm bg-neutral-200" />
        Stängt eller rast
      </span>

      <span className="ml-auto text-neutral-400">
        {armed
          ? "Tryck på en station, eller Esc för att avbryta"
          : "Tryck på ett jobb i Oplacerat, sedan på en station"}
      </span>
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
  onClose,
  onRemove,
  onSave,
}: {
  block: BoardBlock;
  end: Date;
  progress?: BlockProgress;
  timeZone: string;
  readOnly: boolean;
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

        <Field label="Planerad tid" hint="Tim:min, t.ex. 4:30">
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
  hoursFor: (stationId: string, dayIndex: number) => StationHours | null,
  days: Date[],
  timeZone: string
): number {
  return endOf(block, hoursFor, days, timeZone).getTime();
}

/** Rutans slut på väggen, givet stationernas tider. */
function endOf(
  block: BoardBlock,
  hoursFor: (stationId: string, dayIndex: number) => StationHours | null,
  days: Date[],
  timeZone: string
): Date {
  const startsAt = new Date(block.startsAt);
  const index = dayIndexOf(startsAt, days);
  const hours = index === null ? null : hoursFor(block.stationId, index);

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
 * systemet visar tim:min överallt, och det vore oanständigt att kräva att man
 * räknar om det till decimaltimmar för att skriva tillbaka samma tal.
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
