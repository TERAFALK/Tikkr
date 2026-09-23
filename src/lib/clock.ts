import { Prisma, type TimeEntry } from "@prisma/client";
import { unsafeGlobalPrisma } from "./db";
import { forCompany, type CompanyDb } from "./tenant";
import { nextOccurrenceOf } from "./time-zone";

/**
 * STÄMPLINGSLOGIKEN.
 *
 * Reglerna som avgör om kundens fakturaunderlag stämmer. Allt här är avsiktligt
 * fritt från webb och skärm — det är ren logik som går att testa i detalj.
 *
 * Grundregel: en anställd kan ha högst en öppen stämpling PER ARBETSMOMENT.
 * Stämplar någon in på ett moment hen redan är inne på stängs den förra
 * automatiskt, i samma ögonblick. Stämplar hen in på ett ANNAT moment läggs
 * det till bredvid, och båda löper parallellt.
 *
 * Det är ett medvetet avsteg från den tidigare regeln "högst en öppen
 * stämpling alls". Skälet: en operatör kör ibland två maskiner samtidigt. Går
 * två maskiner en timme är det två maskintimmar, och båda ordrarna ska betala
 * sin — Tikkrs timkostnad sitter på arbetsmomentet, och momentet ÄR maskinen.
 * Att dela timmen på hälften hade gett fel maskinkostnad på båda ordrarna.
 *
 * Skyddet mot dubbelfakturering försvann inte, det smalnade av: aldrig två
 * öppna stämplingar på samma maskin. Den garantin ligger fortfarande i
 * clockIn, och assertNoOverlap vaktar samma sak för tider som skrivs in för
 * hand.
 *
 * Databasen kan inte uttrycka regeln själv — prisma db push saknar partiella
 * unika index — så den vaktas här, och clock.ts är enda vägen in.
 */

export class ClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClockError";
  }
}

export interface PunchContext {
  /** Vilken fysisk skärm trycket kom ifrån. Sparas för audit-loggen. */
  kioskDeviceId?: string;
  sourceIp?: string;
  /**
   * När trycket faktiskt skedde. Utelämnas normalt (då gäller "nu"), men
   * sätts av offline-kön: en stämpling som gjorts kl 07:00 utan nät ska
   * registreras på 07:00, inte på klockslaget då nätet kom tillbaka.
   */
  at?: Date;
  /**
   * Skärmens eget id för trycket. Skickas en stämpling om flera gånger
   * — vilket offline-kön gör om kvittensen tappas — känns den igen på det här
   * och registreras bara en gång.
   */
  clientPunchId?: string;
  /** true när stämplingen kommer från offline-kön. Syns i audit-loggen. */
  fromOfflineQueue?: boolean;
}

export interface ClockInInput extends PunchContext {
  employeeId: string;
  orderId: string;
  momentId: string;
}

export interface ClockInResult {
  /** Den nya, pågående stämplingen. */
  started: TimeEntry;
  /** Det föregående jobbet som stängdes automatiskt, om det fanns något. */
  autoClosed: TimeEntry | null;
  /** true om stämplingen redan fanns sedan tidigare (omsändning från kön). */
  wasDuplicate: boolean;
}

/**
 * Alla pågående stämplingar för en anställd, senast startad först.
 *
 * Returnerar en LISTA och inte en post. Den som bara vill ha "den öppna"
 * tvingas därmed bestämma sig för vad som ska hända när det finns två, i
 * stället för att tyst få den ena.
 */
