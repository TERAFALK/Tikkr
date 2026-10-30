import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * VAD STÄMPLINGSRUTTEN TAR EMOT.
 *
 * Kroppen är JSON och kan bära vad som helst. Ett objekt i ett id-fält går
 * annars rakt in i Prismas `where` och tolkas som ett filter, så att ett anrop
 * som ser ut att gälla en person gäller alla i företaget. Tenant-lagret stoppar
 * det vid företagsgränsen, men inte inom företaget.
 *
 * Prövas mot rutten och inte mot clock.ts, eftersom rutten är där kroppen läses.
 * Stämplingslogiken är utbytt: det som ska bevisas är att den aldrig nås.
 */

const clock = vi.hoisted(() => ({
  clockIn: vi.fn(async () => ({ started: {}, autoClosed: null, wasDuplicate: false })),
  clockOut: vi.fn(async () => null),
  clockOutAll: vi.fn(async () => []),
  startBreak: vi.fn(async () => ({ started: {}, closedJobs: 0, wasDuplicate: false })),
  endBreak: vi.fn(async () => null),
}));

vi.mock("@/lib/clock", () => ({
  ClockError: class extends Error {},
  clockIn: clock.clockIn,
  clockOut: clock.clockOut,
  clockOutAll: clock.clockOutAll,
}));

vi.mock("@/lib/breaks", () => ({
  startBreak: clock.startBreak,
  endBreak: clock.endBreak,
}));

vi.mock("@/lib/company-modules", () => ({ hasModule: async () => true }));

vi.mock("@/lib/kiosk-auth", () => ({
  getKioskSession: async () => ({
    deviceId: "skarm",
    deviceName: "Porten",
    companyId: "foretag",
    companyName: "Företaget",
  }),
  refreshKioskCookie: async () => {},
  touchDevice: async () => {},
}));

const { POST } = await import("@/app/api/kiosk/punch/route");

function punch(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/kiosk/punch", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

function expectNothingCalled() {
  for (const fn of Object.values(clock)) expect(fn).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const fn of Object.values(clock)) fn.mockClear();
});

/** Det som inte är text, och som Prisma annars kan tolka som ett filter. */
const NOT_TEXT = [{ not: "x" }, { contains: "" }, ["x"], 1, true];

describe("id-fälten är text", () => {
  const FIELDS = [
    "employeeId",
    "orderId",
    "momentId",
    "indirectMomentId",
    "breakTypeId",
    "clientPunchId",
  ];

  for (const field of FIELDS) {
    it(`${field} avvisas när det inte är text`, async () => {
      for (const value of NOT_TEXT) {
        const response = await punch({
          action: "out-all",
          employeeId: "anna",
          [field]: value,
        });

        expect(response.status, JSON.stringify(value)).toBe(400);
      }

      expectNothingCalled();
    });
  }

  it("ett filter i employeeId når aldrig stämplingen, oavsett åtgärd", async () => {
    for (const action of ["in", "out", "out-all", "break", "break-end"]) {
      const response = await punch({
        action,
        employeeId: { not: "finns-inte" },
        orderId: "order",
        momentId: "moment",
        breakTypeId: "rast",
      });

      expect(response.status, action).toBe(400);
    }

    expectNothingCalled();
  });

  it("ett orimligt långt id avvisas", async () => {
    const response = await punch({
      action: "out-all",
      employeeId: "a".repeat(201),
    });

    expect(response.status).toBe(400);
    expectNothingCalled();
  });
});

describe("tiderna är text", () => {
  it("at och sentAt avvisas när de inte är text", async () => {
    for (const field of ["at", "sentAt"]) {
      for (const value of NOT_TEXT) {
        const response = await punch({
          action: "out-all",
          employeeId: "anna",
          [field]: value,
        });

        expect(response.status, `${field} ${JSON.stringify(value)}`).toBe(400);
      }
    }

    expectNothingCalled();
  });
});

describe("riktiga tryck går igenom som förut", () => {
  it("ett vanligt tryck når stämplingen med personens id", async () => {
    const response = await punch({
      action: "out-all",
      employeeId: "anna",
      clientPunchId: "6f1f0d3c-1f6e-4a4e-9a51-0e6f6a1d2b77",
      at: new Date().toISOString(),
      sentAt: new Date().toISOString(),
    });

    expect(response.status).toBe(200);
    expect(clock.clockOutAll).toHaveBeenCalledTimes(1);
    expect(clock.clockOutAll).toHaveBeenCalledWith(
      "foretag",
      expect.objectContaining({ employeeId: "anna" })
    );
  });

  it("ett tryck utan moment från en äldre skärm går igenom", async () => {
    // Sådana tryck ligger kvar i köerna, se clockOut. Ett 4xx hade kastat dem.
    for (const momentId of [undefined, null]) {
      const response = await punch({ action: "out", employeeId: "anna", momentId });
      expect(response.status).toBe(200);
    }

    expect(clock.clockOut).toHaveBeenCalledTimes(2);
  });

  it("en tid som inte går att tolka avvisas inte, den flaggas längre in", async () => {
    // Skärmens klocka kan vara trasig, och trycket är lika äkta för det. Se
    // punch-time.ts.
    const response = await punch({
      action: "out-all",
      employeeId: "anna",
      at: "trasig tid",
    });

    expect(response.status).toBe(200);
    expect(clock.clockOutAll).toHaveBeenCalledWith(
      "foretag",
      expect.objectContaining({ rejectedAt: "trasig tid" })
    );
  });
});
