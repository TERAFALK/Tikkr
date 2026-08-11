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
 * Körs bara i webbläsaren.
 */

const DB_NAME = "tikkr";
const DB_VERSION = 1;
const STORE = "punch-queue";

export interface QueuedPunch {
  /** Skärmens eget id för trycket. Nyckeln som hindrar dubbletter. */
  clientPunchId: string;
  action: "in" | "out";
  employeeId: string;
  orderId?: string;
  momentId?: string;
  /** När personen faktiskt tryckte — inte när det råkade skickas. */
  at: string;
  /** Namn att visa om något går fel, så meddelandet blir begripligt. */
  label: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientPunchId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

/** Lägger ett tryck i kön. Anropas innan något skickas. */
export async function enqueue(punch: QueuedPunch): Promise<void> {
  await tx("readwrite", (store) => store.put(punch));
}

/** Alla tryck som väntar, i den ordning de gjordes. */
export async function pending(): Promise<QueuedPunch[]> {
  const all = await tx<QueuedPunch[]>("readonly", (store) =>
    store.getAll() as IDBRequest<QueuedPunch[]>
  );
  // Ordningen spelar roll: servern vägrar en instämpling som ligger före ett
  // pågående jobb, så tryck måste levereras som de gjordes.
  return all.sort((a, b) => a.at.localeCompare(b.at));
}

async function remove(clientPunchId: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(clientPunchId));
}

export interface FlushResult {
  sent: number;
  /** Kvar i kön — servern gick inte att nå. */
  waiting: number;
  /** Tryck servern avvisade permanent. De ligger inte kvar och försöks om. */
  rejected: { punch: QueuedPunch; reason: string }[];
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

// Bara en tömning åt gången. Två samtidiga skulle kunna skicka samma tryck två
// gånger och rota till ordningen.
let flushing: Promise<FlushResult> | null = null;

/**
 * Skickar allt som väntar i kön, i tur och ordning.
 *
 * Går servern inte att nå avbryts tömningen och resten ligger kvar till nästa
 * försök. Avvisar servern ett tryck av ett skäl som inte försvinner av sig
 * självt — t.ex. att ordern hunnit stängas — plockas det bort och rapporteras,
 * annars skulle kön fastna på det för alltid.
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
        response = await fetch("/api/kiosk/punch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...punch, queued: true }),
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

      // 5xx är oftast tillfälligt: låt trycket ligga kvar och försök igen.
      if (response.status >= 500) {
        return { sent, waiting: queue.length - sent, rejected };
      }

      const data = await response.json().catch(() => ({}));
      await remove(punch.clientPunchId);
      rejected.push({ punch, reason: data.error ?? "Avvisad av servern." });
    }

    return { sent, waiting: 0, rejected };
  })().finally(() => {
    flushing = null;
  });

  return flushing;
}
