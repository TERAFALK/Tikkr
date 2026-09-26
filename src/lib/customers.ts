import type { CompanyDb } from "./tenant";
import { minutesBetween } from "./format";
import { costForMinutes } from "./money";
import { priceForOrder } from "./order-price";
import { wallTimeIn } from "./time-zone";

/**
 * KUNDREGISTRET.
 *
 * Ersatte fritextfältet `Order.customerName` 2026-09-26. Tre saker blev
 * möjliga: kunden går att fråga om, namnet stavas likadant överallt, och
 * uppgifterna behöver inte skrivas för hand på varje underlag.
 *
 * EN normalisering, här. Före registret fanns tre olika regler — en i
 * `quick-order.ts`, en i orderformuläret, en i uppstartsguiden — plus en
 * längdgräns som bara gällde kiosken. Tre regler för samma sak är tre chanser
 * att två stavningar av samma kund blir två kunder.
 */

/** Så långt ett kundnamn får vara. Rymmer vilket företagsnamn som helst. */
export const MAX_NAME = 120;

/** Så långt ett fritt fält får vara. Gäller adress, kontakt, anteckning. */
export const MAX_FIELD = 200;

/**
 * Städar ett inskrivet värde.
 *
 * Trimmar, slår ihop upprepade mellanslag och gör tomt till null. "Volvo  AB "
 * och "Volvo AB" ska aldrig kunna bli två kunder på grund av ett tangentbord.
 */
export function clean(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

  return text || null;
}

export interface CustomerOption {
  id: string;
  label: string;
  hint?: string;
}

/**
 * Kunderna som går att välja, för väljaren i orderformulären.
 *
 * Bara aktiva. En avaktiverad kund behåller sina gamla ordrar men ska inte gå
 * att lägga nya på — det är hela innebörden av att avaktivera den.
 *
 * Kundnumret följer med som `hint`, så att det går att söka på det. Den som
 * har numret på en följesedel ska slippa gissa stavningen av namnet.
 */
export async function customerOptions(
  db: CompanyDb
): Promise<CustomerOption[]> {
  const customers = await db.customer.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, customerNumber: true, orgNumber: true },
  });

  return customers.map((customer) => ({
    id: customer.id,
    label: customer.name,
    // Org.nr står inte här men söks i — se searchCustomers. På en rad i en
    // lista vore det brus; i en sökning är det precis vad man skriver när två
    // kunder heter nästan samma sak.
    hint: customer.customerNumber ?? undefined,
  }));
}

/**
 * Kunden ett formulär pekat ut, eller null.
 *
 * Slår upp genom det filtrerade lagret i stället för att lita på id:t. Ett id
 * kommer från ett formulär, och en order ska inte kunna peka på en kund som
 * inte finns — eller som hör till ett annat företag.
 *
 * Avaktiverade kunder GÅR att välja här, till skillnad från i kiosken. Admin
 * rättar ibland en gammal order, och då är kunden den som gällde då.
 */
export async function resolveCustomerId(
  db: CompanyDb,
  value: FormDataEntryValue | null
): Promise<string | null> {
  const id = String(value ?? "").trim();
  if (!id) return null;

  const customer = await db.customer.findFirst({
    where: { id },
    select: { id: true },
  });

  return customer?.id ?? null;
}

/**
 * Fritextsökning i registret.
 *
 * Söker i namn, kundnummer och org.nr. Skiftlägesokänsligt — projektets första
 * `mode: "insensitive"`, och skälet är just det problem registret löser: den
 * som skriver "volvo" ska hitta "Volvo Lastvagnar".
 *
 * Tom sökning ger hela registret. Filtret är till för att hitta något, inte
 * för att dölja allt tills man skrivit.
 */
export async function searchCustomers(
  db: CompanyDb,
  query: string | undefined
): Promise<
  {
    id: string;
    name: string;
    customerNumber: string | null;
    orgNumber: string | null;
    city: string | null;
    active: boolean;
    orders: number;
  }[]
