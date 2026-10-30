import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * PRENUMERATIONSLÅSET SITTER I requireAdmin().
 *
 * Låset låg som en gren i panelens layout, som ritade låsskärmen i stället för
 * sidan. Det stoppade ingenting: Next kör sidan ändå och skickar den i svaret,
 * även när layouten aldrig ritar `children`. Rapporterna gick att läsa i
 * sidkällan, och serveråtgärderna fungerade som vanligt.
 *
 * Regeln: `requireAdmin()` släpper inte in en låst arbetsyta. Det som ska
 * fungera ändå säger det med `requireAdminEvenIfLocked()`, och den listan är
 * kort och står här. En ny sida eller åtgärd är därmed låst utan att någon
 * behöver komma ihåg det.
 *
 * Första delen prövar själva grinden, med konto och företag i minnet. Andra
 * delen läser källtexten och fäller den som använder undantaget utan skäl.
 * Ingen av dem behöver en databas.
 */

const state = vi.hoisted(() => ({
  account: null as Record<string, unknown> | null,
  supportCookie: null as string | null,
}));

vi.mock("@/lib/auth", () => ({
  auth: async () =>
    state.account
      ? {
          user: {
            id: state.account.id,
            authTime: Math.floor(Date.now() / 1000),
          },
        }
      : null,
}));

vi.mock("@/lib/db", () => ({
  unsafeGlobalPrisma: {
    adminUser: { findUnique: async () => state.account },
    company: { findUnique: async () => ({ name: "Kunden AB" }) },
    supportVisit: { updateMany: async () => ({ count: 0 }) },
    $extends: () => ({}),
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "tikkr_support" && state.supportCookie
        ? { name, value: state.supportCookie }
        : undefined,
    set: () => {},
  }),
  headers: async () => ({ get: () => null }),
}));

const { LOCKED_PATH, requireAdmin, requireAdminEvenIfLocked } = await import(
  "@/lib/admin-session"
);
const { __internals } = await import("@/lib/support-session");

const DAY = 24 * 60 * 60 * 1000;

function account(company: Record<string, unknown>) {
  return {
    id: "konto",
    email: "chef@kunden.se",
    role: "OWNER",
    companyId: "kunden",
    passwordChangedAt: null,
    sessionsRevokedAt: null,
    totpEnabledAt: new Date(0),
    company: {
      name: "Kunden AB",
      subscriptionStatus: "TRIALING",
      trialEndsAt: null,
      pastDueSince: null,
      ...company,
    },
  };
}

const LOCKED: Record<string, Record<string, unknown>> = {
  "utgången provperiod": {
    subscriptionStatus: "TRIALING",
    trialEndsAt: new Date(Date.now() - DAY),
  },
  "obetald efter respiten": {
    subscriptionStatus: "PAST_DUE",
    pastDueSince: new Date(Date.now() - 30 * DAY),
  },
  "avslutad prenumeration": { subscriptionStatus: "CANCELED" },
};

const OPEN: Record<string, Record<string, unknown>> = {
  "aktiv prenumeration": { subscriptionStatus: "ACTIVE" },
  "pågående provperiod": {
    subscriptionStatus: "TRIALING",
    trialEndsAt: new Date(Date.now() + 20 * DAY),
  },
  "obetald inom respiten": {
    subscriptionStatus: "PAST_DUE",
    pastDueSince: new Date(Date.now() - DAY),
  },
};

beforeEach(() => {
  state.account = null;
  state.supportCookie = null;
});

describe("grinden", () => {
  for (const [name, company] of Object.entries(LOCKED)) {
    it(`${name}: requireAdmin släpper inte in`, async () => {
      state.account = account(company);
      await expect(requireAdmin()).rejects.toThrow(`REDIRECT ${LOCKED_PATH}`);
    });

    it(`${name}: undantaget släpper in och säger att det är låst`, async () => {
      state.account = account(company);
      const session = await requireAdminEvenIfLocked();

      expect(session.companyId).toBe("kunden");
      expect(session.locked).toBe(true);
    });
  }

  for (const [name, company] of Object.entries(OPEN)) {
    it(`${name}: requireAdmin släpper in`, async () => {
      state.account = account(company);
      const session = await requireAdmin();

      expect(session.companyId).toBe("kunden");
      expect(session.locked).toBeUndefined();
    });
  }

  it("den utloggade skickas till inloggningen, inte till låset", async () => {
    await expect(requireAdmin()).rejects.toThrow("REDIRECT /admin/login");
    await expect(requireAdminEvenIfLocked()).rejects.toThrow(
      "REDIRECT /admin/login"
    );
  });

  it("supportläget är aldrig låst", async () => {
    // En obetald faktura är oftast varför kunden ringer, och läget kan ändå
    // bara läsa. Se CLAUDE.md § 4 punkt 5.
    process.env.AUTH_SECRET = "test-hemlighet";
    process.env.PLATFORM_ADMIN_EMAILS = "support@tikkr.se";

    state.supportCookie = __internals.encode({
      companyId: "kunden",
      email: "support@tikkr.se",
      visitId: "besok",
      exp: Math.floor(Date.now() / 1000) + 600,
    });

    const session = await requireAdmin();

    expect(session.support).toBeDefined();
    expect(session.locked).toBeUndefined();
  });
});

const SRC = path.resolve(__dirname, "../src");
const PANEL = path.join(SRC, "app/admin/(panel)");
const EVEN_IF_LOCKED = "requireAdminEvenIfLocked";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function relative(file: string): string {
  return path.relative(SRC, file).split(path.sep).join("/");
}

function read(file: string): string {
  return readFileSync(path.join(SRC, file), "utf8");
}

