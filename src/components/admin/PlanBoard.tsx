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
 * En rad per station, sju kolumner, och rutor som dras ut ur orderns beräknade
 * tid. Förebilden är SkyPlanner; skillnaden är att utfallet ligger i samma vy,
 * så att planen och verkligheten går att jämföra utan att byta sida.
 *
 * ── TYPERNA ÄR TAVLANS EGNA ──────────────────────────────────────────────
 *
 * Komponenten definierar sina egna props i stället för att importera
 * `PlannedBlock` ur lib/planning.ts. Två skäl, och det första räcker: formen
 * ÄR en annan. Datum blir strängar på vägen hit, eftersom tavlan tar emot dem
 * både ur sidan och ur ett JSON-svar. Det andra är att lib/planning.ts drar in
 * Prisma. Samma hållning som KioskScreen har med `KioskActiveJob`: skärmen
 * äger formen, servern fyller den.
 *
 * `BlockProgress` är undantaget och importeras som TYP ur lib/plan-live.ts.
 * Den korsar gränsen oförändrad — tre tal och en lista namn, inget datum — och
 * en egen kopia av den hade varit två ställen som säger samma sak. En
 * typimport finns inte kvar efter bygget, så ingenting av Prisma följer med.
 *
 * ── DRAGNINGARNA ─────────────────────────────────────────────────────────
 *
 * Pointer events, inte HTML5 drag-and-drop. Det senare fungerar inte med
 * fingrar, och adminpanelen används på pekskärm. Inget bibliotek: repot skriver
 * hellre sin egen zip-fil än drar in ett beroende.
 *
 * Varje dragning är OPTIMISTISK. Rutan flyttar sig direkt, åtgärden skickas,
 * och ett fel lägger rutan tillbaka med ett meddelande. Samma hållning som
 * kiosken har, och av samma skäl: en tavla som fryser vid varje tryck blir en
 * tavla man inte orkar använda.
 *
 * ── SKALAN ───────────────────────────────────────────────────────────────
 *
 * En hel vecka i verkliga proportioner är bredare än vilken skärm som helst.
 * Därför tre zoomsteg, och helgdagar som bara visas när något ligger där.
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
}

/* -------------------------------------------------------------------------- */
/* Konstanter                                                                  */
/* -------------------------------------------------------------------------- */

/** Hur ofta utfallet hämtas. Tio sekunder känns samtidigt utan att märkas. */
const LIVE_MS = 10_000;

/**
 * ZOOMSTEGEN ÄR MULTIPLIKATORER, INTE PIXLAR PER MINUT.
 *
 * Steg ett betyder "hela veckan får plats i rutan". Skalan räknas alltså fram
 * ur den bredd tavlan faktiskt har, inte ur ett tal valt i förväg.
 *
 * Det var fel förut, och det syntes direkt: ett fast tal gav en vecka som var
 * dubbelt så bred som fönstret, och tavlan öppnade på måndag förmiddag med
 * resten utanför kanten. En planeringsvy vars första intryck är att man måste
 * leta rätt på onsdagen är ingen planeringsvy.
 */
const ZOOM = [1, 1.75, 3];

/** Stationskolumnens bredd i pixlar. Behövs för att räkna ut skalan. */
const STATION_COLUMN = 150;

/**
 * Minsta skala som är läsbar.
 *
 * Under det här blir en timme så smal att inte ens ett ordernummer får plats,
 * och tavlan är bättre med en rullningslist än med rutor som inte går att
 * skilja åt. Slår taket till rullar veckan i sidled, med stationskolumnen
 * kvar på plats.
 */
const MIN_PX_PER_MINUTE = 0.22;

/** Hur långt pekaren får röra sig och ändå räknas som ett tryck. */
const CLICK_SLOP = 4;

const DAY_LABELS = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

const MS_PER_MINUTE = 60_000;

/* -------------------------------------------------------------------------- */
/* Dragningens tillstånd                                                       */
/* -------------------------------------------------------------------------- */

