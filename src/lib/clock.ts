import { Prisma, type TimeEntry } from "@prisma/client";
import { unsafeGlobalPrisma } from "./db";
import { forCompany, type CompanyDb } from "./tenant";
import { nextOccurrenceOf } from "./time-zone";
import { describeEntry } from "./entry-label";

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

/**
 * Vilket jobb en stämpling gäller.
 *
 * En diskriminerad union och inte fyra valfria fält. Det gör att man inte kan
 * skapa en post utan att ha bestämt vad den är, och att TypeScript vägrar läsa
 * ett ordernummer på improduktiv tid.
 */
export type JobRef =
  | { kind: "ORDER"; orderId: string; momentId: string }
  | { kind: "INDIRECT"; indirectMomentId: string };

export type ClockInInput = PunchContext & { employeeId: string } & JobRef;

/**
 * Självkostnaden som kopieras till stämplingen.
 *
 * Två satser som LÄGGS IHOP: människan och maskinen. Verkstaden betalar för
 * båda samtidigt, och kalkylen ska kunna visa dem var för sig — ett belopp som
 * inte går att bryta ned går inte att förklara.
 *
 * null betyder att satsen inte var angiven, inte att den var noll.
 */
export interface CostRates {
  momentCostRateOre: number | null;
  employeeCostRateOre: number | null;
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

  const rates = await assertBelongsToCompany(db, input);

