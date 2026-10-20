import type { CompanyDb } from "./tenant";
import { blocksInWeek, hoursOn, stationsFor } from "./planning";
import { staffBlocksInWeek } from "./staff-planning";
import {
  hoursForEmployee,
  hoursOnDay,
  loadStaffHours,
} from "./staff-hours";
import { progressFor, type LiveBlock } from "./plan-live";
import { PLANNING_MODES, type PlanningModeKey } from "./planning-modes";
import { addDaysInZone, startOfDayIn } from "./time-zone";

/**
 * DAGENS PLAN, FÖR ÖVERSIKTEN (2026-10-20).
 *
 * Svarar på en fråga: har dagens körningar kommit igång? Tavlan svarar på
 * samma fråga för en hel vecka, och den här filen räknar med tavlans egna
 * delar — rutorna ur planning.ts och staff-planning.ts, utfallet ur
 * plan-live.ts — så att översikten aldrig säger något annat än tavlan.
 *
 * Läget avgör vad som räknas, som på tavlan: i Produktion stationernas rutor,
 * i Tjänst personalens pass. Bemanningen i Produktion visas inte här; den är
 * inte det som räknar av beräkningen.
 *
 * Läser bara. Planeringen skriver aldrig till stämplingen, och översikten
 * skriver ingenting alls.
 */

export type PlanStatus = "running" | "upcoming" | "late" | "stopped";

export interface TodayRow {
  id: string;
  /** Stationens eller personens namn. */
  resource: string;
  orderNumber: string;
  momentName: string;
  startsAt: Date;
  /** Planerade arbetsminuter. */
  minutes: number;
  /** Stämplat inom rutan, eller null när ingenting stämplats. */
  clockedMinutes: number | null;
  status: PlanStatus;
}

/**
 * Var en ruta står.
 *
 * Pågår vinner över allt: någon står instämplad. En ruta som inte börjat än
 * väntar. En som borde ha börjat men saknar all stämpling är "ej startad" —
 * det enda läget som är värt en varning. Har den fått tid men ingen står
 * instämplad nu har den stannat, vilket kan betyda klar eller paus; talen
 * bredvid säger vilket.
 */
export function planStatus(
  startsAt: Date,
  progress: { running: boolean; clockedMinutes: number } | undefined,
  now: Date
): PlanStatus {
  if (progress?.running) return "running";
  if (now < startsAt) return "upcoming";
  if (!progress || progress.clockedMinutes === 0) return "late";
  return "stopped";
}

export async function planToday(
  db: CompanyDb,
  timeZone: string,
  mode: PlanningModeKey,
  now: Date = new Date()
): Promise<TodayRow[]> {
  const from = startOfDayIn(now, timeZone);
  const to = addDaysInZone(from, 1, timeZone);
  const isToday = (instant: Date) => instant >= from && instant < to;

  // Det som räknar av beräkningen i läget, som på tavlan.
  if (PLANNING_MODES[mode].countsBudget === "staff") {
    const [passes, hours] = await Promise.all([
      staffBlocksInWeek(db, from, timeZone),
      loadStaffHours(db),
    ]);
    const today = passes.filter((pass) => isToday(pass.startsAt));

    const live: LiveBlock[] = today.map((pass) => ({
      id: pass.id,
      employeeId: pass.employeeId,
      orderId: pass.orderId,
      momentId: pass.momentId,
      startsAt: pass.startsAt,
      minutes: pass.minutes,
      hours:
        hoursOnDay(
          hoursForEmployee(hours, pass.employeeId),
          pass.startsAt,
          timeZone
        ) ?? null,
    }));
    const progress = await progressFor(db, live, timeZone, now);

    return today.map((pass) => ({
      id: pass.id,
      resource: pass.employeeName,
      orderNumber: pass.orderNumber,
      momentName: pass.momentName,
      startsAt: pass.startsAt,
      minutes: pass.minutes,
      clockedMinutes: progress.get(pass.id)?.clockedMinutes ?? null,
      status: planStatus(pass.startsAt, progress.get(pass.id), now),
    }));
  }

  const [stations, blocks] = await Promise.all([
    stationsFor(db, timeZone),
    blocksInWeek(db, from, timeZone),
  ]);
  const byId = new Map(stations.map((station) => [station.id, station]));
  const today = blocks.filter((block) => isToday(block.startsAt));

  const live: LiveBlock[] = today.map((block) => {
    const station = byId.get(block.stationId);

    return {
      id: block.id,
      orderId: block.orderId,
      momentId: block.momentId,
      startsAt: block.startsAt,
      minutes: block.minutes,
      hours: station ? hoursOn(station.hours, block.startsAt, timeZone) : null,
    };
  });
  const progress = await progressFor(db, live, timeZone, now);

  return today.map((block) => ({
    id: block.id,
    resource: byId.get(block.stationId)?.name ?? "",
    orderNumber: block.orderNumber,
    momentName: block.momentName,
    startsAt: block.startsAt,
    minutes: block.minutes,
    clockedMinutes: progress.get(block.id)?.clockedMinutes ?? null,
    status: planStatus(block.startsAt, progress.get(block.id), now),
  }));
}