type Drag =
  | {
      kind: "new";
      row: BoardUnplaced;
      /** Minuter rutan får när den släpps. */
      minutes: number;
      at: { x: number; y: number };
      target: Target | null;
    }
  | {
      kind: "move";
      block: BoardBlock;
      /** Var i rutan man tog tag, i minuter från rutans början. */
      grabMinutes: number;
      at: { x: number; y: number };
      target: Target | null;
    }
  | {
      kind: "resize";
      block: BoardBlock;
      /**
       * Rutans längd när draget började, och pekarens x-läge då.
       *
       * Längden räknas som utgångsläget PLUS pekarens förflyttning, inte ur
       * någon rutas kant. Händelserna fångas av rutan med
       * `setPointerCapture` men hanteras på tavlans rot, så
       * `event.currentTarget` är tavlan och inte rutan — ett rect därifrån
       * hade mätt från tavlans vänsterkant och gett rutor på många timmar.
       */
      fromMinutes: number;
      originX: number;
      minutes: number;
    };

interface Target {
  stationId: string;
  dayIndex: number;
  /** Starttiden pekaren svarar mot, redan snäppt. */
  startsAt: Date;
}

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
  /** Supportläge. Tavlan går att läsa, inte att ändra. */
  readOnly: boolean;
}) {
  const router = useRouter();

  const [blocks, setBlocks] = useState(initialBlocks);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);
  const [showUnplaced, setShowUnplaced] = useState(true);

  /**
   * Tavlans egen bredd i pixlar, mätt och inte gissad.
   *
   * Noll tills den mätts. Första renderingen sker på servern, där ingen bredd
   * finns — och en gissad bredd hade ritat en vecka som hoppar till så fort
   * mätningen kommer.
   */
  const [boardWidth, setBoardWidth] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<Record<string, BlockProgress>>({});
  const [now, setNow] = useState<number | null>(null);
  const [editing, setEditing] = useState<BoardBlock | null>(null);

  // Serverns bild vinner när sidan ritats om. Utan detta skulle en
  // omrendering efter revalidatePath lämna de optimistiska rutorna kvar, och
  // en avvisad ändring synas som genomförd tills fliken laddades om.
  useEffect(() => setBlocks(initialBlocks), [initialBlocks]);

  const mondayStart = useMemo(() => new Date(monday), [monday]);

  // Mäts om när fönstret ändras, när menyn fälls ut och när Oplacerat
  // stängs. Alla tre ändrar hur mycket plats veckan har.
  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;

    const measure = () => setBoardWidth(node.clientWidth);

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  /** Dygnsbörjan för veckans sju dagar, som tidpunkter. */
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
    // inte börjat finns ingenting levande att hämta, och ett anrop var tionde
    // sekund för en bild som inte kan ändras är ren kostnad.
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

  /* --- Hjälp till uträkningarna ----------------------------------------- */

  const hoursFor = useCallback(
    (stationId: string, dayIndex: number): StationHours | null => {
      const station = stations.find((item) => item.id === stationId);
      if (!station) return null;

      // Veckodagen är kolumnens, inte tidpunktens. Kolumnerna står i ISO-ordning
      // från måndag, så index noll är veckodag ett.
      return station.hours.find((day) => day.weekday === dayIndex + 1) ?? null;
    },
    [stations]
  );

  /** Rutans spann på väggen, som millisekunder. */
  const spanOf = useCallback(
    (block: BoardBlock) => {
      const startsAt = new Date(block.startsAt);
      const dayIndex = dayIndexOf(startsAt, days);
      const hours = dayIndex === null ? null : hoursFor(block.stationId, dayIndex);

      return {
        dayIndex,
        from: startsAt,
        to: blockEnd(hours, startsAt, block.minutes, timeZone),
      };
    },
    [days, hoursFor, timeZone]
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

  /** Tidsaxeln per dag. Räknas om när rutorna flyttar, så överbokning syns. */
  const windows = useMemo(() => {
    const result = new Map<number, { startMinute: number; endMinute: number }>();

    for (const index of visibleDays) {
      const spans = blocks
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
  }, [blocks, days, hoursFor, stations, timeZone, visibleDays]);

  /**
   * Skalan: pixlar per minut.
   *
   * Steg ett lägger hela veckan i den bredd som finns. Måtten är kända först
   * när dagfönstren räknats, eftersom en fredag som slutar 13:00 är smalare
   * än en måndag som slutar 16:00 — veckan är inte sju lika breda kolumner.
   *
   * Innan bredden mätts används en skala som duger till en första rendering.
   * Den syns bara ett ögonblick, och ett nollvärde hade gett kolumner utan
   * bredd.
   */
  const pxPerMinute = useMemo(() => {
    const minutes = visibleDays.reduce((total, index) => {
      const axis = windows.get(index);
      return total + (axis ? axis.endMinute - axis.startMinute : 0);
    }, 0);

    if (boardWidth === 0 || minutes === 0) return 0.5 * ZOOM[zoom];

    // Två pixlar per dag för kolumnlinjerna, så att sista dagen inte hamnar
    // en hårsmån utanför och tvingar fram en rullningslist som inte behövs.
    const usable = boardWidth - STATION_COLUMN - visibleDays.length * 2;

    const fit = usable / minutes;

    return Math.max(MIN_PX_PER_MINUTE, fit) * ZOOM[zoom];
  }, [boardWidth, visibleDays, windows, zoom]);

  const widthOf = useCallback(
    (dayIndex: number) => {
      const axis = windows.get(dayIndex);
      if (!axis) return 0;
      return (axis.endMinute - axis.startMinute) * pxPerMinute;
    },
    [pxPerMinute, windows]
  );

  /* --- Träffytor --------------------------------------------------------- */

  const cells = useRef(new Map<string, HTMLElement>());

  const registerCell = useCallback(
    (key: string, node: HTMLElement | null) => {
      if (node) cells.current.set(key, node);
      else cells.current.delete(key);
    },
    []
  );

  /**
   * Vilken cell pekaren står i, och vilken starttid det svarar mot.
   *
   * Hittas genom att gå igenom cellernas rutor och inte med
   * `elementFromPoint`: det senare träffar den ruta man drar, som ligger under
   * pekaren hela tiden.
   */
  const targetAt = useCallback(
    (x: number, y: number): Target | null => {
      for (const [key, node] of cells.current) {
        const rect = node.getBoundingClientRect();

        if (x < rect.left || x > rect.right) continue;
        if (y < rect.top || y > rect.bottom) continue;

        const [stationId, rawDay] = key.split("|");
        const dayIndex = Number(rawDay);
        const axis = windows.get(dayIndex);
        if (!axis) continue;

        const minute =
          axis.startMinute + (x - rect.left) / Math.max(pxPerMinute, 0.01);

        const snapped =
          Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;

        return {
          stationId,
          dayIndex,
          startsAt: new Date(
            days[dayIndex].getTime() + Math.max(0, snapped) * MS_PER_MINUTE
          ),
        };
      }

      return null;
    },
    [days, pxPerMinute, windows]
  );

  /* --- Dragningarna ----------------------------------------------------- */

  const startedAt = useRef<{ x: number; y: number } | null>(null);

  function beginNew(
    event: ReactPointerEvent<HTMLElement>,
    row: BoardUnplaced
  ) {
    if (readOnly) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    startedAt.current = { x: event.clientX, y: event.clientY };

    setDrag({
      kind: "new",
      row,
      minutes: snap(Math.max(SNAP_MINUTES, row.remainingMinutes)),
      at: { x: event.clientX, y: event.clientY },
      target: null,
    });
  }

  function beginMove(event: ReactPointerEvent<HTMLElement>, block: BoardBlock) {
    if (readOnly) return;

    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    startedAt.current = { x: event.clientX, y: event.clientY };

    setDrag({
      kind: "move",
      block,
      grabMinutes: (event.clientX - rect.left) / Math.max(pxPerMinute, 0.01),
      at: { x: event.clientX, y: event.clientY },
      target: null,
    });
  }

  function beginResize(
    event: ReactPointerEvent<HTMLElement>,
    block: BoardBlock
  ) {
    if (readOnly) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    startedAt.current = { x: event.clientX, y: event.clientY };

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

    if (drag.kind === "resize") {
      const moved = (event.clientX - drag.originX) / Math.max(pxPerMinute, 0.01);

      setDrag({ ...drag, minutes: snap(drag.fromMinutes + moved) });
      return;
    }

    const target = targetAt(event.clientX, event.clientY);

    if (drag.kind === "new") {
      setDrag({ ...drag, at: { x: event.clientX, y: event.clientY }, target });
    } else {
      // Pekaren pekar på var man HÅLLER, inte på rutans början. Utan
      // greppavståndet skulle rutan hoppa så att dess vänsterkant hamnar under
      // fingret, vilket känns som att den rycker till.
      const shifted = target
        ? {
            ...target,
            startsAt: new Date(
              target.startsAt.getTime() -
                Math.round(drag.grabMinutes / SNAP_MINUTES) *
                  SNAP_MINUTES *
                  MS_PER_MINUTE
            ),
          }
        : null;

      setDrag({
        ...drag,
        at: { x: event.clientX, y: event.clientY },
        target: shifted,
      });
    }
  }

  async function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    const current = drag;
    const origin = startedAt.current;

    setDrag(null);
    startedAt.current = null;

    if (!current) return;

    const moved =
      !origin ||
      Math.abs(event.clientX - origin.x) > CLICK_SLOP ||
      Math.abs(event.clientY - origin.y) > CLICK_SLOP;

    // Ett tryck utan rörelse på en befintlig ruta öppnar den i stället.
    if (!moved) {
      if (current.kind === "move") setEditing(current.block);
      return;
    }

    setError(null);

    if (current.kind === "resize") {
      await commitResize(current.block, current.minutes);
      return;
    }

    if (!current.target) return;

    if (current.kind === "new") await commitPlace(current.row, current.target);
    else await commitMove(current.block, current.target);
  }

  /* --- Skrivningarna ---------------------------------------------------- */

  /** Kör en åtgärd och lägger tillbaka den optimistiska bilden vid fel. */
  async function run(
    optimistic: () => void,
    send: () => Promise<{ error?: string }>
  ) {
    const before = blocks;
    optimistic();

    const result = await send();

    if (result.error) {
      setBlocks(before);
      setError(result.error);
      return;
    }

    // Serverns svar hämtas in. Den kan ha kapat rutan mot midnatt eller
    // avrundat annorlunda än vi gissade, och då ska dess siffra gälla.
    router.refresh();
  }

  async function commitPlace(row: BoardUnplaced, target: Target) {
    const station = stations.find((item) => item.id === target.stationId);
    if (!station) return;

    if (station.momentId !== row.momentId) {
      setError(`${station.name} kör inte ${row.momentName}.`);
      return;
    }

    const hours = hoursFor(station.id, target.dayIndex);
    const room = fitsFrom(hours, target.startsAt, timeZone);

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
      startsAt: target.startsAt.toISOString(),
      minutes,
      note: null,
    };

    await run(
      () => setBlocks((current) => [...current, draft]),
      () => {
        const data = new FormData();
        data.set("orderId", row.orderId);
        data.set("momentId", row.momentId);
        data.set("stationId", station.id);
        data.set("startsAt", target.startsAt.toISOString());
        data.set("minutes", String(minutes));
        return placeBlockAction({}, data);
      }
    );
  }

  async function commitMove(block: BoardBlock, target: Target) {
    const station = stations.find((item) => item.id === target.stationId);
    if (!station) return;

    if (station.momentId !== block.momentId) {
      setError(`${station.name} kör inte ${block.momentName}.`);
      return;
    }

    await run(
      () =>
        setBlocks((current) =>
          current.map((item) =>
            item.id === block.id
              ? {
                  ...item,
                  stationId: station.id,
                  startsAt: target.startsAt.toISOString(),
                }
              : item
          )
        ),
      () => {
        const data = new FormData();
        data.set("blockId", block.id);
        data.set("stationId", station.id);
        data.set("startsAt", target.startsAt.toISOString());
        return moveBlockAction({}, data);
      }
    );
  }

  async function commitResize(block: BoardBlock, minutes: number) {
    if (minutes === block.minutes) return;

    await run(
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
  }

  async function commitNote(block: BoardBlock, note: string) {
    if ((block.note ?? "") === note.trim()) return;

    await run(
      () =>
        setBlocks((current) =>
          current.map((item) =>
            item.id === block.id ? { ...item, note: note.trim() || null } : item
          )
        ),
      () => {
        const data = new FormData();
        data.set("blockId", block.id);
        data.set("note", note);
        return noteBlockAction({}, data);
      }
    );
  }

  async function commitRemove(block: BoardBlock) {
    setEditing(null);

    await run(
      () =>
        setBlocks((current) => current.filter((item) => item.id !== block.id)),
      () => {
        const data = new FormData();
        data.set("blockId", block.id);
        return removeBlockAction({}, data);
      }
    );
  }

  /* --- Det som ritas ---------------------------------------------------- */

  /** Rutorna som de ser ut just nu, med dragningen inräknad. */
  const shown = useMemo(() => {
    if (!drag) return blocks;

    if (drag.kind === "resize") {
      return blocks.map((block) =>
        block.id === drag.block.id
          ? { ...block, minutes: drag.minutes }
          : block
      );
    }

    if (drag.kind === "move" && drag.target) {
      // Plockas ut före map(). Inuti callbacken har TypeScript tappat att
      // `drag.target` är satt, och alternativet vore två utropstecken som
      // påstår något kompilatorn inte kan se.
      const { stationId, startsAt } = drag.target;
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
   * Rader utan återstod faller bort — de ligger redan ute på tavlan. Rader utan
   * beräkning står kvar, eftersom deras planerade tid annars vore osynlig.
   *
   * Listan räknas om av SERVERN efter varje dragning, inte här. Återstoden
   * härleds ur rutorna (se `unplacedWork` i lib/planning.ts), och att gissa
   * samma tal lokalt vore ett andra ställe som säger samma sak.
   */
  const unplaced = useMemo(
    () =>
      initialUnplaced.filter(
        (row) => row.remainingMinutes > 0 || row.budgetMinutes === null
      ),
    [initialUnplaced]
  );

  const plannable = unplaced.filter((row) => row.plannable);
  const unplannable = unplaced.filter((row) => !row.plannable);

  const draggingMoment =
    drag?.kind === "new"
      ? drag.row.momentId
      : drag?.kind === "move"
        ? drag.block.momentId
        : null;

  /** Rutan som dras just nu, om någon. Null under en ny placering. */
  const draggedBlockId =
    drag && drag.kind !== "new" ? drag.block.id : null;

  /**
   * Cellen som är på väg att få släppet, om någon.
   *
   * Plockas ut en gång och inte i varje cells klassnamn. `drag?.target` går
   * inte att skriva rakt: varianten "resize" har inget `target`-fält, och
   * TypeScript smalnar inte av unionen genom en valfri kedja.
   */
  const dropTarget =
    drag && drag.kind !== "resize" ? drag.target : null;

  return (
    <div
      className="flex flex-col gap-4 lg:flex-row"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null);
        startedAt.current = null;
      }}
    >
      {/* --- Oplacerat ----------------------------------------------------
          Går att fälla ihop. Panelen tog 256 pixlar av veckans bredd även när
          den stod tom, och de pixlarna är veckans. */}
      <aside
        className={`w-full shrink-0 ${showUnplaced ? "lg:w-60" : "lg:w-auto"}`}
      >
        <div className="rounded-lg border border-neutral-200 bg-white">
          <button
            type="button"
            onClick={() => setShowUnplaced((value) => !value)}
            className="flex w-full items-center gap-2 border-b border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50"
            aria-expanded={showUnplaced}
          >
            <span className="text-sm font-semibold text-neutral-900">
              Oplacerat
            </span>
            {unplaced.length > 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800">
                {unplaced.length}
              </span>
            )}
            <span className="ml-auto text-neutral-400">
              {showUnplaced ? "−" : "+"}
            </span>
          </button>

          <div
            className={`max-h-[32rem] overflow-y-auto p-2 ${
              showUnplaced ? "" : "hidden"
            }`}
          >
            {plannable.length === 0 && unplannable.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-neutral-500">
                Allt beräknat arbete ligger på tavlan.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {plannable.map((row) => (
                  <li key={`${row.orderId}:${row.momentId}`}>
                    <UnplacedChip
                      row={row}
                      readOnly={readOnly}
                      onPointerDown={(event) => beginNew(event, row)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {unplannable.length > 0 && (
              <div className="mt-4 border-t border-neutral-200 pt-3">
                <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  Ingen station
                </p>
                <ul className="space-y-1.5">
                  {unplannable.map((row) => (
                    <li key={`${row.orderId}:${row.momentId}`}>
                      <UnplacedChip row={row} readOnly muted />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* --- Tavlan ------------------------------------------------------- */}
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between gap-3">
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

        {error && (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        )}

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
            ref={boardRef}
            className="overflow-x-auto rounded-lg border border-neutral-200 bg-white"
          >
            <div className="inline-block min-w-full">
              {/* Dagrubrikerna */}
              <div className="flex border-b border-neutral-200 bg-neutral-50">
                {/* STATIONSKOLUMNEN STÅR STILL. Rullar man in i veckan ska man
                    fortfarande kunna se vilken maskin raden gäller — utan det
                    är en tavla med tolv stationer oläslig så fort man zoomat
                    in. */}
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
                      {DAY_LABELS[index]}{" "}
                      <span className="font-normal text-neutral-400">
                        {dayLabel(days[index], timeZone)}
                      </span>
                    </p>
                    <Axis
                      axis={windows.get(index)}
                      pxPerMinute={pxPerMinute}
                    />
                  </div>
                ))}
              </div>

              {/* En rad per station */}
              {stations.map((station) => (
                <div
                  key={station.id}
                  className="flex border-b border-neutral-100 last:border-b-0"
                >
                  <div
                    style={{ width: STATION_COLUMN }}
                    className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-neutral-200 bg-white px-3 py-2"
                  >
                    <p className="truncate text-[13px] font-medium text-neutral-900">
                      {station.name}
                    </p>
                    <p className="truncate text-[11px] text-neutral-400">
                      {station.momentName}
                    </p>
                  </div>

                  {visibleDays.map((dayIndex) => {
                    const hours = hoursFor(station.id, dayIndex);
                    const axis = windows.get(dayIndex);

                    const dayBlocks = shown.filter(
                      (block) =>
                        block.stationId === station.id &&
                        dayIndexOf(new Date(block.startsAt), days) === dayIndex
                    );

                    const load = stationDayLoad(
                      hours,
                      dayBlocks.map((block) => ({
                        startsAt: new Date(block.startsAt),
                        minutes: block.minutes,
                        hours,
                      })),
                      timeZone
                    );

                    const over =
                      load.overlaps ||
                      load.plannedMinutes > load.capacityMinutes;

                    return (
                      <div
                        key={dayIndex}
                        ref={(node) =>
                          registerCell(`${station.id}|${dayIndex}`, node)
                        }
                        style={{ width: widthOf(dayIndex) }}
                        className={`relative shrink-0 border-l-2 border-neutral-200 first:border-l-0 ${
                          draggingMoment && draggingMoment !== station.momentId
                            ? "opacity-30"
                            : ""
                        } ${
                          dropTarget !== null &&
                          dropTarget.stationId === station.id &&
                          dropTarget.dayIndex === dayIndex
                            ? "bg-blue-50/60"
                            : ""
                        }`}
                      >
                        <div className="relative h-20">
                          {/* Stängd tid och raster, i grått. Det öppna är vitt. */}
                          <div className="absolute inset-0 bg-neutral-100/70" />
                          {axis &&
                            workingWindows(hours, days[dayIndex], timeZone).map(
                              (span, index) => (
                                <div
                                  key={index}
                                  className="absolute inset-y-0 bg-white"
                                  style={{
                                    left: offsetPx(
                                      span.from,
                                      days[dayIndex],
                                      axis,
                                      pxPerMinute
                                    ),
                                    width:
                                      ((span.to - span.from) / MS_PER_MINUTE) *
                                      pxPerMinute,
                                  }}
                                />
                              )
                            )}

                          {/* Nulinjen, bara i dagens kolumn. */}
                          {now !== null &&
                            axis &&
                            dayIndexOf(new Date(now), days) === dayIndex && (
                              <div
                                className="absolute inset-y-0 w-0.5 bg-tick-deep"
                                style={{
                                  left: offsetPx(
                                    now,
                                    days[dayIndex],
                                    axis,
                                    pxPerMinute
                                  ),
                                }}
                              />
                            )}

                          {axis &&
                            dayBlocks.map((block) => (
                              <BlockBox
                                key={block.id}
                                block={block}
                                hours={hours}
                                day={days[dayIndex]}
                                axis={axis}
                                pxPerMinute={pxPerMinute}
                                timeZone={timeZone}
                                progress={progress[block.id]}
                                dragging={draggedBlockId === block.id}
                                readOnly={readOnly}
                                onPointerDown={(event) =>
                                  beginMove(event, block)
                                }
                                onResizeStart={(event) =>
                                  beginResize(event, block)
                                }
                              />
                            ))}
                        </div>

                        {over && (
                          <span
                            className="absolute right-1 top-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800"
                            title={
                              load.overlaps
                                ? "Två jobb ligger i varandra"
                                : `${formatDuration(
                                    load.plannedMinutes - load.capacityMinutes
                                  )} mer än stationen hinner`
                            }
                          >
                            {load.overlaps ? "krock" : "över"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <Legend />
      </div>

      {/* --- Rutan som öppnas vid ett tryck ------------------------------- */}
      {editing && (
        <BlockDialog
          block={editing}
          span={spanOf(editing)}
          progress={progress[editing.id]}
          timeZone={timeZone}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onRemove={() => void commitRemove(editing)}
          onSave={(minutes, note) => {
            const block = editing;
            setEditing(null);

            // Två åtgärder och inte en. Tiden ändras vid varje dragning och är
            // därför en egen, het väg; anteckningen skrivs sällan. En
            // sammanslagen åtgärd hade betytt att varje drag skickade med en
            // anteckning den inte rör.
            void (async () => {
              await commitResize(block, minutes);
              await commitNote(block, note);
            })();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Delarna                                                                     */
/* -------------------------------------------------------------------------- */

function UnplacedChip({
  row,
  readOnly,
  muted = false,
  onPointerDown,
}: {
  row: BoardUnplaced;
  readOnly: boolean;
  muted?: boolean;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const over = row.remainingMinutes < 0;

  return (
    <div
      onPointerDown={onPointerDown}
      className={`rounded-md border px-2.5 py-2 ${
        muted
          ? "border-neutral-200 bg-neutral-50"
          : "border-neutral-200 bg-white"
      } ${readOnly || muted ? "" : "cursor-grab touch-none active:cursor-grabbing"}`}
    >
      <p className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="truncate font-medium text-neutral-900">
          {row.orderNumber}
        </span>
        <span
          className={`shrink-0 tabular-nums ${
            over ? "text-amber-700" : "text-neutral-900"
          }`}
        >
          {row.budgetMinutes === null
            ? formatDuration(row.placedMinutes)
            : formatDuration(Math.abs(row.remainingMinutes))}
        </span>
      </p>
      <p className="truncate text-[11px] text-neutral-500">
        {row.momentName}
        {row.customerName ? ` · ${row.customerName}` : ""}
      </p>
      {(row.dueDate || over || row.budgetMinutes === null) && (
        <p className="mt-0.5 truncate text-[11px] text-neutral-400">
          {row.budgetMinutes === null
            ? "Ingen beräkning"
            : over
              ? "Över beräknat"
              : null}
          {row.dueDate && row.budgetMinutes !== null && !over
            ? `Senast ${shortDate(row.dueDate)}`
            : null}
        </p>
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
    6,
    ((end.getTime() - startsAt.getTime()) / MS_PER_MINUTE) * pxPerMinute
  );

  const done = progress
    ? Math.min(100, (progress.clockedMinutes / Math.max(block.minutes, 1)) * 100)
    : 0;

  const label = `${block.orderNumber} · ${block.momentName} · ${formatDuration(
    block.minutes
  )}${progress ? ` · stämplat ${formatDuration(progress.clockedMinutes)}` : ""}${
    progress?.running ? ` · ${progress.people.join(", ")}` : ""
  }`;

  return (
    <div
      onPointerDown={onPointerDown}
      title={label}
      style={{ left, width }}
      className={`absolute inset-y-1 overflow-hidden rounded-md bg-blue-600 text-white ring-1 ring-inset ${
        progress?.running ? "ring-2 ring-tick" : "ring-blue-700/40"
      } ${dragging ? "opacity-70" : ""} ${
        readOnly ? "" : "cursor-grab touch-none active:cursor-grabbing"
      }`}
    >
      {/* Stämplad tid som en ifylld del. Ligger bakom texten. */}
      {progress && (
        <div
          className="absolute inset-y-0 left-0 bg-tick-deep"
          style={{ width: `${done}%` }}
        />
      )}

      {width > 34 && (
        <div className="relative px-1.5 py-1.5">
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
              {progress ? ` · ${formatDuration(progress.clockedMinutes)}` : ""}
            </p>
          )}
        </div>
      )}

      {!readOnly && (
        <div
          onPointerDown={onResizeStart}
          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none bg-white/20"
        />
      )}
    </div>
  );
}

/** Klockslagen under dagrubriken. En etikett per hel eller annan timme. */
function Axis({
  axis,
  pxPerMinute,
}: {
  axis?: { startMinute: number; endMinute: number };
  pxPerMinute: number;
}) {
  if (!axis) return null;

  const step = pxPerMinute < 0.45 ? 180 : pxPerMinute < 0.8 ? 120 : 60;

  const ticks: number[] = [];
  for (
    let minute = Math.ceil(axis.startMinute / step) * step;
    minute < axis.endMinute;
    minute += step
  ) {
    ticks.push(minute);
  }

  return (
    <div className="relative mt-0.5 h-3">
      {ticks.map((minute) => (
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

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm bg-blue-600" />
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
    </div>
  );
}

/** Rutan som öppnas när man trycker på ett planerat jobb. */
function BlockDialog({
  block,
  span,
  progress,
  timeZone,
  readOnly,
  onClose,
  onRemove,
  onSave,
}: {
  block: BoardBlock;
  span: { from: Date; to: Date };
  progress?: BlockProgress;
  timeZone: string;
  readOnly: boolean;
  onClose: () => void;
  onRemove: () => void;
  onSave: (minutes: number, note: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hours, setHours] = useState(() => toHourText(block.minutes));
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
          {clockText(span.from, timeZone)}–{clockText(span.to, timeZone)}
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
            inputMode="text"
            disabled={readOnly}
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

/**
 * Dygnets början på väggen.
 *
 * Egen rad här och inte `startOfDayIn` ur time-zone.ts, eftersom den bygger på
 * `instantFromWallTime`, som itererar — billigt på servern och onödigt i en
 * omrendering som sker vid varje pekarrörelse. Resultatet är detsamma.
 */
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
    value("hour") * 3_600_000 + value("minute") * 60_000 + value("second") * 1000;

  return new Date(instant.getTime() - intoDay);
}

/**
 * Vilken av veckans dagar en tidpunkt tillhör, eller null utanför veckan.
 *
 * Gränsen är NÄSTA DAGS början och inte ett antal timmar. Dygnet då klockan
 * ställs om är 23 eller 25 timmar långt, och ett fast tal hade lagt söndagen
 * till lördagen två gånger om året — vilket syns som att rutor försvinner ur
 * tavlan just de veckorna.
 *
 * Söndagen har ingen nästa dag i listan, och får därför det längsta dygn som
 * finns. Det kan i teorin svälja första timmen av måndagen efter, men ingen
 * tidpunkt som kommer hit ligger där: rutorna är hämtade inom veckan och
 * kapas mot midnatt, och nulinjen ritas bara i den pågående veckan.
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

/** Minuter som "4:30". Samma form som fältet tar emot. */
function toHourText(minutes: number): string {
  return formatDuration(minutes);
}

/**
 * "4:30" eller "4,5" till minuter.
 *
 * Tar båda formerna, av samma skäl som orderns beräkningsfält gör det: systemet
 * visar tim:min överallt, och det vore oanständigt att kräva att man räknar om
 * det till decimaltimmar för att skriva tillbaka samma tal.
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
