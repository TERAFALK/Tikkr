"use client";

import { useState } from "react";
import { TimeField } from "@/components/ui";
import { IconClose, IconPlus } from "@/components/ui/icons";
import { parseMinuteOfDay } from "@/lib/schedule";
import { formatDuration } from "@/lib/format";

/**
 * VECKANS DAGAR SOM FÄLT.
 *
 * Bara rutnätet, ingen ram och ingen sparaknapp. Det gör att samma fält kan
 * stå på två ställen: i inställningarnas schemasida, där de sätter företagets
 * standard, och i rutan under Anställda, där de ger en person egna tider.
 *
 * Fältnamnen är formulärets avtal med servern (`active-1`, `start-1`,
 * `break-start-1` och så vidare) och läses på ett enda ställe, av
 * `readScheduleDays` i lib/schedule.ts.
 *
 * Planerad tid är NETTO efter rast. Kundens mån–tors 06:30–16:00 med tjugo
 * minuters frukost och fyrtio minuters lunch är 8,5 timmar, inte 9,5. Summan
 * räknas medan man skriver, eftersom en verkstad vet vad veckan ska bli och
 * ett fel i schemat annars upptäcks först som ett felaktigt flexsaldo.
 */

const DAYS = [
  { weekday: 1, label: "Måndag" },
  { weekday: 2, label: "Tisdag" },
  { weekday: 3, label: "Onsdag" },
  { weekday: 4, label: "Torsdag" },
  { weekday: 5, label: "Fredag" },
  { weekday: 6, label: "Lördag" },
  { weekday: 7, label: "Söndag" },
];

export interface ScheduleDayValue {
  weekday: number;
  start: string;
  end: string;
  breaks: { start: string; end: string }[];
}

interface DayState extends ScheduleDayValue {
  active: boolean;
  /** Stabila nycklar för rastraderna. */
  keys: number[];
}

export default function ScheduleDays({
  initial,
  compact = false,
}: {
  initial: ScheduleDayValue[];
  /** Tätare rader. Används i rutan under Anställda, där ytan är mindre. */
  compact?: boolean;
}) {
  const [days, setDays] = useState<DayState[]>(() =>
    DAYS.map(({ weekday }) => {
      const found = initial.find((d) => d.weekday === weekday);
      return {
        weekday,
        active: Boolean(found),
        start: found?.start ?? "07:00",
        end: found?.end ?? "16:00",
        breaks: found?.breaks ?? [],
        keys: (found?.breaks ?? []).map((_, index) => index),
      };
    })
  );

  const [nextKey, setNextKey] = useState(100);

  function update(weekday: number, patch: Partial<DayState>) {
    setDays((current) =>
      current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day))
    );
  }

  function addBreak(weekday: number) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              breaks: [...day.breaks, { start: "", end: "" }],
              keys: [...day.keys, nextKey],
            }
          : day
      )
    );
    setNextKey((key) => key + 1);
  }

  function removeBreak(weekday: number, index: number) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              breaks: day.breaks.filter((_, i) => i !== index),
              keys: day.keys.filter((_, i) => i !== index),
            }
          : day
      )
    );
  }

  function setBreak(
    weekday: number,
    index: number,
    patch: { start?: string; end?: string }
  ) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday
          ? {
              ...day,
              breaks: day.breaks.map((rest, i) =>
                i === index ? { ...rest, ...patch } : rest
              ),
            }
          : day
      )
    );
  }

  /** Planerad tid netto för en dag, i minuter. Samma räkning som servern. */
  function plannedMinutes(day: DayState): number {
    if (!day.active) return 0;

    const start = parseMinuteOfDay(day.start);
    const end = parseMinuteOfDay(day.end);
    if (start === null || end === null || end <= start) return 0;

    const breaks = day.breaks.reduce((total, rest) => {
      const from = parseMinuteOfDay(rest.start);
      const to = parseMinuteOfDay(rest.end);
      if (from === null || to === null) return total;
      return total + Math.max(0, Math.min(to, end) - Math.max(from, start));
    }, 0);

    return Math.max(0, end - start - breaks);
  }

  const weekMinutes = days.reduce((total, day) => total + plannedMinutes(day), 0);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <p className="text-right text-[13px] tabular-nums text-neutral-500">
        Planerad vecka{" "}
        <span className="font-medium text-neutral-900">
          {hours(weekMinutes)} tim
        </span>
      </p>

      {days.map((day) => {
        const label = DAYS.find((d) => d.weekday === day.weekday)!.label;

        return (
          <div
            key={day.weekday}
            className={`rounded-lg border ${compact ? "p-3" : "p-4"} ${
              day.active
                ? "border-neutral-200 bg-white"
                : "border-neutral-100 bg-neutral-50/60"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <label
                className={`flex shrink-0 cursor-pointer items-center gap-2 ${
                  compact ? "w-24" : "w-32"
                }`}
              >
                <input
                  type="checkbox"
                  name={`active-${day.weekday}`}
                  checked={day.active}
                  onChange={(event) =>
                    update(day.weekday, { active: event.target.checked })
                  }
                  className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
                />
                <span className="text-[13px] font-medium text-neutral-900">
                  {label}
                </span>
              </label>

              {day.active ? (
                <>
                  <TimeField
                    name={`start-${day.weekday}`}
                    value={day.start}
                    onValueChange={(value) =>
                      update(day.weekday, { start: value })
                    }
                    placeholder="06:30"
                    aria-label={`${label} börjar`}
                  />
                  <span className="text-neutral-400">–</span>
                  <TimeField
                    name={`end-${day.weekday}`}
                    value={day.end}
                    onValueChange={(value) => update(day.weekday, { end: value })}
                    placeholder="16:00"
                    aria-label={`${label} slutar`}
                  />

                  <span className="ml-auto text-[13px] tabular-nums text-neutral-500">
                    {hours(plannedMinutes(day))} tim
                  </span>
                </>
              ) : (
                <span className="text-[13px] text-neutral-400">Arbetsfri</span>
              )}
            </div>

            {day.active && (
              <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                {day.breaks.map((rest, index) => (
                  <div
                    key={day.keys[index]}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span
                      className={`shrink-0 text-[13px] text-neutral-500 ${
                        compact ? "w-24" : "w-32"
                      }`}
                    >
                      Rast
                    </span>
                    <TimeField
                      name={`break-start-${day.weekday}`}
                      value={rest.start}
                      onValueChange={(value) =>
                        setBreak(day.weekday, index, { start: value })
                      }
                      placeholder="09:00"
                      aria-label="Rasten börjar"
                    />
                    <span className="text-neutral-400">–</span>
                    <TimeField
                      name={`break-end-${day.weekday}`}
                      value={rest.end}
                      onValueChange={(value) =>
                        setBreak(day.weekday, index, { end: value })
                      }
                      placeholder="09:20"
                      aria-label="Rasten slutar"
                    />
                    <button
                      type="button"
                      onClick={() => removeBreak(day.weekday, index)}
                      aria-label="Ta bort rasten"
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                      <IconClose />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addBreak(day.weekday)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-blue-700 hover:bg-blue-50"
                >
                  <IconPlus />
                  Lägg till rast
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Planerad tid som text.
 *
 * Tim:min, som all visad tid i systemet. Stod i decimaltimmar till
 * 2026-10-01, vilket gjorde att en dag på 8,50 och ett flexsaldo på 8:30 såg
 * ut som olika tal fastän de är samma. Se format.ts.
 */
function hours(minutes: number): string {
  return formatDuration(minutes);
}
