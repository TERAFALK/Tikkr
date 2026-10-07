"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { TimesheetState } from "@/app/admin/(panel)/tidrapport/actions";
import {
  Alert,
  Button,
  dialogBody,
  dialogEdge,
  dialogSurface,
  Field,
  Input,
  Select,
} from "@/components/ui";

/**
 * RUTAN DÄR FRÅNVARO REGISTRERAS.
 *
 * Öppnas från en dag i tidrapporten, med datumet ifyllt. Slutdatum finns för
 * att en sjukperiod sällan är en enda dag, och att knappa in fem dagar var för
 * sig är fem tillfällen att missa en.
 *
 * Antalet timmar lämnas normalt tomt — en sjukdag är en hel dag, och systemet
 * vet från schemat hur lång den var. Fältet finns för halvdagar.
 */
export default function AbsenceDialog({
  action,
  employeeId,
  employeeName,
  date,
  reasons,
  onClose,
}: {
  action: (
    previous: TimesheetState,
    formData: FormData
  ) => Promise<TimesheetState>;
  employeeId: string;
  employeeName: string;
  /** "2026-09-21", eller null när rutan är stängd. */
  date: string | null;
  /** Kundens egna orsaker, de aktiva, i sin ordning. */
  reasons: { id: string; name: string }[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, submit] = useActionState<TimesheetState, FormData>(action, {});

  useEffect(() => {
    if (date && !dialog.current?.open) dialog.current?.showModal();
    if (!date && dialog.current?.open) dialog.current?.close();
  }, [date]);

  useEffect(() => {
    if (state.savedAt) onClose();
  }, [state.savedAt, onClose]);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className={`w-[min(40rem,calc(100vw-2rem))] ${dialogSurface}`}
    >
      <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
        <h2 className="text-sm font-semibold text-neutral-900">
          Registrera frånvaro
        </h2>
        <p className="mt-0.5 text-[13px] text-neutral-500">{employeeName}</p>
      </div>

      <form action={submit} className="flex min-h-0 flex-1 flex-col">
        <div className={`${dialogBody} space-y-4 px-5 py-5`}>
          {state.error && <Alert>{state.error}</Alert>}

          <input type="hidden" name="employeeId" value={employeeId} />

          {/* Orsakerna är kundens egna och läggs upp under Inställningar.
              Finns inga går det inte att registrera frånvaro, och rutan säger
              var man lägger upp dem i stället för att visa en tom lista. */}
          {reasons.length === 0 ? (
            <Alert tone="warning">
              Inga frånvaroorsaker upplagda. Lägg upp dem under Inställningar,
              Frånvaroorsaker.
            </Alert>
          ) : (
            <Field label="Orsak">
              <Select name="reasonId" required>
                {reasons.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Från och med">
              <Input
                type="date"
                name="from"
                defaultValue={date ?? ""}
                required
                key={date ?? "tom"}
              />
            </Field>
            <Field label="Till och med" hint="Tomt ger en dag">
              <Input type="date" name="to" />
            </Field>
          </div>

          <Field
            label="Antal timmar"
            hint="Tim:min, t.ex. 4:00. Tomt ger hela den schemalagda dagen"
          >
            <Input
              name="hours"
              inputMode="decimal"
              placeholder="4:00"
              autoComplete="off"
            />
          </Field>

          <Field label="Anteckning" hint="Valfritt">
            <Input name="note" autoComplete="off" />
          </Field>
        </div>

        <div
          className={`${dialogEdge} flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
        >
          <Button type="button" tone="secondary" onClick={onClose}>
            Avbryt
          </Button>
          <SaveButton disabled={reasons.length === 0} />
        </div>
      </form>
    </dialog>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Sparar…" : "Spara"}
    </Button>
  );
}