export async function getOpenEntries(
  db: CompanyDb,
  employeeId: string
): Promise<TimeEntry[]> {
  return db.timeEntry.findMany({
    where: { employeeId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
}

/** Den pågående stämplingen på ett bestämt arbetsmoment, eller null. */
export async function getOpenEntryForMoment(
  db: CompanyDb,
  employeeId: string,
  momentId: string
): Promise<TimeEntry | null> {
  return db.timeEntry.findFirst({
    where: { employeeId, momentId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
}

/**
 * Stämplar in på ett jobb.
 *
 * Pågår redan ett jobb på SAMMA arbetsmoment stängs det automatiskt först —
 * en maskin kan bara köra ett jobb i taget. Pågår jobb på andra moment lämnas
 * de i fred och löper vidare parallellt.
 *
 * Allt sker i en transaktion: antingen stängs det gamla OCH öppnas det nya,
 * eller så händer ingenting. Utan det skulle ett avbrott mitt i kunna lämna
 * någon med två öppna stämplingar på samma maskin.
 */
export async function clockIn(
  companyId: string,
  input: ClockInInput
): Promise<ClockInResult> {
  const at = input.at ?? new Date();
  const db = forCompany(companyId);

  if (input.clientPunchId) {
    const existing = await db.timeEntry.findFirst({
      where: { clientPunchId: input.clientPunchId },
    });
    if (existing) {
      // Skärmen skickade om en stämpling den redan fått registrerad.
      return { started: existing, autoClosed: null, wasDuplicate: true };
    }
  }

  const { momentCostRateOre } = await assertBelongsToCompany(db, input);

  return db.$transaction(async (tx) => {
    // Bara samma moment. Ett pågående jobb på en ANNAN maskin ska stå kvar —
    // det är hela poängen med att kunna köra två.
    const open = await tx.timeEntry.findFirst({
      where: {
        employeeId: input.employeeId,
        momentId: input.momentId,
        clockOutAt: null,
      },
      orderBy: { clockInAt: "desc" },
    });

    let autoClosed: TimeEntry | null = null;

    if (open) {
      if (open.clockInAt > at) {
        // Kan hända när offline-kön levererar tryck i fel ordning.
        throw new ClockError(
          "Stämplingen ligger före den pågående stämplingens starttid. " +
            "Registrera i rätt ordning eller låt en administratör rätta posten."
        );
      }

      // `source` rörs inte: den beskriver hur posten SKAPADES, inte hur den
      // stängdes. Här stängdes den av att den anställde själv började ett nytt
      // jobb på samma maskin — en helt normal utstämpling som admin inte
      // behöver titta på.
      autoClosed = await tx.timeEntry.update({
        where: { id: open.id },
        data: { clockOutAt: at },
      });
    }

    const started = await tx.timeEntry.create({
      data: {
        // companyId anges uttryckligen eftersom Prismas typer kräver det.
        // Filtreringslagret kontrollerar att det stämmer med klienten och
        // vägrar annars — se src/lib/tenant.ts.
        companyId,
        employeeId: input.employeeId,
        orderId: input.orderId,
        momentId: input.momentId,
        clockInAt: at,
        // Kopian av momentets timkostnad. Se schemat: en senare prishöjning
        // får inte ändra en kalkyl som redan tagits ut och fakturerats.
        costRateOre: momentCostRateOre,
        source: input.fromOfflineQueue ? "KIOSK_OFFLINE_SYNC" : "KIOSK",
        kioskDeviceId: input.kioskDeviceId ?? null,
        sourceIp: input.sourceIp ?? null,
        clientPunchId: input.clientPunchId ?? null,
      },
    });

    return { started, autoClosed, wasDuplicate: false };
  });
}

/**
 * Stämplar ut från ett pågående jobb.
 *
 * `momentId` pekar ut vilket. Kiosken skickar alltid med det — momentet och
 * inte postens id, eftersom en post som skapats offline ännu inte har något
 * id när utstämplingen köas.
 *
 * Finns ingen öppen stämpling händer ingenting och `null` returneras. Det är
 * med flit: trycker någon "stämpla ut" två gånger ska det inte bli ett fel på
 * skärmen, bara ingen ytterligare effekt.
 *
 * UTAN momentId, och med flera jobb igång, är anropet tvetydigt. Då stängs det
 * senast startade OCH posten flaggas för granskning. Den utvägen är vald med
 * öppna ögon: ett fel här skulle ge 409 från API:t, och offline-kön KASTAR ett
 * tryck som får 4xx. Ett tvetydigt anrop får kosta en rad i granskningslistan.
 * Det får aldrig kosta arbetstid.
 *
 * Fallet uppstår för tryck som köats av en äldre skärm, innan momentet började
 * skickas med. Sådana ligger kvar i IndexedDB på riktiga skärmar, så det är
 * inte ett teoretiskt fall.
 */
export async function clockOut(
  companyId: string,
  input: PunchContext & { employeeId: string; momentId?: string }
): Promise<TimeEntry | null> {
  const at = input.at ?? new Date();
  const db = forCompany(companyId);

  if (input.clientPunchId) {
    const existing = await db.timeEntry.findFirst({
      where: { clientPunchId: input.clientPunchId },
    });
    if (existing) return existing;
  }

  const open = await getOpenEntries(db, input.employeeId);
  if (open.length === 0) return null;

  let target: TimeEntry;
  let ambiguous = false;

  if (input.momentId) {
    const onMoment = open.find((entry) => entry.momentId === input.momentId);
    // Redan utstämplad från just det jobbet. Ingen effekt, inget fel.
    if (!onMoment) return null;
    target = onMoment;
  } else {
    target = open[0];
    ambiguous = open.length > 1;
  }

  if (target.clockInAt > at) {
    throw new ClockError(
      "Utstämplingen ligger före instämplingen. Låt en administratör rätta posten."
    );
  }

  return db.timeEntry.update({
    where: { id: target.id },
    data: {
      clockOutAt: at,
      ...(ambiguous
        ? {
            needsReview: true,
            reviewNote:
              `Utstämplingen angav inte vilket jobb den gällde, och ${open.length} ` +
              `jobb pågick. Det senast påbörjade stängdes. Kontrollera vilket ` +
              `som faktiskt avslutades innan fakturering.`,
          }
        : {}),
    },
  });
}

/**
 * Stämplar ut från ALLA pågående jobb.
 *
 * Finns för dagens slut. Den som kört två maskiner ska inte behöva två tryck
 * för att gå hem, och ett glömt andra jobb blir en post som räknas upp hela
 * natten tills den automatiska utstämplingen tar den.
 *
 * Inget flaggas: avsikten är otvetydig, till skillnad från en utstämpling utan
 * angivet jobb.
 */
export async function clockOutAll(
  companyId: string,
  input: PunchContext & { employeeId: string }
): Promise<TimeEntry[]> {
  const at = input.at ?? new Date();
  const db = forCompany(companyId);

  if (input.clientPunchId) {
    const existing = await db.timeEntry.findFirst({
      where: { clientPunchId: input.clientPunchId },
    });
    if (existing) return [existing];
  }

  const open = await getOpenEntries(db, input.employeeId);
  const closed: TimeEntry[] = [];

  for (const entry of open) {
    // En post som börjar efter "nu" hoppas över i stället för att avbryta
    // hela utstämplingen. De andra jobben ska stängas även om ett är trasigt.
    if (entry.clockInAt > at) continue;

    closed.push(
      await db.timeEntry.update({
        where: { id: entry.id },
        data: { clockOutAt: at },
      })
    );
  }

  return closed;
}

/**
 * Stänger stämplingar som ingen stämplat ut från.
 *
 * Körs återkommande (t.ex. varje kvart). För varje öppen stämpling räknas ut
 * när företagets klockslag nästa gång inföll efter instämplingen — har den
 * tidpunkten passerat stängs posten där.
 *
 * Posten flaggas ALLTID för granskning. Systemet vet inte när personen
 * verkligen slutade; det gissar för att fakturaunderlaget ska bli användbart,
 * och talar om att det gissat.
 */
export async function autoCloseForgottenEntries(
  companyId: string,
  now: Date = new Date()
): Promise<TimeEntry[]> {
  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: companyId },
    select: { autoCloseAt: true, timezone: true },
  });

  if (!company) {
    throw new ClockError(`Hittar inget företag med id "${companyId}".`);
  }

  const db = forCompany(companyId);
  const open = await db.timeEntry.findMany({ where: { clockOutAt: null } });

  const closed: TimeEntry[] = [];

  for (const entry of open) {
    const deadline = nextOccurrenceOf(
      company.autoCloseAt,
      entry.clockInAt,
      company.timezone
    );

    if (now < deadline) continue;

    closed.push(
      await db.timeEntry.update({
        where: { id: entry.id },
        data: {
          clockOutAt: deadline,
          source: "AUTO_CLOSE",
          needsReview: true,
          reviewNote:
            `Automatiskt utstämplad ${company.autoCloseAt} — ingen utstämpling ` +
            `registrerades. Kontrollera tiden innan fakturering.`,
        },
      })
    );
  }

  return closed;
}

/* --- Avsluta en order ---------------------------------------------------- */

export interface OpenEntryOnOrder {
  entryId: string;
  employeeName: string;
  /** Vilket arbetsmoment. Samma person kan vara inne på två på samma order. */
  momentName: string;
  clockInAt: Date;
}

/**
 * Vilka som står instämplade på en order just nu.
 *
 * Används innan en order stängs. Stänger man en order med pågående stämplingar
 * på sig blir de hängande: kiosken vägrar nya instämplingar på en stängd order,
 * men den redan öppna posten fortsätter räknas upp tills den automatiska
 * utstämplingen tar den på kvällen. Tiden hamnar då på en avslutad order utan
 * att någon vet om det, vilket är ett fakturafel.
 */
export async function openEntriesOnOrder(
  companyId: string,
  orderId: string
): Promise<OpenEntryOnOrder[]> {
  const db = forCompany(companyId);

  const open = await db.timeEntry.findMany({
    where: { orderId, clockOutAt: null },
    orderBy: { clockInAt: "asc" },
    select: {
      id: true,
      clockInAt: true,
      employee: { select: { name: true } },
      moment: { select: { name: true } },
    },
  });

  return open.map((entry) => ({
    entryId: entry.id,
    employeeName: entry.employee.name,
    momentName: entry.moment.name,
    clockInAt: entry.clockInAt,
  }));
}

/**
 * Stänger en order och stämplar ut dem som står kvar på den.
 *
 * Posterna flaggas för granskning. Systemet vet inte när arbetet faktiskt
 * slutade — det vet bara att ordern avslutades — och ska därför inte låtsas
 * att tiden är färdig att fakturera. Samma hållning som vid automatisk
 * utstämpling: gissa hellre öppet än tyst.
 *
 * `source` rörs inte. Det fältet beskriver hur posten SKAPADES, inte hur den
 * stängdes.
 *
 * Allt sker i en transaktion. Skulle ordern stängas utan att utstämplingarna
 * gick igenom vore läget värre än innan: en stängd order med pågående tid som
 * ingen längre kan stämpla ut från i kiosken.
 */
export async function closeOrder(
  companyId: string,
  orderId: string,
  options: { byEmail: string; at?: Date }
): Promise<{ clockedOut: number }> {
  const at = options.at ?? new Date();
  const db = forCompany(companyId);

  const order = await db.order.findFirst({
    where: { id: orderId },
    select: { orderNumber: true },
  });

  if (!order) throw new ClockError("Okänd order.");

  return db.$transaction(async (tx) => {
    const open = await tx.timeEntry.findMany({
      where: { orderId, clockOutAt: null },
      select: { id: true, clockInAt: true },
    });

    for (const entry of open) {
      // En stämpling som börjar efter "nu" kan inte stängas på "nu" — det
      // hade gett en post med negativ längd. Inträffar när en skärm har fel
      // klocka; se klockskev-kontrollen i api/kiosk/punch. Då stängs posten
      // på sin egen starttid, alltså noll minuter, och granskningen får
      // avgöra vad som egentligen hände.
      const clockOutAt = entry.clockInAt > at ? entry.clockInAt : at;

      await tx.timeEntry.update({
        where: { id: entry.id },
        data: {
          clockOutAt,
          needsReview: true,
          reviewNote:
            `Utstämplad när order ${order.orderNumber} avslutades av ` +
            `${options.byEmail}. Systemet vet inte när arbetet faktiskt ` +
            `slutade — kontrollera tiden innan fakturering.`,
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: "CLOSED" },
    });

    return { clockedOut: open.length };
  });
}

export interface ManualEntryInput {
  employeeId: string;
  orderId: string;
  momentId: string;
  clockInAt: Date;
  clockOutAt: Date;
  /** Vem som skrev in den. Hamnar i review_note så det syns i efterhand. */
  byEmail: string;
}

/**
 * Lägger in en stämpling för hand.
 *
 * Behövs när någon glömt stämpla IN. Då finns ingen post alls att rätta, och
 * timmarna går annars inte att fakturera — vilket i praktiken händer oftare än
 * glömd utstämpling, eftersom man är stressad när man börjar.
 *
 * Posten märks som ADMIN_MANUAL. En tid någon skrivit in ska aldrig gå att
 * förväxla med en riktig stämpling, varken i rapporter eller i en framtida
 * diskussion om en faktura.
 */
export async function createManualEntry(
  companyId: string,
  input: ManualEntryInput
): Promise<TimeEntry> {
  const db = forCompany(companyId);

  const { momentCostRateOre } = await assertBelongsToCompany(db, input, {
    historical: true,
  });
  assertSaneInterval(input.clockInAt, input.clockOutAt);
  await assertNoOverlap(
    db,
    input.employeeId,
    input.momentId,
    input.clockInAt,
    input.clockOutAt
  );

  return db.timeEntry.create({
    data: {
      companyId,
      employeeId: input.employeeId,
      orderId: input.orderId,
      momentId: input.momentId,
      clockInAt: input.clockInAt,
      clockOutAt: input.clockOutAt,
      // Momentets timkostnad som den är NU. En tid som skrivs in i efterhand
      // saknar egen historia — det enda systemet vet är vad momentet kostar
      // idag, och att gissa något annat vore att hitta på.
      costRateOre: momentCostRateOre,
      source: "ADMIN_MANUAL",
      needsReview: false,
      reviewNote: `Inlagd för hand av ${input.byEmail}.`,
    },
  });
}

/** Ändrar en befintlig stämpling. Samma kontroller som vid nyinlägg. */
export async function updateEntryManually(
  companyId: string,
  entryId: string,
  input: ManualEntryInput
): Promise<TimeEntry> {
  const db = forCompany(companyId);

  const { momentCostRateOre } = await assertBelongsToCompany(db, input, {
    historical: true,
  });
  assertSaneInterval(input.clockInAt, input.clockOutAt);
  await assertNoOverlap(
    db,
    input.employeeId,
    input.momentId,
    input.clockInAt,
    input.clockOutAt,
    entryId
  );

  return db.timeEntry.update({
    where: { id: entryId },
    data: {
      employeeId: input.employeeId,
      orderId: input.orderId,
      momentId: input.momentId,
      clockInAt: input.clockInAt,
      clockOutAt: input.clockOutAt,
      // Följer med momentet. Flyttas posten till ett annat arbetsmoment ska
      // den också kosta det momentets timpris — annars hade kalkylen visat
      // svetsning till måleripris.
      costRateOre: momentCostRateOre,
      source: "ADMIN_MANUAL",
      needsReview: false,
      reviewNote: `Ändrad för hand av ${input.byEmail}.`,
    },
  });
}

/** Rimlighetskontroll av ett tidsintervall. */
function assertSaneInterval(from: Date, to: Date) {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ClockError("Ogiltigt datum eller klockslag.");
  }

  if (to <= from) {
    throw new ClockError("Sluttiden måste ligga efter starttiden.");
  }

  const hours = (to.getTime() - from.getTime()) / 3_600_000;
  if (hours > 24) {
    throw new ClockError(
      "Stämplingen är längre än ett dygn. Dela upp den på flera poster."
    );
  }
}

/**
 * Vägrar om tiden krockar med en annan stämpling på SAMMA ARBETSMOMENT.
 *
 * Detta är den regel som skyddar fakturaunderlaget. Den prövar momentet och
 * inte bara personen, eftersom en operatör kan köra två maskiner samtidigt —
 * se grundregeln överst i filen. Två jobb på olika moment får därför överlappa;
 * två jobb på samma moment får det aldrig, för då skulle en och samma maskin
 * fakturera samma timme till två kunder.
 *
 * Kioskflödet kan inte skapa överlapp på samma moment — clockIn stänger det
 * pågående. Men en admin som skriver in tider för hand kan, och gör det lätt
 * när hen minns fel.
 */
async function assertNoOverlap(
  db: CompanyDb,
  employeeId: string,
  momentId: string,
  from: Date,
  to: Date,
  ignoreEntryId?: string
) {
  const clash = await db.timeEntry.findFirst({
    where: {
      employeeId,
      momentId,
      id: ignoreEntryId ? { not: ignoreEntryId } : undefined,
      // Två intervall överlappar om det ena börjar innan det andra slutar,
      // och slutar efter att det andra börjat.
      clockInAt: { lt: to },
      OR: [{ clockOutAt: null }, { clockOutAt: { gt: from } }],
    },
    select: {
      clockInAt: true,
      clockOutAt: true,
      order: { select: { orderNumber: true } },
      moment: { select: { name: true } },
    },
  });

  if (clash) {
    throw new ClockError(
      `Tiden krockar med en annan stämpling på ${clash.moment.name}, ` +
        `order ${clash.order.orderNumber}` +
        (clash.clockOutAt ? "" : " som fortfarande pågår") +
        ". Samma arbetsmoment kan inte köra två jobb samtidigt."
    );
  }
}

/**
 * Kontrollerar att anställd, order och moment finns hos företaget och går att
 * stämpla på. Utan detta skulle ett trasigt eller manipulerat anrop kunna
 * skapa en stämpling som pekar på ingenting.
 *
 * `historical` används när admin rättar historik i efterhand. Då tillåts
 * stängda ordrar och avaktiverade anställda — tiden lades ju ner när de
 * fortfarande var öppna respektive anställda, och den ska gå att registrera
 * även om det upptäcks först efteråt.
 */
async function assertBelongsToCompany(
  db: CompanyDb,
  input: { employeeId: string; orderId: string; momentId: string },
  options: { historical?: boolean } = {}
): Promise<{ momentCostRateOre: number | null }> {
  const [employee, order, moment] = await Promise.all([
    db.employee.findFirst({ where: { id: input.employeeId } }),
    db.order.findFirst({ where: { id: input.orderId } }),
    db.workMoment.findFirst({ where: { id: input.momentId } }),
  ]);

  if (!employee) throw new ClockError("Okänd anställd.");
  if (!order) throw new ClockError("Okänd order.");
  if (!moment) throw new ClockError("Okänt arbetsmoment.");

  // Momentet är redan hämtat, så timkostnaden följer med gratis. Den läses
  // här och inte vid skrivningen, för att slippa en fråga till.
  const result = { momentCostRateOre: moment.costRateOre };

  if (options.historical) return result;

  if (!employee.active) throw new ClockError("Den anställde är inte aktiv.");
  if (order.status === "CLOSED") throw new ClockError("Ordern är stängd.");
  if (!moment.active) throw new ClockError("Arbetsmomentet är inte aktivt.");

  return result;
}

/** Prismas felkod för brott mot en unik-regel. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}
