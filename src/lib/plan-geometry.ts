/**
 * TAVLANS MÅTT (tillagt 2026-10-17).
 *
 * Var dagarna ligger i sidled, vilken dag och vilken minut ett tryck träffar,
 * och var klockslagen i rubriken står. Rubriken, rutnätet och träffytan läser
 * alla härifrån, och det är hela skälet att filen finns.
 *
 * ── FELET SOM GAV DEN ────────────────────────────────────────────────────
 *
 * Tre delar av tavlan räknade var för sig, och de räknade olika:
 *
 *  1. Rubrikens klockslag stod i en ruta med inre marginal, och rutnätet under
 *     hade ingen. "09" stod till höger om 09-linjen, och den sista siffran
 *     hamnade ute på kanten mot nästa dag.
 *  2. Skiljelinjen mellan dagarna räknades som om den låg UTANFÖR dagens
 *     bredd, men webbläsaren ritar den INNANFÖR (box-sizing: border-box).
 *     Slutet av varje dag kapades, och ett tryck hamnade några minuter fel,
 *     mer ju längre in i veckan.
 *
 * Nu finns ett enda mått. En dagkolumn är skiljelinjen plus innehållet, och
 * `left` pekar alltid på innehållets början. Den som ritar en kolumn ger den
 * bredden `width + border`, och allt inuti räknas från innehållets kant.
 *
 * Filen har inga importer. Den läses av tavlan i webbläsaren, och räkningen
 * prövas i tests/plan-geometry.test.ts utan att något ritas.
 */

/** Linjen mellan två dagar, i pixlar. Ligger till vänster i varje kolumn. */
export const DAY_BORDER = 2;

/**
 * Bredden på en hopfälld helgdag. Rymmer "Lör" och datumet, och är ett tryck
 * stort nog att träffa med fingret.
 */
export const COLLAPSED_DAY_WIDTH = 56;

/**
 * Minsta skalan, i pixlar per minut. Under den rullar tavlan i sidled.
 *
 * LÅGT MED FLIT (ändrat 2026-10-17, var 0,25). Veckovyn är till för att se
 * hela veckan, och den som behöver läsa en timme byter till Dag. Med axeln
 * 06–18 och en utfälld helgdag behövde veckan 1 300 pixlar vid 0,25, och på en
 * vanlig skärm hamnade söndagen utanför kanten. Vid 0,12 ryms sju hela dagar
 * på drygt 900 pixlar; en telefon rullar fortfarande, och har dagvyn.
 */
export const WEEK_SCALE_FLOOR = 0.12;

/** Minsta avstånd från ett klockslags mitt till dagens kant, i pixlar. */
const LABEL_HALF_WIDTH = 10;

export interface DayAxis {
  startMinute: number;
  endMinute: number;
}

/** En av veckans dagar som den ska ritas. */
export interface DayPlan {
  /** Veckodagen, noll är måndag. */
  index: number;
  /** En hopfälld dag har ingen tidslinje, bara sin rubrik. */
  collapsed: boolean;
}

export interface DayColumn extends DayPlan {
  /** Innehållets bredd i pixlar, utan skiljelinjen. */
  width: number;
  /** Från tidslinjens vänsterkant till innehållets början, i pixlar. */
  left: number;
}

/**
 * Vilka dagar som ritas, och vilka som är hopfällda.
 *
 * HELGEN ÄR ALLTID MED (ändrat 2026-10-17). Den doldes när ingen station gick
 * och inget låg där, och en vecka som pågick en lördag visade då varken dagen
 * eller vad klockan var. Nu står lördag och söndag som smala kolumner, och
 * blir breda när något planerats där, när en resurs har tider där eller när
 * det är den dagen.
 *
 * En vald dag ger bara den dagen: dagvyn.
 */
export function plannedDays(input: {
  /** Per veckodag: någon resurs har tider den dagen. */
  open: boolean[];
  /** Per veckodag: något ligger planerat den dagen. */
  used: boolean[];
  /** Dagens veckodag, när veckan pågår. */
  todayIndex: number | null;
  /** Den valda dagen i dagvyn, annars null. */
  focus: number | null;
}): DayPlan[] {
  if (input.focus !== null) return [{ index: input.focus, collapsed: false }];

  return [0, 1, 2, 3, 4, 5, 6].map((index) => ({
    index,
    collapsed:
      index >= 5 &&
      !input.open[index] &&
      !input.used[index] &&
      input.todayIndex !== index,
  }));
}

/** Minuterna dagens axel spänner över. */
export function axisMinutes(axis: DayAxis): number {
  return Math.max(0, axis.endMinute - axis.startMinute);
}

/**
 * Skalan, i pixlar per minut, som fyller den bredd som finns.
 *
 * Hopfällda dagar och skiljelinjerna tar sin bredd först, och resten delas av
 * de öppna dagarna efter hur många minuter de spänner över. Under golvet blir
 * en timme smalare än ett ordernummer, och då rullar tavlan i sidled i stället.
 */
export function fitScale(input: {
  available: number;
  plans: DayPlan[];
  axisOf: (index: number) => DayAxis;
  floor: number;
}): number {
  const collapsed = input.plans.filter((plan) => plan.collapsed).length;

  const minutes = input.plans
    .filter((plan) => !plan.collapsed)
    .reduce((total, plan) => total + axisMinutes(input.axisOf(plan.index)), 0);

  const usable =
    input.available -
    input.plans.length * DAY_BORDER -
    collapsed * COLLAPSED_DAY_WIDTH;

  if (minutes === 0 || usable <= 0) return input.floor;

  return Math.max(input.floor, usable / minutes);
}

