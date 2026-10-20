import { describe, expect, it } from "vitest";
import { planStatus } from "@/lib/plan-today";

/**
 * Var en planerad ruta står på översikten, se plan-today.ts.
 *
 * Bara "ej startad" är en varning, och den får inte slå till för en ruta som
 * fått tid eller som inte börjat än. En översikt som larmar i onödan lär
 * ögat att hoppa över gult.
 */

const start = new Date("2026-10-20T08:00:00Z");
const before = new Date("2026-10-20T07:30:00Z");
const after = new Date("2026-10-20T09:00:00Z");

describe("planStatus", () => {
  it("väntar innan rutan börjat", () => {
    expect(planStatus(start, undefined, before)).toBe("upcoming");
  });

  it("är ej startad när starten passerats utan någon stämpling", () => {
    expect(planStatus(start, undefined, after)).toBe("late");
    expect(planStatus(start, { running: false, clockedMinutes: 0 }, after)).toBe(
      "late"
    );
  });

  it("pågår när någon står instämplad, även före planerad start", () => {
    expect(planStatus(start, { running: true, clockedMinutes: 0 }, before)).toBe(
      "running"
    );
    expect(planStatus(start, { running: true, clockedMinutes: 30 }, after)).toBe(
      "running"
    );
  });

  it("har stannat när den fått tid men ingen står instämplad", () => {
    expect(
      planStatus(start, { running: false, clockedMinutes: 45 }, after)
    ).toBe("stopped");
  });
});