  return db.$transaction(async (tx) => {
    // Bara samma moment. Ett pågående jobb på en ANNAN maskin ska stå kvar —
    // det är hela poängen med att kunna köra två.
    const open = await tx.timeEntry.findFirst({
      where: {
        employeeId: input.employeeId,
        ...jobKey(input),
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
        ...jobFields(input),
        clockInAt: at,
        // Kopior av personens och maskinens timkostnad. Se schemat: en senare
        // prishöjning får inte ändra en kalkyl som redan tagits ut och
        // fakturerats.
        ...rates,
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
  input: PunchContext & {
    employeeId: string;
    /** Arbetsmomentet, när det är ordertid som ska stängas. */
    momentId?: string;
    /** Det improduktiva momentet, när det är sådan tid som ska stängas. */
    indirectMomentId?: string;
  }
): Promise<TimeEntry | null> {
  const at = input.at ?? new Date();
  const db = forCompany(companyId);

  // Dubblettskyddet slår mot clockOutPunchId och inte clientPunchId. Det
  // senare bär postens INSTÄMPLING, och letade man där kunde uppslaget aldrig
  // träffa — vilket var precis felet: skyddet såg ut att finnas men gjorde
  // ingenting.
  if (input.clientPunchId) {
    const alreadyApplied = await db.timeEntry.findFirst({
      where: { clockOutPunchId: input.clientPunchId },
    });
    if (alreadyApplied) return alreadyApplied;
  }

  const open = await getOpenEntries(db, input.employeeId);
  if (open.length === 0) return null;

  let target: TimeEntry;
  let ambiguous = false;

  const wanted = input.momentId ?? input.indirectMomentId;

  if (wanted) {
    const onJob = open.find((entry) =>
      input.momentId
        ? entry.momentId === input.momentId
        : entry.indirectMomentId === input.indirectMomentId
    );
    // Redan utstämplad från just det jobbet. Ingen effekt, inget fel.
    if (!onJob) return null;
    target = onJob;
  } else {
    target = open[0];
    ambiguous = open.length > 1;
  }

  // Posten började EFTER trycket gjordes. Då gäller trycket inte den här
  // posten — det är en gammal utstämpling ur kön vars egen post redan hunnit
  // stängas, och personen har startat något nytt sedan dess.
  //
  // Ingenting stängs, och inget fel kastas. Ett fel hade gett 409, och
  // offline-kön plockar bort tryck som får 4xx — då vore trycket borta OCH
  // det nya jobbet felaktigt stängt. Att göra ingenting är rätt svar: den post
  // trycket gällde är redan avslutad.
  if (target.clockInAt > at) return null;

  // VILLKORET `clockOutAt: null` ÄR SJÄLVA POÄNGEN med updateMany här.
  //
  // Mellan uppslaget ovan och den här skrivningen kan posten ha hunnit stängas
  // av ett annat anrop — samma tryck som nått servern två gånger, eller två
  // flikar som tömmer samma offline-kö. Ett rakt `update` hade då skrivit över
  // den redan satta sluttiden med en annan, och ingen hade sett det.
  //
  // Med villkoret i frågan avgör databasen vem som vinner, inte turordningen
  // mellan läsning och skrivning. Den som kommer sist träffar noll rader och
  // får tillbaka posten som den blev — inget fel, eftersom utstämplingen
  // faktiskt är gjord.
  await db.timeEntry.updateMany({
    where: { id: target.id, clockOutAt: null },
    data: {
      clockOutAt: at,
      clockOutPunchId: input.clientPunchId ?? null,
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

  // Läses om i stället för att returnera det vi tänkte skriva. Träffade
  // skrivningen noll rader hann någon annan före, och då är det den andres
  // sluttid som gäller — inte vår.
  return db.timeEntry.findUnique({ where: { id: target.id } });
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

  // Samma dubblettskydd som clockOut. Alla poster som stängs av ETT tryck får
  // samma clockOutPunchId, så en träff betyder att hela trycket redan gått
  // igenom — därför returneras allt som bär id:t, inte bara en post.
  if (input.clientPunchId) {
    const alreadyApplied = await db.timeEntry.findMany({
      where: { clockOutPunchId: input.clientPunchId },
    });
    if (alreadyApplied.length > 0) return alreadyApplied;
  }

  const open = await getOpenEntries(db, input.employeeId);

  // En post som börjar efter trycket gjordes hoppas över. Antingen har
  // skärmens klocka gått fel, eller så är det ett gammalt tryck ur kön som
  // inte gäller det här jobbet. De andra jobben stängs ändå.
  const eligible = open.filter((entry) => entry.clockInAt <= at);
  if (eligible.length === 0) return [];

  const ids = eligible.map((entry) => entry.id);

  // Ett anrop för allihop, med `clockOutAt: null` i villkoret av samma skäl
  // som i clockOut: hinner ett annat anrop stänga en post däremellan ska den
  // behålla sin sluttid i stället för att få vår påskriven.
  await db.timeEntry.updateMany({
    where: { id: { in: ids }, clockOutAt: null },
    data: { clockOutAt: at, clockOutPunchId: input.clientPunchId ?? null },
  });

  return db.timeEntry.findMany({
    where: { id: { in: ids } },
    orderBy: { clockInAt: "desc" },
  });
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

    // `clockOutAt: null` i villkoret: hinner personen stämpla ut själv mellan
    // uppslaget och skrivningen ska DERAS tid gälla. Utan villkoret skriver
    // jobbet över en riktig utstämpling med sin gissning och flaggar posten
    // för granskning — alltså gör bra data till ett ärende för kontoret.
    const { count } = await db.timeEntry.updateMany({
      where: { id: entry.id, clockOutAt: null },
      data: {
        clockOutAt: deadline,
        source: "AUTO_CLOSE",
        needsReview: true,
        reviewNote:
          `Automatiskt utstämplad ${company.autoCloseAt} — ingen utstämpling ` +
          `registrerades. Kontrollera tiden innan fakturering.`,
      },
    });

    if (count === 0) continue;

    const saved = await db.timeEntry.findUnique({ where: { id: entry.id } });
    if (saved) closed.push(saved);
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
    // kind uttryckligen, fastän en improduktiv post aldrig kan ha en order.
    // Filtret säger vad frågan handlar om, och kostar ingenting.
    where: { orderId, kind: "ORDER", clockOutAt: null },
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
    momentName: entry.moment?.name ?? "",
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

export type ManualEntryInput = {
  employeeId: string;
  clockInAt: Date;
  clockOutAt: Date;
  /** Vem som skrev in den. Hamnar i review_note så det syns i efterhand. */
  byEmail: string;
} & JobRef;

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

  const rates = await assertBelongsToCompany(db, input, {
    historical: true,
  });
  assertSaneInterval(input.clockInAt, input.clockOutAt);
  await assertNoOverlap(db, input, input.clockInAt, input.clockOutAt);

  return db.timeEntry.create({
    data: {
      companyId,
      employeeId: input.employeeId,
      ...jobFields(input),
      clockInAt: input.clockInAt,
      clockOutAt: input.clockOutAt,
      // Satserna som de är NU. En tid som skrivs in i efterhand saknar egen
      // historia — det enda systemet vet är vad personen och momentet kostar
      // idag, och att gissa något annat vore att hitta på.
      ...rates,
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

  const rates = await assertBelongsToCompany(db, input, {
    historical: true,
  });
  assertSaneInterval(input.clockInAt, input.clockOutAt);
  await assertNoOverlap(db, input, input.clockInAt, input.clockOutAt, entryId);

  return db.timeEntry.update({
    where: { id: entryId },
    data: {
      employeeId: input.employeeId,
      ...jobFields(input),
      clockInAt: input.clockInAt,
      clockOutAt: input.clockOutAt,
      // Följer med posten. Flyttas den till ett annat arbetsmoment eller en
      // annan person ska den också kosta det som gäller där — annars hade
      // kalkylen visat svetsning till måleripris.
      ...rates,
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
  job: { employeeId: string } & JobRef,
  from: Date,
  to: Date,
  ignoreEntryId?: string
) {
  const clash = await db.timeEntry.findFirst({
    where: {
      employeeId: job.employeeId,
      ...jobKey(job),
      id: ignoreEntryId ? { not: ignoreEntryId } : undefined,
      // Två intervall överlappar om det ena börjar innan det andra slutar,
      // och slutar efter att det andra börjat.
      clockInAt: { lt: to },
      OR: [{ clockOutAt: null }, { clockOutAt: { gt: from } }],
    },
    select: {
      kind: true,
      clockInAt: true,
      clockOutAt: true,
      order: { select: { orderNumber: true, customerName: true } },
      moment: { select: { name: true } },
      indirectMoment: { select: { name: true } },
    },
  });

  if (!clash) return;

  const label = describeEntry(clash);
  const pending = clash.clockOutAt ? "" : " som fortfarande pågår";

  throw new ClockError(
    `Tiden krockar med en annan stämpling på ${label.text}${pending}. ` +
      (label.billable
        ? "Samma arbetsmoment kan inte köra två jobb samtidigt."
        : "Samma improduktiva moment kan inte pågå två gånger samtidigt.")
  );
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
  input: { employeeId: string } & JobRef,
  options: { historical?: boolean } = {}
): Promise<CostRates> {
  const employee = await db.employee.findFirst({
    where: { id: input.employeeId },
  });

  if (!employee) throw new ClockError("Okänd anställd.");

  if (!employee.active && !options.historical) {
    throw new ClockError("Den anställde är inte aktiv.");
  }

  if (input.kind === "INDIRECT") {
    const moment = await db.indirectMoment.findFirst({
      where: { id: input.indirectMomentId },
    });

    if (!moment) throw new ClockError("Okänt improduktivt moment.");

    if (!moment.active && !options.historical) {
      throw new ClockError("Det improduktiva momentet är inte aktivt.");
    }

    // Improduktiv tid kalkyleras inte. Varken personens eller maskinens sats
    // kopieras — den tiden når aldrig ett fakturaunderlag, och en sats på
    // raden hade inbjudit till att räkna på den.
    return { momentCostRateOre: null, employeeCostRateOre: null };
  }

  const [order, moment] = await Promise.all([
    db.order.findFirst({ where: { id: input.orderId } }),
    db.workMoment.findFirst({ where: { id: input.momentId } }),
  ]);

  if (!order) throw new ClockError("Okänd order.");
  if (!moment) throw new ClockError("Okänt arbetsmoment.");

  // Båda raderna är redan hämtade, så satserna följer med gratis. De läses
  // här och inte vid skrivningen, för att slippa två frågor till.
  const result: CostRates = {
    momentCostRateOre: moment.costRateOre,
    employeeCostRateOre: employee.costRateOre,
  };

  if (options.historical) return result;

  if (order.status === "CLOSED") throw new ClockError("Ordern är stängd.");
  if (!moment.active) throw new ClockError("Arbetsmomentet är inte aktivt.");

  return result;
}

/**
 * Fälten som pekar ut jobbet, för skrivning.
 *
 * Nollställer ALLTID den motsatta sidan. Ändrar admin en post från ordertid
 * till improduktiv ska ordernumret försvinna, inte ligga kvar och göra raden
 * till något som varken är det ena eller det andra.
 */
function jobFields(job: JobRef) {
  if (job.kind === "ORDER") {
    return {
      kind: "ORDER" as const,
      orderId: job.orderId,
      momentId: job.momentId,
      indirectMomentId: null,
    };
  }

  if (job.kind === "INDIRECT") {
    return {
      kind: "INDIRECT" as const,
      orderId: null,
      momentId: null,
      indirectMomentId: job.indirectMomentId,
    };
  }

  // INGEN TYST GREN HÄR, och det är hela poängen.
  //
  // Stod INDIRECT som else-gren blev en anropare som glömt `kind` tyst
  // improduktiv tid: en stämpling på en order som aldrig når ett
  // fakturaunderlag, utan felmeddelande och utan att någon märker det förrän
  // kunden inte fakturerats. Det är precis tvärtom mot regeln att glömska ska
  // ge fakturerbar tid och aldrig omvänt.
  //
  // Typerna hindrar det i appen, men de kontrolleras inte överallt — testerna
  // gjorde exakt det här misstaget och gick igenom tills posterna räknades.
  throw new ClockError(
    `Stämplingen saknar giltig typ (kind). Ange antingen order och ` +
      `arbetsmoment, eller ett improduktivt moment.`
  );
}

/**
 * Nyckeln som skiljer en persons parallella jobb åt.
 *
 * För ordertid är det arbetsmomentet — momentet är maskinen, och en maskin kör
 * ett jobb i taget. För improduktiv tid är det det improduktiva momentet: man
 * städar inte två gånger samtidigt.
 */
function jobKey(job: JobRef) {
  return job.kind === "ORDER"
    ? { momentId: job.momentId }
    : { indirectMomentId: job.indirectMomentId };
}

/** Prismas felkod för brott mot en unik-regel. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}
