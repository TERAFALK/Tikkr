import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

/**
 * SERVICE WORKERN, för den del som avgör vad skärmen visar utan nät.
 *
 * Logotypen och porträtten låg under /api/ och gick förbi workern helt. En
 * skärm som laddades om när nätet just försvunnit visade därför namnen utan
 * bilder. Det syntes först på den första riktiga skärmen.
 *
 * Filen körs som den är, i en egen sandlåda med en låtsad cache och ett
 * låtsat nät, så att testet prövar exakt det som skickas till skärmarna.
 *
 * Behöver ingen databas.
 */

const ORIGIN = "https://portal.tikkr.se";
const SOURCE = readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");

type Handler = (event: FakeEvent) => void;

interface FakeEvent {
  request?: Request;
  respondWith?: (response: Promise<Response>) => void;
  waitUntil?: (work: Promise<unknown>) => void;
}

/** En Cache Storage i minnet, med adressen som nyckel. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();

  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    const key = (request: Request | string) =>
      typeof request === "string" ? new URL(request, ORIGIN).href : request.url;

    return {
      match: async (request: Request | string) => store.get(key(request))?.clone(),
      put: async (request: Request | string, response: Response) => {
        store.set(key(request), response);
      },
      delete: async (request: Request | string) => store.delete(key(request)),
      addAll: async () => undefined,
    };
  };

  return {
    stores,
    api: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (request: Request | string) => {
        for (const name of stores.keys()) {
          const hit = await (await open(name)).match(request);
          if (hit) return hit;
        }
        return undefined;
      },
    },
  };
}

let handlers: Record<string, Handler>;
let caches: ReturnType<typeof fakeCaches>;
let network: (request: Request) => Promise<Response>;

beforeEach(() => {
  handlers = {};
  caches = fakeCaches();
  network = async () => new Response("nät", { status: 200 });

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };

  vm.runInNewContext(SOURCE, {
    self,
    caches: caches.api,
    fetch: (request: Request) => network(request),
    URL,
    Response,
    Promise,
  });
});

/** Skickar en GET genom workerns fetch-händelse. null = workern lät den vara. */
async function get(pathname: string, init: RequestInit = {}): Promise<Response | null> {
  let answer: Promise<Response> | null = null;
  handlers.fetch({
    request: new Request(ORIGIN + pathname, init),
    respondWith: (response) => {
      answer = response;
    },
  });
  return answer;
}

const offline = () => {
  network = async () => {
    throw new TypeError("Failed to fetch");
  };
};

describe("bilderna på stämplingsskärmen", () => {
  it("visar logotypen från cachen när nätet är borta", async () => {
    network = async () => new Response("logga", { status: 200 });
    expect(await (await get("/api/company/logo?variant=square&v=1"))!.text()).toBe("logga");

    offline();
    expect(await (await get("/api/company/logo?variant=square&v=1"))!.text()).toBe("logga");
  });

  it("visar porträttet från cachen när nätet är borta", async () => {
    network = async () => new Response("anna", { status: 200 });
    await get("/api/anstallda/emp-1/foto");

    offline();
    expect(await (await get("/api/anstallda/emp-1/foto"))!.text()).toBe("anna");
  });

  it("hämtar en ny bild när nätet fungerar, och sparar den", async () => {
    network = async () => new Response("gammal", { status: 200 });
    await get("/api/anstallda/emp-1/foto");

    network = async () => new Response("ny", { status: 200 });
    expect(await (await get("/api/anstallda/emp-1/foto"))!.text()).toBe("ny");

    offline();
    expect(await (await get("/api/anstallda/emp-1/foto"))!.text()).toBe("ny");
  });

  it("glömmer ett porträtt som tagits bort", async () => {
    // Ett foto är en personuppgift. En anonymiserad person ska inte finnas kvar
    // på skärmen för att den en gång var offline.
    network = async () => new Response("anna", { status: 200 });
    await get("/api/anstallda/emp-1/foto");

    network = async () => new Response(null, { status: 404 });
    expect((await get("/api/anstallda/emp-1/foto"))!.status).toBe(404);

    offline();
    await expect(
      (async () => (await get("/api/anstallda/emp-1/foto"))!)()
    ).rejects.toThrow();
  });

  it("utan sparad bild och utan nät blir det ett nätfel, inte en tom bild", async () => {
    offline();
    await expect(
      (async () => (await get("/api/anstallda/emp-2/foto"))!)()
    ).rejects.toThrow();
  });

  it("sparar inte ett felsvar", async () => {
    network = async () => new Response("fel", { status: 500 });
    await get("/api/company/logo");
    expect(caches.stores.get("tikkr-bilder-v1")?.size ?? 0).toBe(0);
  });
});

describe("det workern ska låta vara", () => {
  it("rör inga andra anrop under /api/", async () => {
    expect(await get("/api/kiosk/state")).toBeNull();
    expect(await get("/api/anstallda/emp-1/foto/extra")).toBeNull();
    expect(await get("/api/admin/export")).toBeNull();
  });

  it("rör aldrig en stämpling", async () => {
    expect(await get("/api/kiosk/punch", { method: "POST", body: "{}" })).toBeNull();
  });
});

describe("uppdatering av workern", () => {
  it("behåller bilderna när en gammal sidcache städas bort", async () => {
    await (await caches.api.open("tikkr-v1")).put(ORIGIN + "/kiosk", new Response("gammal"));
    await (await caches.api.open("tikkr-bilder-v1")).put(
      ORIGIN + "/api/company/logo",
      new Response("logga")
    );

    let work: Promise<unknown> = Promise.resolve();
    handlers.activate({ waitUntil: (w) => (work = w) });
    await work;

    expect(await caches.api.keys()).toEqual(["tikkr-bilder-v1"]);
  });
});