> {
  const needle = query?.trim();

  const customers = await db.customer.findMany({
    where: needle
      ? {
          OR: [
            { name: { contains: needle, mode: "insensitive" } },
            { customerNumber: { contains: needle, mode: "insensitive" } },
            { orgNumber: { contains: needle, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      customerNumber: true,
      orgNumber: true,
      city: true,
      active: true,
      _count: { select: { orders: true } },
    },
  });

  return customers.map(({ _count, ...customer }) => ({
    ...customer,
    orders: _count.orders,
  }));
}

/** En order på kundsidan, med nedlagd tid. */
export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  minutes: number;
  entries: number;
  isQuickJob: boolean;
}

export interface CustomerDetail {
  id: string;
  name: string;
  customerNumber: string | null;
  orgNumber: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  notes: string | null;
  markupPercent: number | null;
  discountPercent: number | null;
  active: boolean;
}

export interface CustomerStats {
  orders: CustomerOrder[];
  openOrders: number;
  totalMinutes: number;
  /** Tid per arbetsmoment, mest tid först. Vilka maskiner kunden belastar. */
  byMoment: { name: string; minutes: number }[];
}

/** Kunden, eller null när id:t inte finns hos företaget. */
export async function getCustomer(
  db: CompanyDb,
  id: string
): Promise<CustomerDetail | null> {
  return db.customer.findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      customerNumber: true,
      orgNumber: true,
      contactName: true,
      email: true,
      phone: true,
      addressLine: true,
      postalCode: true,
      city: true,
      notes: true,
      markupPercent: true,
      discountPercent: true,
      active: true,
    },
  });
}

/**
 * Kundens ordrar och tid.
 *
 * Räknas fram ur stämplingarna vid varje besök. Ingenting cachas, så en rättad
 * post slår igenom bakåt — och en siffra som inte stämmer med rapporten för
 * samma period är ett fel, inte en gammal uträkning.
 *
 * ÖPPNA ORDRAR FÖRST. Det är dem man har en fråga om; de avslutade tittar man
 * på för att jämföra med något.
 *
 * Improduktiv tid kan aldrig ha en order och finns därför inte här. Filtret
 * står ändå utskrivet i frågan, av samma skäl som i order-export.ts: det säger
 * vad frågan handlar om och kostar ingenting.
 */
