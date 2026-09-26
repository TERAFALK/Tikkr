"use client";

import { useState } from "react";
import type { AbsenceType } from "@prisma/client";
import { Badge, Button, Card, CardHeader, Table, Td, Th, Tr } from "@/components/ui";
import { ABSENCE_LABELS } from "@/lib/absence";
import { formatDuration } from "@/lib/format";

/**
 * TIDRAPPORTEN, DAG FÖR DAG.
 *
 * Varje dag är en rad; stämplingarna under den fälls ut vid klick. En vecka
 * med trettio stämplingar är oläslig om allt står utskrivet, och den fråga man
 * kommer med är nästan alltid "stämmer dagarna", inte "vad gjorde hen 09:13".
 *
 * Tiden visas som DECIMALTIMMAR i summeringen och som tim:min i raderna. Det
 * är inte en inkonsekvens: kundens gamla rapport skriver decimaltimmar i
 * sammanställningen, och det är den siffran de känner igen och räknar vidare
 * på. En enskild dag läses däremot lättare som 8:30 än som 8,50.
 */

export interface TimesheetDayRow {
  date: string;
  dayLabel: string;
  weekday: number;
  plannedMinutes: number;
  workedMinutes: number;
  productiveMinutes: number;
  indirectMinutes: number;
  breakMinutes: number;
  absenceMinutes: number;
  flexMinutes: number;
  absences: { id: string; type: AbsenceType; minutes: number; note: string | null }[];
  entries: {
    id: string;
    from: string;
    to: string | null;
    minutes: number;
    label: string;
    momentName: string | null;
    kind: "ORDER" | "INDIRECT";
    needsReview: boolean;
  }[];
  breaks: { id: string; name: string; from: string; to: string | null; minutes: number }[];
}

export default function TimesheetTable({
  days,
  onMarkAbsence,
}: {
  days: TimesheetDayRow[];
  /** Öppnar frånvarorutan för en dag. */
  onMarkAbsence: (date: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(date: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader title="Dag för dag" />
      <Table>
        <thead>
          <tr>
            <Th>Dag</Th>
            <Th numeric>Planerad</Th>
            <Th numeric>Arbetad</Th>
            <Th numeric>Rast</Th>
            <Th numeric>Frånvaro</Th>
            <Th numeric>Flex</Th>
            <Th>
              <span className="sr-only">Åtgärd</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const expanded = open.has(day.date);
            const restDay = day.plannedMinutes === 0;
            const hasDetail = day.entries.length > 0 || day.breaks.length > 0;

            return [
              <Tr key={day.date} dimmed={restDay && day.workedMinutes === 0}>
                <Td>
                  <button
                    type="button"
                    onClick={() => hasDetail && toggle(day.date)}
                    className={`text-left font-medium ${
                      hasDetail
                        ? "rounded text-neutral-900 underline-offset-4 hover:underline"
                        : "cursor-default text-neutral-500"
                    }`}
                  >
                    {day.dayLabel}
                  </button>
                  {day.absences.map((absence) => (
                    <span key={absence.id} className="ml-2">
                      <Badge tone="warning">{ABSENCE_LABELS[absence.type]}</Badge>
                    </span>
                  ))}
                </Td>
                <Td numeric muted>
                  {day.plannedMinutes === 0 ? "—" : formatDuration(day.plannedMinutes)}
                </Td>
                <Td numeric>
                  {day.workedMinutes === 0 ? "—" : formatDuration(day.workedMinutes)}
                </Td>
                <Td numeric muted>
                  {day.breakMinutes === 0 ? "—" : formatDuration(day.breakMinutes)}
                </Td>
                <Td numeric muted>
                  {day.absenceMinutes === 0 ? "—" : formatDuration(day.absenceMinutes)}
                </Td>
                <Td numeric>
                  <Flex minutes={day.flexMinutes} />
                </Td>
                <Td>
                  <Button
                    type="button"
                    tone="ghost"
                    onClick={() => onMarkAbsence(day.date)}
                  >
                    Frånvaro
                  </Button>
                </Td>
              </Tr>,

              expanded && (
                <tr key={`${day.date}-detalj`} className="bg-neutral-50/70">
                  <td colSpan={7} className="px-5 py-3">
                    <ul className="space-y-1.5">
                      {day.entries.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex flex-wrap items-baseline gap-x-3 text-[13px]"
                        >
                          <span className="w-28 shrink-0 tabular-nums text-neutral-500">
                            {entry.from}–{entry.to ?? "pågår"}
                          </span>
                          <span className="font-medium text-neutral-900">
                            {entry.label}
                          </span>
                          {entry.momentName && (
                            <span className="text-neutral-500">
                              {entry.momentName}
                            </span>
                          )}
                          {entry.kind === "INDIRECT" && (
                            <Badge tone="muted">Improduktiv</Badge>
                          )}
                          {entry.needsReview && (
                            <Badge tone="warning">Beräknad sluttid</Badge>
                          )}
                          <span className="ml-auto tabular-nums text-neutral-600">
                            {formatDuration(entry.minutes)}
                          </span>
                        </li>
                      ))}

                      {day.breaks.map((rest) => (
                        <li
                          key={rest.id}
                          className="flex flex-wrap items-baseline gap-x-3 text-[13px] text-neutral-500"
                        >
                          <span className="w-28 shrink-0 tabular-nums">
                            {rest.from}–{rest.to ?? "pågår"}
                          </span>
                          <span>{rest.name}</span>
                          <span className="ml-auto tabular-nums">
                            {formatDuration(rest.minutes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </Table>
    </Card>
  );
}

/** Flexvärde med tecken. Plus är grönt, minus gult — aldrig rött. */
function Flex({ minutes }: { minutes: number }) {
  if (Math.round(minutes) === 0) {
    return <span className="text-neutral-400">0:00</span>;
  }

  const positive = minutes > 0;

  return (
    <span
      className={`font-medium tabular-nums ${
        positive ? "text-emerald-700" : "text-amber-700"
      }`}
    >
      {positive ? "+" : "−"}
      {formatDuration(Math.abs(minutes))}
    </span>
  );
}
