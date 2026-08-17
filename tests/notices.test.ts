import { describe, it, expect, afterEach, afterAll } from "vitest";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  activeNotices,
  archiveNotice,
  createNotice,
  noticeState,
  NoticeError,
} from "@/lib/notices";

/**
 * Driftmeddelanden.
 *
 * Två fel som skulle märkas först när det verkligen gäller: ett meddelande som
 * inte dyker upp vid rätt tidpunkt, och ett som ligger kvar långt efter att
 * underhållet är över. Båda urholkar förtroendet för bannern, och en banner
 * ingen tror på är värdelös.
 */

const HOUR = 60 * 60 * 1000;

function at(offsetMs: number): Date {
  return new Date(Date.now() + offsetMs);
}

async function add(overrides: Partial<Parameters<typeof createNotice>[0]> = {}) {
  return createNotice({
    kind: "MAINTENANCE",
    title: `Underhållstest ${Math.random().toString(36).slice(2, 8)}`,
    body: "Tjänsten är otillgänglig en kort stund.",
    startsAt: at(-HOUR),
    endsAt: at(HOUR),
    showInAdmin: true,
    showOnKiosk: false,
    createdByEmail: "adi@terafalk.com",
    ...overrides,
  });
}

afterEach(async () => {
  await unsafeGlobalPrisma.systemNotice.deleteMany({
    where: { createdByEmail: "adi@terafalk.com" },
  });
});

afterAll(async () => {
  await unsafeGlobalPrisma.$disconnect();
});

describe("vilka meddelanden som visas", () => {
  it("ett pågående meddelande visas", async () => {
    const notice = await add();

    const shown = await activeNotices("admin");
    expect(shown.map((row) => row.id)).toContain(notice.id);
  });

  it("ett kommande meddelande visas inte än", async () => {
    const notice = await add({ startsAt: at(HOUR), endsAt: at(2 * HOUR) });

    const shown = await activeNotices("admin");
    expect(shown.map((row) => row.id)).not.toContain(notice.id);
  });

  it("ett avslutat meddelande visas inte längre", async () => {
    const notice = await add({ startsAt: at(-2 * HOUR), endsAt: at(-HOUR) });

    const shown = await activeNotices("admin");
    expect(shown.map((row) => row.id)).not.toContain(notice.id);
  });

  it("utan sluttid visas det tills det arkiveras", async () => {
    const notice = await add({ endsAt: null });

    expect((await activeNotices("admin")).map((r) => r.id)).toContain(notice.id);

    await archiveNotice(notice.id);

    expect((await activeNotices("admin")).map((r) => r.id)).not.toContain(
      notice.id
    );
  });
});

describe("ytorna hålls isär", () => {
  it("ett meddelande för panelen syns inte på skärmarna", async () => {
    // Ett underhåll som bara rör rapporterna ska inte stå på väggen i
    // verkstaden, där ingen kan göra något åt det.
    const notice = await add({ showInAdmin: true, showOnKiosk: false });

    expect((await activeNotices("admin")).map((r) => r.id)).toContain(notice.id);
    expect((await activeNotices("kiosk")).map((r) => r.id)).not.toContain(
      notice.id
    );
  });

  it("ett meddelande för skärmarna syns inte i panelen", async () => {
    const notice = await add({ showInAdmin: false, showOnKiosk: true });

    expect((await activeNotices("kiosk")).map((r) => r.id)).toContain(notice.id);
    expect((await activeNotices("admin")).map((r) => r.id)).not.toContain(
      notice.id
    );
  });
});

describe("kontroller innan något läggs in", () => {
  it("meddelande utan yta avvisas", async () => {
    await expect(
      add({ showInAdmin: false, showOnKiosk: false })
    ).rejects.toThrow(NoticeError);
  });

  it("sluttid före starttid avvisas", async () => {
    await expect(add({ startsAt: at(HOUR), endsAt: at(-HOUR) })).rejects.toThrow(
      NoticeError
    );
  });

  it("tom rubrik eller text avvisas", async () => {
    await expect(add({ title: "" })).rejects.toThrow(NoticeError);
    await expect(add({ body: "   " })).rejects.toThrow(NoticeError);
  });
});

describe("arkivering", () => {
  it("raderar inte, utan märker", async () => {
    // Det ska gå att se i efterhand vad kunderna faktiskt fick se.
    const notice = await add();
    await archiveNotice(notice.id);

    const row = await unsafeGlobalPrisma.systemNotice.findUnique({
      where: { id: notice.id },
    });

    expect(row).not.toBeNull();
    expect(row?.archivedAt).not.toBeNull();
  });
});

describe("läget som visas i listan", () => {
  it("beskriver var meddelandet befinner sig", () => {
    const now = new Date("2026-08-12T12:00:00Z");
    const state = (starts: string, ends: string | null, archived = false) =>
      noticeState(
        {
          startsAt: new Date(starts),
          endsAt: ends ? new Date(ends) : null,
          archivedAt: archived ? now : null,
        },
        now
      );

    expect(state("2026-08-12T14:00:00Z", null)).toBe("kommande");
    expect(state("2026-08-12T10:00:00Z", "2026-08-12T14:00:00Z")).toBe("pågår");
    expect(state("2026-08-12T08:00:00Z", "2026-08-12T10:00:00Z")).toBe(
      "avslutat"
    );
    expect(state("2026-08-12T10:00:00Z", null, true)).toBe("arkiverat");
  });
});
