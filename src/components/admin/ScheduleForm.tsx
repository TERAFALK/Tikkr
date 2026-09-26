"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ScheduleFormState } from "@/app/admin/(panel)/installningar/schema/actions";
import { Alert, Button, Card, CardHeader } from "@/components/ui";
import { IconClose, IconPlus } from "@/components/ui/icons";
import { formatMinuteOfDay, parseMinuteOfDay } from "@/lib/schedule";

/**
 * VECKOSCHEMAT.
 *
 * Schemat ger den PLANERADE tiden, och det är den siffran flexsaldot mäts mot.
 * Därför räknas veckototalen fram medan man skriver: en verkstad vet att
 * veckan ska bli 40 timmar, och stämmer inte summan är schemat fel innan det
 * hunnit ge någon ett felaktigt saldo.
 *
 * Planerad tid är NETTO efter rast. Kundens mån–tors 06:30–16:00 med tjugo
 * minuters frukost och fyrtio minuters lunch är 8,5 timmar, inte 9,5.
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

export default function ScheduleForm({
  action,
  initial,
}: {
  action: (
    previous: ScheduleFormState,
    formData: FormData
  ) => Promise<ScheduleFormState>;
  initial: ScheduleDayValue[];
}) {
  const [state, submit] = useActionState<ScheduleFormState, FormData>(
    action,
    {}
  );

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
      return (
        total +
        Math.max(0, Math.min(to, end) - Math.max(from, start))
      );
    }, 0);

    return Math.max(0, end - start - breaks);
  }

  const weekMinutes = days.reduce((total, day) => total + plannedMinutes(day), 0);

  return (
    <form action={submit}>
      <Card>
        <CardHeader
          title="Veckoschema"
          action={
            <span className="text-[13px] tabular-nums text-neutral-500">
              Planerad vecka{" "}
              <span className="font-medium text-neutral-900">
                {hours(weekMinutes)} tim
              </span>
            </span>
          }
        />

        <div className="space-y-3 p-5">
          {state.error && <Alert>{state.error}</Alert>}

          {days.map((day) => {
            const label = DAYS.find((d) => d.weekday === day.weekday)!.label;

            return (
              <div
                key={day.weekday}
                className={`rounded-lg border p-4 ${
                  day.active
                    ? "border-neutral-200 bg-white"
                    : "border-neutral-100 bg-neutral-50/60"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex w-32 shrink-0 cursor-pointer items-center gap-2">
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
                      <TimeInput
                        name={`start-${day.weekday}`}
                        value={day.start}
                        onChange={(value) => update(day.weekday, { start: value })}
                        label={`${label} börjar`}
                      />
                      <span className="text-neutral-400">–</span>
                      <TimeInput
                        name={`end-${day.weekday}`}
                        value={day.end}
                        onChange={(value) => update(day.weekday, { end: value })}
                        label={`${label} slutar`}
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
                        <span className="w-32 shrink-0 text-[13px] text-neutral-500">
                          Rast
                        </span>
                        <TimeInput
                          name={`break-start-${day.weekday}`}
                          value={rest.start}
                          onChange={(value) =>
                            setBreak(day.weekday, index, { start: value })
                          }
                          label="Rasten börjar"
                        />
                        <span className="text-neutral-400">–</span>
                        <TimeInput
                          name={`break-end-${day.weekday}`}
                          value={rest.end}
                          onChange={(value) =>
                            setBreak(day.weekday, index, { end: value })
                          }
                          label="Rasten slutar"
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

        <div className="flex items-center justify-end gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          {state.savedAt && (
            <span className="text-[13px] text-emerald-700">Sparat</span>
          )}
          <SaveButton />
        </div>
      </Card>
    </form>
  );
}

/**
 * Klockslagsfält.
 *
 * `type="text"` och inte `type="time"`: webbläsarens egen tidväljare ser olika
 * ut i varje webbläsare, och på en dator är den långsammare att fylla i än
 * fyra siffror. Formatet kontrolleras ändå på servern.
 */
function TimeInput({
  name,
  value,
  onChange,
  label,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <input
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => {
        // Städar "630" till "06:30" när fältet lämnas, men bara när det går
        // att tolka. Ett obegripligt värde står kvar som skrivet, så att det
        // syns vad man råkade skriva.
        const parsed = parseMinuteOfDay(event.target.value);
        if (parsed !== null) onChange(formatMinuteOfDay(parsed));
      }}
      inputMode="numeric"
      placeholder="06:30"
      aria-label={label}
      autoComplete="off"
      className="w-20 rounded-md border-0 bg-white px-2.5 py-1.5 text-center text-[13px] tabular-nums text-neutral-900 ring-1 ring-inset ring-neutral-200 focus:ring-2 focus:ring-inset focus:ring-blue-600"
    />
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : "Spara schema"}
    </Button>
  );
}

function hours(minutes: number): string {
  return (minutes / 60).toFixed(2).replace(".", ",");
}