/** Kroppen för varje exporterad async-funktion i en fil, med namn. */
function exportedBodies(source: string): { name: string; body: string }[] {
  const starts = [...source.matchAll(/^export async function (\w+)/gm)];

  return starts.map((match, index) => ({
    name: match[1],
    body: source.slice(match.index, starts[index + 1]?.index ?? source.length),
  }));
}

/**
 * FILERNA SOM FÅR ANVÄNDA UNDANTAGET, OCH VARFÖR.
 *
 * Varje rad är något en låst arbetsyta når. Allt annat är låst.
 */
const ALLOWED: Record<string, string> = {
  // Ritar låsskärmen, och hade annars skickat sig själv till låset i en slinga.
  "app/admin/(panel)/layout.tsx": "layouten",
  // Sidan låsskärmen visas på.
  "app/admin/(panel)/last/page.tsx": "låssidan",
  // Vägen ut ur låset: kassan och kundportalen. Ägarprövningen står kvar.
  "app/admin/(panel)/installningar/prenumeration/actions.ts": "betalningen",
  // Det egna kontot rör ingen kunddata. Remsan om e-postadressen ligger i
  // layouten och syns även i det låsta läget.
  "app/admin/(panel)/konto/actions.ts": "det egna kontot",
  // Pratbubblan står i menyns fot, som finns kvar. Ett låst företag ska
  // kunna höra av sig.
  "app/admin/(panel)/feedback/actions.ts": "feedback",
  // Den nyregistrerade spärras här före panelen. Hade sidan skickat till
  // låset hade layouten skickat tillbaka, utan slut.
  "app/admin/bekrafta-adressen/page.tsx": "adressbekräftelsen",
  "app/admin/bekrafta-adressen/actions.ts": "adressbekräftelsen",
  // Rätten att få veta vad som finns registrerat gäller oavsett faktura.
  "app/api/admin/export/person/route.ts": "registerutdraget",
};

/** Uttagen svarar 402 och inte med en omdirigering. Prövar låset själva. */
const OWN_LOCK_CHECK = [
  "app/api/admin/export/route.ts",
  "app/api/admin/export/orders/route.ts",
  "app/api/admin/export/timesheet/route.ts",
];

/** Bara en åtgärd i filen är undantagen, se testet för anonymiseringen. */
const ONE_ACTION = "app/admin/(panel)/installningar/actions.ts";

describe("vem som når en låst arbetsyta", () => {
  const appFiles = walk(path.join(SRC, "app"))
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({ file: relative(file), source: readFileSync(file, "utf8") }));

  const pages = walk(PANEL)
    .filter((file) => file.endsWith("page.tsx"))
    .map((file) => relative(file));

  it("hittar panelens sidor", () => {
    // Flyttas katalogerna ska testet säga det, inte tystna.
    expect(pages.length).toBeGreaterThan(30);
  });

  it("varje sida i panelen går genom requireAdmin", () => {
    const missing = pages
      .filter((file) => !(file in ALLOWED))
      .filter((file) => !/await requireAdmin\(\)/.test(read(file)));

    expect(
      missing,
      "Dessa sidor kallar inte requireAdmin(). En sida ritas och skickas även " +
        "när layouten visar låsskärmen, så den måste själv släppa låset."
    ).toEqual([]);
  });

  it("undantaget används bara där det har ett skäl", () => {
    const known = new Set([
      ...Object.keys(ALLOWED),
      ...OWN_LOCK_CHECK,
      ONE_ACTION,
    ]);

    const unexpected = appFiles
      .filter(({ source }) => source.includes(EVEN_IF_LOCKED))
      .filter(({ file }) => !known.has(file))
      .map(({ file }) => file);

    expect(
      unexpected,
      `Dessa filer använder ${EVEN_IF_LOCKED} utan att stå i listan. Det ` +
        "släpper in en arbetsyta som inte betalar. Använd requireAdmin(), eller " +
        "skriv in filen i ALLOWED med ett skäl."
    ).toEqual([]);
  });

  it("listan pekar på filer som finns", () => {
    for (const file of [...Object.keys(ALLOWED), ...OWN_LOCK_CHECK]) {
      expect(existsSync(path.join(SRC, file)), file).toBe(true);
    }
  });

  it("uttagen som släpps förbi grinden prövar låset själva", () => {
    for (const file of OWN_LOCK_CHECK) {
      expect(read(file), file).toMatch(/lockedExportResponse|evaluateAccess/);
    }
  });

  it("av åtgärderna för kunddata är bara anonymiseringen undantagen", () => {
    // Rätten att bli glömd kan inte hänga på att en faktura är betald. Övriga
    // åtgärder i filen är låsta.
    const exempt = exportedBodies(read(ONE_ACTION))
      .filter(({ body }) => body.includes(EVEN_IF_LOCKED))
      .map(({ name }) => name);

    expect(exempt).toEqual(["anonymizeEmployee"]);
  });

  it("rutter som läser sessionen utan grind prövar låset", () => {
    // currentAdmin() går förbi requireAdmin, och tavlans utfall är kunddata.
    expect(read("app/api/admin/plan/live/route.ts")).toMatch(/session\.locked/);
  });

  it("låssidan ligger på adressen grinden skickar till", () => {
    expect(LOCKED_PATH).toBe("/admin/last");
    expect(existsSync(path.join(PANEL, "last/page.tsx"))).toBe(true);
  });

  it("layouten skickar inte sig själv till låset", () => {
    const layout = read("app/admin/(panel)/layout.tsx");

    expect(layout).toContain(`await ${EVEN_IF_LOCKED}()`);
    expect(layout).not.toMatch(/await requireAdmin\(\)/);
  });
});