export async function customerStats(
  db: CompanyDb,
  customerId: string
): Promise<CustomerStats> {
  const orders = await db.order.findMany({
    where: { customerId },
    orderBy: [{ status: "asc" }, { orderNumber: "asc" }],
    select: {
      id: true,
      orderNumber: true,
      status: true,
      isQuickJob: true,
      timeEntries: {
        where: { kind: "ORDER" },
        select: {
          clockInAt: true,
          clockOutAt: true,
          moment: { select: { name: true } },
        },
      },
    },
  });

  const byMoment = new Map<string, number>();
  let totalMinutes = 0;

  const rows: CustomerOrder[] = orders.map((order) => {
    let minutes = 0;

    for (const entry of order.timeEntries) {
      const length = minutesBetween(entry.clockInAt, entry.clockOutAt);
      minutes += length;

      const name = entry.moment?.name ?? "Okänt arbetsmoment";
      byMoment.set(name, (byMoment.get(name) ?? 0) + length);
    }

    totalMinutes += minutes;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      minutes,
      entries: order.timeEntries.length,
      isQuickJob: order.isQuickJob,
    };
  });

  return {
    orders: rows,
    openOrders: rows.filter((order) => order.status === "OPEN").length,
    totalMinutes,
    byMoment: [...byMoment.entries()]
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

export interface CustomerMonth {
  /** "sep", för grafens etikett. */
  label: string;
  marginOre: number;
}

export interface CustomerMoney {
  costOre: number;
  priceOre: number;
  marginOre: number;
  /** Marginal i år och förra året, i företagets tidszon. */
  thisYearOre: number;
  lastYearOre: number;
  /** Tid utan timkostnad. Är den större än noll är siffrorna ofullständiga. */
  minutesWithoutRate: number;
  /** Tolv månader bakåt, äldst först. */
  months: CustomerMonth[];
}

/**
 * VAD KUNDEN KOSTAT OCH GETT.
 *
 * Internt, som efterkalkylen. Når aldrig ett dokument som går till kunden —
 * den gränsen vaktas i order-price.ts.
 *
 * FASTPRISORDRAR FÖRDELAS EFTER KOSTNADEN varje månad. Ett avtalat pris hör
 * inte till en enskild månad, och att lägga hela beloppet på månaden då sista
 * stämplingen gjordes hade gett en graf med en pik och elva tomma staplar.
 * Andelen kostnad är det vanliga sättet att redovisa en fastprisorder, och för
 * löpande ordrar blir det exakt proportionellt ändå — priset är linjärt i
 * kostnaden.
 *
 * Rader utan timkostnad räknas inte som gratis arbete. De redovisas som saknad
 * tid, så att en ofullständig kalkyl syns i stället för att se färdig ut.
 */
export async function customerMoney(
  db: CompanyDb,
  customerId: string,
  companyMarkupPercent: number,
  timeZone: string,
  now: Date = new Date()
): Promise<CustomerMoney> {
  const customer = await db.customer.findFirst({
    where: { id: customerId },
    select: { markupPercent: true, discountPercent: true },
  });

  const orders = await db.order.findMany({
    where: { customerId },
    select: {
      id: true,
      markupPercent: true,
      fixedPriceOre: true,
      timeEntries: {
        where: { kind: "ORDER" },
        select: {
          clockInAt: true,
          clockOutAt: true,
          momentCostRateOre: true,
          employeeCostRateOre: true,
        },
      },
    },
  });

  // Tolv månader bakåt, äldst först. Nycklarna är år-månad i företagets
  // tidszon — inte serverns, som kör UTC och skulle lägga en kvällsstämpling
  // i nästa månad den sista i månaden.
  const buckets = monthBuckets(now, timeZone);
  const marginByMonth = new Map<string, number>();

  const wall = wallTimeIn(now, timeZone);
  let costOre = 0;
  let priceOre = 0;
  let thisYearOre = 0;
  let lastYearOre = 0;
  let minutesWithoutRate = 0;

  for (const order of orders) {
    const costByMonth = new Map<string, number>();
    const costByYear = new Map<number, number>();
    let orderCost = 0;

    for (const entry of order.timeEntries) {
      const minutes = minutesBetween(entry.clockInAt, entry.clockOutAt);

      const rate =
        entry.employeeCostRateOre === null && entry.momentCostRateOre === null
          ? null
          : (entry.employeeCostRateOre ?? 0) + (entry.momentCostRateOre ?? 0);

      if (rate === null) {
        minutesWithoutRate += minutes;
        continue;
      }

      const cost = costForMinutes(minutes, rate);
      orderCost += cost;

      const when = wallTimeIn(entry.clockInAt, timeZone);
      const key = monthKey(when.year, when.month);
      costByMonth.set(key, (costByMonth.get(key) ?? 0) + cost);
      costByYear.set(when.year, (costByYear.get(when.year) ?? 0) + cost);
    }

    const price = priceForOrder({
      costOre: orderCost,
      orderMarkupPercent: order.markupPercent,
      customerMarkupPercent: customer?.markupPercent ?? null,
      companyMarkupPercent,
      customerDiscountPercent: customer?.discountPercent ?? null,
      fixedPriceOre: order.fixedPriceOre,
    });

    costOre += orderCost;
    priceOre += price.priceOre;

    // Utan kostnad finns ingen andel att fördela efter. En fastprisorder som
    // ingen stämplat på hör inte till någon månad än.
    if (orderCost === 0) continue;

    const margin = price.priceOre - orderCost;

    for (const [key, cost] of costByMonth) {
      marginByMonth.set(
        key,
        (marginByMonth.get(key) ?? 0) + (margin * cost) / orderCost
      );
    }

    for (const [year, cost] of costByYear) {
      const share = (margin * cost) / orderCost;
      if (year === wall.year) thisYearOre += share;
      else if (year === wall.year - 1) lastYearOre += share;
    }
  }

  return {
    costOre,
    priceOre,
    marginOre: priceOre - costOre,
    thisYearOre: Math.round(thisYearOre),
    lastYearOre: Math.round(lastYearOre),
    minutesWithoutRate,
    months: buckets.map(({ key, label }) => ({
      label,
      marginOre: Math.round(marginByMonth.get(key) ?? 0),
    })),
  };
}

const MONTH_LABELS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** De tolv senaste månaderna, äldst först. Räknat på väggen. */
function monthBuckets(
  now: Date,
  timeZone: string
): { key: string; label: string }[] {
  const wall = wallTimeIn(now, timeZone);
  const buckets: { key: string; label: string }[] = [];

  for (let back = 11; back >= 0; back -= 1) {
    // Via UTC för att slippa hantera års- och månadsskiften för hand.
    const at = new Date(Date.UTC(wall.year, wall.month - 1 - back, 1));
    const year = at.getUTCFullYear();
    const month = at.getUTCMonth() + 1;

    buckets.push({
      key: monthKey(year, month),
      label: MONTH_LABELS[month - 1],
    });
  }

  return buckets;
}
