/**
 * OFFLINE-KÖN.
 *
 * Verkstadswifi hackar. En anställd som trycker på sitt namn ska aldrig behöva
 * bry sig om det — trycket ska registreras, punkt.
 *
 * Lösningen är en skrivkö: varje tryck sparas FÖRST lokalt på skärmen, och
 * skickas sedan till servern. Ordningen är avgörande. Skulle vi skicka först
 * och spara vid fel, skulle ett tryck kunna försvinna om skärmen tappar
 * strömmen mitt i anropet. Nu ligger det kvar tills servern kvitterat.
 *
 * Kön ligger i webbläsarens egen databas (IndexedDB) och överlever att skärmen
 * startas om. Varje tryck bär ett eget id, så att ett omskickat tryck känns
 * igen av servern och inte blir en dubblett — alltså ingen dubbelfakturerad tid.
 *
 * BILDEN SOM HÖR TILL KÖN. Medan tryck väntar är skärmens egen bild av vem som
 * är instämplad nyare än serverns, och skärmen tar inte emot serverns. Den
 * bilden fanns förut bara i minnet. Provat 2026-10-19: två instämplade, wifi
 * av, sladden ur — trycken låg kvar i kön men skärmen visade båda som
 * utstämplade, eftersom den startade på sidans sparade kopia från före
 * trycken. Den som ser sig själv utstämplad trycker igen, och väljer hen ett
 * annat jobb står två öppna samtidigt och faktureras för samma tid.
 *
 * Bilden sparas därför också, se `saveView`, i en egen databas så att köns
 * aldrig behöver röras. Samma regel om disken gäller båda, och den står på
 * ETT ställe: `tx`.
 *
 * Körs bara i webbläsaren.
 */

interface StoreSpec {
  db: string;
  version: number;
  store: string;
  /** Saknas den ges nyckeln vid varje skrivning. */
  keyPath?: string;
}

/** Kön. Namn och version är oförändrade sedan första skärmen; rör dem inte. */
const QUEUE: StoreSpec = {
  db: "tikkr",
  version: 1,
  store: "punch-queue",
  keyPath: "clientPunchId",
};

/** Bilden av vem som är instämplad, medan kön inte är tom. */
const VIEW: StoreSpec = { db: "tikkr-view", version: 1, store: "view" };

/** Den enda posten i VIEW. Det finns bara en bild åt gången. */
const VIEW_KEY = "current";

export interface QueuedPunch {
  /** Skärmens eget id för trycket. Nyckeln som hindrar dubbletter. */
  clientPunchId: string;
  /**
   * "out" gäller ETT jobb och bär då momentId — en person kan ha flera igång.
   * "out-all" stämplar ut från allt och behöver inget moment.
   *
   * DB_VERSION höjs inte trots det nya värdet: nyckeln och strukturen är
   * oförändrade, och köade tryck från en äldre skärm saknar helt enkelt
   * momentId. Servern tar hand om det fallet i stället för att avvisa det —
   * ett avvisat tryck plockas bort ur kön, och då är arbetstiden borta.
   */
  action: "in" | "out" | "out-all" | "break" | "break-end";
  employeeId: string;
  orderId?: string;
  momentId?: string;
  /** Vilken rast som togs. Bärs av "break". */
  breakTypeId?: string;
  /** Ifyllt i stället för order och moment när tiden är improduktiv. */
  indirectMomentId?: string;
  /** När personen faktiskt tryckte — inte när det råkade skickas. */
  at: string;
  /** Namn att visa om något går fel, så meddelandet blir begripligt. */
  label: string;
}

