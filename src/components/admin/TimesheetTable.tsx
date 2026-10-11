"use client";

import { useState } from "react";
import { Badge, Button, Card, CardHeader, Table, Td, Th, Tr } from "@/components/ui";
import { formatDuration, formatSignedDuration } from "@/lib/format";
import ConfirmButton from "./ConfirmButton";

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
  absences: {
    id: string;
    /** Orsakens namn, som kunden själv skrivit det. */
    reason: string;
    minutes: number;
    note: string | null;
    /** Orsaken drar på komptiden, och uttaget tas bort med frånvaron. */
    withdrawsComp: boolean;
  }[];
  /**
   * Komptid som registrerats för hand. Uttag som en frånvaro skrivit står
   * inte här: de hör till frånvaron och tas bort med den.
   */
  comp: { id: string; minutes: number; note: string | null }[];
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
  onAddComp,
  deleteAbsenceAction,
  deleteCompAction,
}: {
  days: TimesheetDayRow[];
  /** Öppnar frånvarorutan för en dag. */
  onMarkAbsence: (date: string) => void;
  /** Öppnar komptidsrutan för en dag. Saknas för en timanställd. */
  onAddComp?: (date: string) => void;
  deleteAbsenceAction: (formData: FormData) => Promise<void>;
  deleteCompAction: (formData: FormData) => Promise<void>;
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
            // Frånvaron och komptiden räknas som detaljer, eftersom det är i
            // den utfällda raden de går att ta bort.
            const hasDetail =
              day.entries.length > 0 ||
              day.breaks.length > 0 ||
              day.absences.length > 0 ||
              day.comp.length > 0;

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
                      <Badge tone="warning">{absence.reason}</Badge>
                    </span>
                  ))}
                  {day.comp.length > 0 && (
                    <span className="ml-2">
                      <Badge tone="active">Komptid</Badge>
                    </span>
                  )}
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
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      tone="ghost"
                      onClick={() => onMarkAbsence(day.date)}
                    >
                      Frånvaro
                    </Button>
                    {onAddComp && (
                      <Button
                        type="button"
                        tone="ghost"
                        onClick={() => onAddComp(day.date)}
                      >
                        Komptid
                      </Button>
                    )}
                  </div>
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

                      {day.absences.map((absence) => (
                        <DetailRow
                          key={absence.id}
                          id={absence.id}
                          label={absence.reason}
                          note={absence.note}
                          value={formatDuration(absence.minutes)}
                          action={deleteAbsenceAction}
                          question={
                            `Ta bort frånvaron ${absence.reason} ${day.dayLabel}?` +
                            (absence.withdrawsComp
                              ? " Uttaget ur komptiden tas också bort."
                              : "")
                          }
                        />
                      ))}

                      {day.comp.map((row) => (
                        <DetailRow
                          key={row.id}
                          id={row.id}
                          label="Komptid"
                          note={row.note}
                          value={formatSignedDuration(row.minutes)}
                          action={deleteCompAction}
                          question={`Ta bort komptiden ${formatSignedDuration(
                            row.minutes
                          )} ${day.dayLabel}?`}
                        />
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

/**
 * En frånvaropost eller komprad i den utfällda dagen, med knappen som tar
 * bort den.
 *
 * Rättelse sker genom att ta bort och lägga in på nytt. Frånvaron skriver
 * dessutom över sig själv: samma dag och orsak två gånger är en rättelse, se
 * markAbsence.
 */
function DetailRow({
  id,
  label,
  note,
  value,
  action,
  question,
}: {
  id: string;
  label: string;
  note: string | null;
  value: string;
  action: (formData: FormData) => Promise<void>;
  question: string;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 text-[13px]">
      <span className="w-28 shrink-0" />
      <span className="font-medium text-neutral-900">{label}</span>
      {note && <span className="text-neutral-500">{note}</span>}
      <span className="ml-auto tabular-nums text-neutral-600">{value}</span>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <ConfirmButton type="submit" tone="ghost" question={question}>
          Ta bort
        </ConfirmButton>
      </form>
    </li>
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
      {formatSignedDuration(minutes)}
    </span>
  );
}
