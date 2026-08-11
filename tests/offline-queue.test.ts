// Härmar webbläsarens egen databas. Kön lever i IndexedDB, som inte finns i
// Node — utan det här går den inte att testa utanför en webbläsare.
import "fake-indexeddb/auto";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { enqueue, flush, pending, type QueuedPunch } from "@/lib/offline-queue";

/**
 * OFFLINE-KÖN.
 *
 * Den här koden hanterar situationen där tid annars går förlorad: nätet ligger
 * nere och någon stämplar ändå. Den var länge den enda kritiska logiken som
 * bara testats för hand.
 *
 * Det som måste hålla:
 *   - ett tryck försvinner aldrig för att servern inte svarar
 *   - ett tryck skickas aldrig två gånger som två stämplingar
 *   - tryck levereras i den ordning de gjordes
 *   - ett permanent avvisat tryck fastnar inte och blockerar resten
 */

const DB_NAME = "tikkr";
const STORE = "punch-queue";

function punch(overrides: Partial<QueuedPunch> = {}): QueuedPunch {
  return {
    clientPunchId: `punch-${Math.random().toString(36).slice(2)}`,
    action: "in",
    employeeId: "anna",
    orderId: "order-1",
    momentId: "svetsning",
    at: new Date().toISOString(),
    label: "Anna, order 2601",
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Tömmer kön mellan testerna. */
async function clearQueue(): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "clientPunchId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
    request.onsuccess = () => resolve(null);
    request.onerror = () => reject(request.error);
  });

  db.close();
}

beforeEach(async () => {
  await clearQueue();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("kön sparar innan den skickar", () => {
  it("ett tryck ligger i kön direkt", async () => {
    await enqueue(punch({ clientPunchId: "abc" }));

    const queue = await pending();
    expect(queue).toHaveLength(1);
    expect(queue[0].clientPunchId).toBe("abc");
  });
});

describe("när servern svarar", () => {
  it("trycket skickas och tas bort ur kön", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await enqueue(punch());
    const result = await flush();

    expect(result.sent).toBe(1);
    expect(result.waiting).toBe(0);
    expect(await pending()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skickas med markering om att det kommer från kön", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200));

    await enqueue(punch({ clientPunchId: "abc" }));
    await flush();

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.queued).toBe(true);
    expect(body.clientPunchId).toBe("abc");
  });
});

describe("när nätet är borta", () => {
  it("trycket ligger kvar istället för att försvinna", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("nätverksfel"));

    await enqueue(punch());
    const result = await flush();

    expect(result.sent).toBe(0);
    expect(result.waiting).toBe(1);
    expect(await pending()).toHaveLength(1);
  });

  it("skickas när nätet kommer tillbaka", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("nätverksfel"));
    await enqueue(punch());
    await flush();

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200));

    const result = await flush();
    expect(result.sent).toBe(1);
    expect(await pending()).toHaveLength(0);
  });

  it("ett fel hos servern räknas också som tillfälligt", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(500));

    await enqueue(punch());
    const result = await flush();

    expect(result.sent).toBe(0);
    expect(await pending()).toHaveLength(1);
  });
});

describe("permanent avvisade tryck", () => {
  it("plockas bort och rapporteras istället för att fastna", async () => {
    // Ordern hann stängas innan trycket kom fram. Att försöka om skulle
    // misslyckas för alltid och blockera allt bakom i kön.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(409, { error: "Ordern är stängd." })
    );

    await enqueue(punch({ label: "Anna, order 2601" }));
    const result = await flush();

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe("Ordern är stängd.");
    expect(result.rejected[0].punch.label).toBe("Anna, order 2601");
    expect(await pending()).toHaveLength(0);
  });

  it("stoppar inte tryck som ligger efter i kön", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(409, { error: "Ordern är stängd." }))
      .mockResolvedValueOnce(jsonResponse(200));

    await enqueue(punch({ clientPunchId: "forst", at: "2026-08-11T08:00:00.000Z" }));
    await enqueue(punch({ clientPunchId: "sedan", at: "2026-08-11T09:00:00.000Z" }));

    const result = await flush();

    expect(result.rejected).toHaveLength(1);
    expect(result.sent).toBe(1);
    expect(await pending()).toHaveLength(0);
  });
});

describe("ordningen bevaras", () => {
  it("tryck skickas i den ordning de gjordes, inte den de sparades", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200));

    // Sparas i omvänd ordning mot när de gjordes. Servern vägrar en
    // instämpling som ligger före ett pågående jobb, så ordningen måste rättas.
    await enqueue(punch({ clientPunchId: "senare", at: "2026-08-11T09:00:00.000Z" }));
    await enqueue(punch({ clientPunchId: "tidigare", at: "2026-08-11T08:00:00.000Z" }));

    await flush();

    const skickade = fetchMock.mock.calls.map(
      (call) => JSON.parse(String(call[1]?.body)).clientPunchId
    );
    expect(skickade).toEqual(["tidigare", "senare"]);
  });
});

describe("inga dubbletter", () => {
  it("två samtidiga tömningar skickar trycket en gång", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200));

    await enqueue(punch());

    // Kön töms vid varje tryck, när nätet kommer tillbaka och var 30:e sekund.
    // De kan sammanfalla, och då får trycket inte skickas två gånger.
    const [first, second] = await Promise.all([flush(), flush()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("samma id sparat två gånger blir ett tryck i kön", async () => {
    await enqueue(punch({ clientPunchId: "samma" }));
    await enqueue(punch({ clientPunchId: "samma" }));

    expect(await pending()).toHaveLength(1);
  });
});