function openDb(spec: StoreSpec): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(spec.db, spec.version);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(spec.store)) {
        db.createObjectStore(
          spec.store,
          spec.keyPath ? { keyPath: spec.keyPath } : undefined
        );
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Kör ett anrop mot kön och svarar när det LIGGER PÅ DISKEN.
 *
 * Provat 2026-10-19 på en ProDVX-skärm: wifi av, två tryck, rutan visade att
 * de väntade, och när sladden drogs ur var de borta. Två saker låg bakom, och
 * båda måste vara rätt för att "sparat" ska betyda något:
 *
 * 1. SVARET KOMMER NÄR TRANSAKTIONEN ÄR KLAR, inte när anropet i den godkänts.
 *    `request.onsuccess` betyder bara att skrivningen accepterats; först
 *    `oncomplete` betyder att den är genomförd. Kön svarade förut på det
 *    första, och skärmen gick vidare som om trycket var säkrat.
 *
 * 2. SKRIVNINGEN BER OM DISKEN, `durability: "strict"`. Chromium räknar
 *    annars en transaktion som klar innan datan nått disken, för att det går
 *    fortare — ett strömavbrott strax efter tar då med sig trycket. En skrivning
 *    per tryck är ingenting att spara in på, och strömavbrottet i en verkstad
 *    är precis när kön ska hålla.
 *
 * Fönstret blir aldrig noll: drar någon ur sladden samma hundradel trycket görs
 * finns inget att rädda. Men det krymper från sekunder till det ögonblicket.
 *
 * Läsningar behöver inget av det, och får vara snabba.
 *
 * Gäller kön och bilden lika, och står därför bara här.
 */
function tx<T>(
  spec: StoreSpec,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb(spec).then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(
          spec.store,
          mode,
          mode === "readwrite" ? { durability: "strict" } : undefined
        );
        const request = run(transaction.objectStore(spec.store));

        transaction.oncomplete = () => resolve(request.result);
        // Ett fel i anropet avbryter transaktionen, och då kommer båda. Det
        // andra svaret gör ingenting: ett löfte avgörs bara en gång.
        transaction.onerror = () => reject(transaction.error ?? request.error);
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("Kön kunde inte sparas."));
      })
  );
}

/** Lägger ett tryck i kön. Anropas innan något skickas. */
export async function enqueue(punch: QueuedPunch): Promise<void> {
  await tx(QUEUE, "readwrite", (store) => store.put(punch));
}

/** Alla tryck som väntar, i den ordning de gjordes. */
export async function pending(): Promise<QueuedPunch[]> {
  const all = await tx<QueuedPunch[]>(QUEUE, "readonly", (store) =>
    store.getAll() as IDBRequest<QueuedPunch[]>
  );
  // Ordningen spelar roll: servern vägrar en instämpling som ligger före ett
  // pågående jobb, så tryck måste levereras som de gjordes.
  return all.sort((a, b) => a.at.localeCompare(b.at));
}

async function remove(clientPunchId: string): Promise<void> {
  await tx(QUEUE, "readwrite", (store) => store.delete(clientPunchId));
}

export interface FlushResult {
  sent: number;
  /** Kvar i kön — servern gick inte att nå. */
  waiting: number;
  /** Tryck servern avvisade permanent. De ligger inte kvar och försöks om. */
  rejected: { punch: QueuedPunch; reason: string }[];
  /**
   * true när servern inte känner igen skärmen (401). Kön ligger kvar och
   * skickas när skärmen kopplats på nytt — till samma företag hittar trycken
   * rätt, till ett annat avvisas de som okända anställda.
   */
  unpaired?: boolean;
}

/**
 * Hur länge vi väntar på servern innan trycket får ligga kvar i kön.
 *
 * En långsam server ska inte kunna få skärmen att hänga sig. Går anropet över
 * tiden behandlas det som om nätet vore borta: trycket ligger kvar och skickas
 * om. Det är alltid rätt utfall, eftersom id:t på trycket gör att en dubblett
 * inte kan uppstå även om servern faktiskt hann ta emot det.
 */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Hur gammalt ett tryck ska vara för att räknas som köat.
 *
 * Varje tryck går genom kön, även när nätet fungerar — det skickas bara några
 * millisekunder efter att det sparats. Markerades alla som köade fick varje
 * stämpling från skärmen källan "offline" i audit-loggen, och fältet sa
 * ingenting. Tio sekunder skiljer ett tryck som gick direkt från ett som fick
 * vänta.
 *
 * Båda tiderna kommer från skärmens egen klocka, så jämförelsen håller även
 * när den klockan går fel.
 */
const QUEUED_AFTER_MS = 10_000;

/** Servern har prövat trycket och sagt nej. Bara då får det tas bort. */
function isVerdict(status: number, data: unknown): data is { error: string } {
  return (
    (status === 400 || status === 409) &&
    typeof (data as { error?: unknown } | null)?.error === "string"
  );
}

// Bara en tömning åt gången. Två samtidiga skulle kunna skicka samma tryck två
// gånger och rota till ordningen.
let flushing: Promise<FlushResult> | null = null;

/**
 * Skickar allt som väntar i kön, i tur och ordning.
 *
 * Går servern inte att nå avbryts tömningen och resten ligger kvar till nästa
 * försök. Avvisar servern ett tryck av ett skäl som inte försvinner av sig
 * självt — t.ex. en anställd som inte finns — plockas det bort och rapporteras,
 * annars skulle kön fastna på det för alltid. En order som hunnit stängas är
 * inte ett sådant skäl längre: servern tar emot trycket och flaggar det.
 */
