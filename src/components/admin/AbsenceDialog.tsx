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
import { ABSENCE_LABELS, ABSENCE_ORDER } from "@/lib/absence";

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
      className={`w-[min(28rem,calc(100vw-2rem))] ${dialogSurface}`}
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

          <Field label="Orsak">
            <Select name="type" defaultValue="SJUK" required>
              {ABSENCE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {ABSENCE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

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

          <Field label="Antal timmar" hint="Tomt ger hela den schemalagda dagen">
            <Input
              name="hours"
              inputMode="decimal"
              placeholder="4"
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
          <SaveButton />
        </div>
      </form>
    </dialog>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : "Spara"}
    </Button>
  );
}