/**
 * Var varje dag ligger. Bredderna är HELA pixlar: med bruten bredd hamnar
 * kolumnlinjen, timlinjerna och rutornas kanter på var sin sida om samma halva
 * pixel, och saker byter storlek med en pixel när något annat ändras.
 *
 * AVRUNDAS NEDÅT. Uppåt gav upp till en pixel för mycket per dag, och veckan
 * blev några pixlar bredare än skärmen, med en rullningslist som följd.
 *
 * DET SOM BLIR ÖVER DELAS UT (ändrat 2026-10-17). Nedåt gav i stället upp
 * till en pixel för lite per dag, och raderna slutade före tavlans kant med en
 * vit strimma efter söndagen. Med `available` får de öppna dagarna en pixel
 * var, från måndag, tills bredden är fylld. Ryms veckan inte alls, under
 * golvet, finns ingenting över och ingenting delas ut.
 */
export function layoutDays(
  plans: DayPlan[],
  axisOf: (index: number) => DayAxis,
  pxPerMinute: number,
  available?: number
): DayColumn[] {
  const widths = plans.map((plan) =>
    plan.collapsed
      ? COLLAPSED_DAY_WIDTH
      : Math.floor(axisMinutes(axisOf(plan.index)) * pxPerMinute)
  );

  const used =
    widths.reduce((total, width) => total + width, 0) +
    plans.length * DAY_BORDER;

  let spare = available === undefined ? 0 : available - used;
  const open = plans.filter((plan) => !plan.collapsed).length;

  // Bara avrundningens rester, aldrig mer än en pixel per dag. Något större
  // vore ett fel i skalan, och då ska det synas i stället för att smetas ut.
  if (spare < 0 || spare > open) spare = 0;

  let x = 0;

  return plans.map((plan, index) => {
    let width = widths[index];

    if (!plan.collapsed && spare > 0) {
      width += 1;
      spare -= 1;
    }

    x += DAY_BORDER;
    const column = { ...plan, width, left: x };
    x += width;

    return column;
  });
}

/** Tidslinjens hela bredd, från första dagens linje till sista dagens slut. */
export function layoutWidth(columns: DayColumn[]): number {
  const last = columns[columns.length - 1];
  return last ? last.left + last.width : 0;
}

/**
 * Den dag och den minut ett x-läge träffar, räknat från tidslinjens
 * vänsterkant. Skiljelinjerna och hopfällda dagar träffar ingenting.
 *
 * Minuten är snäppt till `snap` och ligger alltid inom dagens axel: ett tryck
 * på dagens sista pixel är dagens sista kvart, inte nästa dags första.
 */
export function dayAt(
  columns: DayColumn[],
  x: number,
  axisOf: (index: number) => DayAxis,
  pxPerMinute: number,
  snap: number
): { index: number; minute: number } | null {
  const column = columns.find(
    (item) => !item.collapsed && x >= item.left && x < item.left + item.width
  );

  if (!column) return null;

  const axis = axisOf(column.index);
  const raw = axis.startMinute + (x - column.left) / Math.max(pxPerMinute, 0.01);
  const snapped = Math.round(raw / snap) * snap;

  // Inom axeln, och aldrig på dess slut: en ruta som börjar när dagen slutar
  // har ingen plats.
  const minute = Math.min(
    Math.max(snapped, axis.startMinute),
    axis.endMinute - snap
  );

  return { index: column.index, minute };
}

/** Avståndet i pixlar från dagens innehållskant till en minut på dess axel. */
export function minuteX(
  axis: DayAxis,
  minute: number,
  pxPerMinute: number
): number {
  return (minute - axis.startMinute) * pxPerMinute;
}

/** Hela timmar på axeln, för linjerna i rutnätet. */
export function hourLines(axis: DayAxis): number[] {
  const lines: number[] = [];

  for (
    let minute = Math.ceil(axis.startMinute / 60) * 60;
    minute < axis.endMinute;
    minute += 60
  ) {
    if (minute > axis.startMinute) lines.push(minute);
  }

  return lines;
}

/**
 * Klockslagen i rubriken, och var de står.
 *
 * Varje etikett står MITT PÅ SIN LINJE, och bara de som får plats inom dagen
 * tas med. Glesas ut när timmarna blir smala, så att etiketterna inte skriver
 * över varandra.
 */
export function axisLabels(
  axis: DayAxis,
  pxPerMinute: number
): { minute: number; x: number }[] {
  const hourPx = pxPerMinute * 60;
  const step = hourPx < 21 ? 180 : hourPx < 42 ? 120 : 60;
  const width = axisMinutes(axis) * pxPerMinute;

  const labels: { minute: number; x: number }[] = [];

  for (
    let minute = Math.ceil(axis.startMinute / step) * step;
    minute < axis.endMinute;
    minute += step
  ) {
    const x = minuteX(axis, minute, pxPerMinute);
    if (x < LABEL_HALF_WIDTH || width - x < LABEL_HALF_WIDTH) continue;
    labels.push({ minute, x });
  }

  return labels;
}