export function flush(): Promise<FlushResult> {
  if (flushing) return flushing;

  flushing = (async (): Promise<FlushResult> => {
    const queue = await pending();
    const rejected: FlushResult["rejected"] = [];
    let sent = 0;

    for (const punch of queue) {
      let response: Response;

      try {
        const now = Date.now();

        response = await fetch("/api/kiosk/punch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...punch,
            // Samma klocka som `at`. Servern mäter hur fel den går och rättar
            // trycket efter det, se punch-time.ts.
            sentAt: new Date(now).toISOString(),
            queued: now - Date.parse(punch.at) > QUEUED_AFTER_MS,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        // Ingen kontakt, eller för långsamt svar. Avbryt — resten ligger kvar
        // orörd och skickas om vid nästa försök.
        return { sent, waiting: queue.length - sent, rejected };
      }

      if (response.ok) {
        await remove(punch.clientPunchId);
        sent++;

        continue;
      }

      // ETT TRYCK TAS BARA BORT NÄR SERVERN SJÄLV PRÖVAT DET OCH SAGT NEJ.
      //
      // Förr räckte vilken 4xx som helst. Det betydde att en skärm som kopplats
      // om (401) raderade hela sin kö, och att en felsida från proxyn (403,
      // 413, 429) kunde göra detsamma. Arbetstid försvann för att något mellan
      // skärmen och servern krånglade, inte för att trycket var fel.
      //
      // Nu måste svaret vara vårt eget besked: 400 eller 409 med ett
      // felmeddelande i JSON. Allt annat — 5xx, 401, proxyns sidor — behandlas
      // som att nätet är borta: trycket ligger kvar och skickas om.
      const data: unknown = await response.json().catch(() => null);

      if (!isVerdict(response.status, data)) {
        return {
          sent,
          waiting: queue.length - sent,
          rejected,
          unpaired: response.status === 401,
        };
      }

      await remove(punch.clientPunchId);
      rejected.push({ punch, reason: data.error });
    }

    return { sent, waiting: 0, rejected };
  })().finally(() => {
    flushing = null;
  });

  return flushing;
}

/* -------------------------------------------------------------------------- */
/* Bilden som hör till kön                                                     */
/* -------------------------------------------------------------------------- */

/** Det som sparas: skärmens bild, och när den togs. */
export interface SavedView<T> {
  view: T;
  /** Skärmens klocka, samma som trycken i kön. Se `shouldRestoreView`. */
  savedAt: string;
}

/**
 * Sparar skärmens bild av vem som är instämplad.
 *
 * Bara medan kön inte är tom: det är bara då bilden behövs, och en skrivning
 * till disken var femte sekund, när serverns bild kommer in, sliter på
 * skärmens minne för ingenting.
 *
 * Fönstret mellan trycket och bilden är några millisekunder. Går strömmen
 * precis där ligger trycket i kön men inte i bilden, och skärmen visar läget
 * före det. Det rättar sig när nätet kommer tillbaka och kön tömts.
 */
export async function saveView<T>(view: T): Promise<void> {
  const saved: SavedView<T> = { view, savedAt: new Date().toISOString() };
  await tx(VIEW, "readwrite", (store) => store.put(saved, VIEW_KEY));
}

/** Den sparade bilden, eller null om ingen finns. */
export async function loadView<T>(): Promise<SavedView<T> | null> {
  const saved = await tx<SavedView<T> | undefined>(VIEW, "readonly", (store) =>
    store.get(VIEW_KEY)
  );
  return saved ?? null;
}

/** Tar bort bilden. Anropas när kön är tom och serverns bild gäller igen. */
export async function clearView(): Promise<void> {
  await tx(VIEW, "readwrite", (store) => store.delete(VIEW_KEY));
}

/**
 * Om en sparad bild hör till trycken som väntar.
 *
 * Bilden ska vara tagen EFTER det äldsta trycket i kön. En äldre bild hör till
 * ett tidigare avbrott — sparad när kön senast var full, och aldrig borttagen
 * för att strömmen gick i samma stund som kön tömdes. Den hade visat ett läge
 * som inte längre gäller, och då är serverns sparade sida en bättre gissning.
 *
 * Båda tiderna kommer från skärmens egen klocka, så en klocka som går fel
 * spelar ingen roll här: den går lika fel på båda.
 */
export function shouldRestoreView(
  saved: Pick<SavedView<unknown>, "savedAt"> | null,
  queue: Pick<QueuedPunch, "at">[]
): boolean {
  if (!saved || queue.length === 0) return false;

  const savedAt = Date.parse(saved.savedAt);
  const oldest = Math.min(...queue.map((punch) => Date.parse(punch.at)));

  return Number.isFinite(savedAt) && Number.isFinite(oldest) && savedAt >= oldest;
}
