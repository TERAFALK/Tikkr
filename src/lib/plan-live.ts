import type { CompanyDb } from "./tenant";
import { blockEnd, type StationHours } from "./plan-calendar";

/**
 * UTFALLET MOT PLANEN.
 *
 * Svarar på en enda fråga: KÖRS det planerade jobbet? Tavlan ritar svaret som
 * ett lager i rutan — grön kant när någon står instämplad, och stämplad tid mot
 * planerad när passet är över.
 *
 * ── LÄSER, SKRIVER ALDRIG ────────────────────────────────────────────────
 *
 * Filen rör `time_entries` med `findMany` och ingenting annat. Planen ändras
 * aldrig av en stämpling, och en stämpling ändras aldrig av planen.
 *
 * Det första är ett val: en plan som skriver om sig själv när verkligheten
 * avviker går inte att lita på, och administratören tappar kontrollen över sitt
 * eget schema. Det andra är en gräns: en stämplad timme är fakturaunderlag, och
 * planeringen får inte kunna flytta den. Bevisas av
 * `tests/planning-boundary.test.ts`.
 *
 * ── TILLSKRIVNINGSREGELN, UTSKRIVEN ──────────────────────────────────────
 *
 * En stämpling bär order och arbetsmoment men INTE station. Kiosken känner inga
 * stationer, och ska inte göra det: ett tryck ska räcka för att registrera tid.
 * Tikkr kan därför inte veta vid vilken av två likadana fräsar operatören stod.
 *
 * Regeln blir: en stämpling tillskrivs en ruta när ordern och momentet stämmer
 * OCH tiderna överlappar. Ligger två rutor för samma order och moment samtidigt
 * på olika stationer räknas samma minuter på båda.
 *
 * Det är öppet felaktigt, och ändå det rätta valet. Siffran svarar på om jobbet
 * körs, inte på hur mycket tid som ska faktureras. Den sanna summan per order
 * och moment finns i RAPPORTERNA, som är stället där varje stämpling syns för
 * sig. Det som visas i tavlan är en indikation, och gränssnittet säger det.
 *
 * ── SUMMERINGEN ÄR RÅ ────────────────────────────────────────────────────
 *
 * Minuterna räknas rakt av och aldrig med `mainMinutes` från `spans.ts`. Tavlan
 * frågar om MASKINEN gick, inte om personen var på jobbet. Kör en operatör två
 * maskiner 08–12 ska båda rutorna visa fyra timmar — det är samma skillnad som
 * rapporterna och tidrapporten gör, se avgränsningen i CLAUDE.md.
 */

/** En ruta som utfallet ska räknas för. */
export interface LiveBlock {
  id: string;
  orderId: string;
  momentId: string;
  startsAt: Date;
  minutes: number;
  /** Stationens tider den dagen, för att veta var rutan slutar. */
  hours: StationHours | null;
}

export interface BlockProgress {
  /** Stämplad tid som ligger inom rutans spann, i HELA minuter. */
  clockedMinutes: number;
  /** true när någon står instämplad på rutans order och moment just nu. */
  running: boolean;
  /** Namnen på dem som är instämplade just nu. Visas, lagras inte. */
  people: string[];
}

const MS_PER_MINUTE = 60_000;

/**
 * Utfallet för varje ruta, som en karta på rutans id.
 *
 * Rutor utan någon stämpling saknas i kartan. Tavlan visar då "·" och inte
 * "0:00" — ingen tid och noll tid är olika svar, samma hållning som en saknad
 * timkostnad har (CLAUDE.md § 3 regel 4).
 *
 * EN enda `now` för hela anropet. Pågående pass räknas fram till den, och två
 * rutor på samma stämpling får annars olika sluttid i samma svar.
 */
export async function progressFor(
  db: CompanyDb,
  blocks: LiveBlock[],
  timeZone: string,
  now: Date = new Date()
): Promise<Map<string, BlockProgress>> {
  const result = new Map<string, BlockProgress>();
  if (blocks.length === 0) return result;

  const spans = blocks.map((block) => ({
    block,
    from: block.startsAt.getTime(),
    to: blockEnd(block.hours, block.startsAt, block.minutes, timeZone).getTime(),
  }));

  // Bara stämplingar som kan röra någon ruta hämtas. Rutten anropas var tionde
  // sekund av varje öppen tavla, och ska därför kosta nästan ingenting.
  const from = new Date(Math.min(...spans.map((span) => span.from)));
  const to = new Date(Math.max(...spans.map((span) => span.to)));

  const entries = await db.timeEntry.findMany({
    where: {
      kind: "ORDER",
      orderId: { in: [...new Set(blocks.map((block) => block.orderId))] },
      momentId: { in: [...new Set(blocks.map((block) => block.momentId))] },
      clockInAt: { lt: to },
      // Pågående pass har ingen sluttid och ska alltid med: de är hela skälet
      // att funktionen finns.
      OR: [{ clockOutAt: null }, { clockOutAt: { gt: from } }],
    },
    select: {
      orderId: true,
      momentId: true,
      clockInAt: true,
      clockOutAt: true,
      employee: { select: { name: true } },
    },
  });

  if (entries.length === 0) return result;

  for (const { block, from: blockFrom, to: blockTo } of spans) {
    let clocked = 0;
    let running = false;
    const people = new Set<string>();

    for (const entry of entries) {
      if (entry.orderId !== block.orderId) continue;
      if (entry.momentId !== block.momentId) continue;

      const entryFrom = entry.clockInAt.getTime();
      const entryTo = entry.clockOutAt?.getTime() ?? now.getTime();

      const overlap =
        Math.min(entryTo, blockTo) - Math.max(entryFrom, blockFrom);

      if (overlap > 0) clocked += overlap;

      // PÅGÅR JUST NU är en annan fråga än överlappet, och ska inte kräva att
      // rutan omsluter nuet. Den som börjar en timme för tidigt, eller håller
      // på efter att rutan tagit slut, arbetar fortfarande på jobbet — och
      // tavlan ska visa det i stället för att se död ut.
      if (!entry.clockOutAt) {
        running = true;
        people.add(entry.employee.name);
      }
    }

    if (clocked <= 0 && !running) continue;

    result.set(block.id, {
      clockedMinutes: Math.round(Math.max(0, clocked) / MS_PER_MINUTE),
      running,
      people: [...people].sort((a, b) => a.localeCompare(b, "sv")),
    });
  }

  return result;
}
