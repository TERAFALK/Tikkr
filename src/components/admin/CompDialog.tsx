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
} from "@/components/ui";

/**
 * RUTAN DÄR GODKÄND KOMPTID REGISTRERAS.
 *
 * Intjänad komp uppstår aldrig av sig själv. Tid utöver schemat är flex till
 * dess att någon beslutat att den är övertid, och det här är stället där det
 * beslutet skrivs ner. Minuterna flyttas då ur dagens flex och in i
 * komptidsboken, se flexformeln i payroll.ts.
 *
 * Öppnas från en dag i tidrapporten, med datumet ifyllt: komptiden hör till
 * dagen övertiden gjordes, eftersom det är den dagens flex som ska minska.
 *
 * Visas inte för en timanställd. Åtgärden avvisar hen ändå, se addCompEarned.
 */
export default function CompDialog({
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
  const form = useRef<HTMLFormElement>(null);
  const [state, submit] = useActionState<TimesheetState, FormData>(action, {});

  useEffect(() => {
    if (date && !dialog.current?.open) dialog.current?.showModal();
    if (!date && dialog.current?.open) dialog.current?.close();
  }, [date]);

  // Stänger EN gång per sparning. Samma skäl som i AbsenceDialog: `onClose`
  // skapas om vid varje rendering, och `savedAt` står kvar satt.
  const handled = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state.savedAt || state.savedAt === handled.current) return;

    handled.current = state.savedAt;
    onClose();
  }, [state.savedAt, onClose]);

  return (
    <dialog
      ref={dialog}
      // Fälten nollställs när rutan stängs. Annars stod förra dagens timmar
      // kvar när rutan öppnades för nästa dag.
      onClose={() => {
        form.current?.reset();
        onClose();
      }}
      className={`w-[min(32rem,calc(100vw-2rem))] ${dialogSurface}`}
    >
      <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
        <h2 className="text-sm font-semibold text-neutral-900">
          Registrera komptid
        </h2>
        <p className="mt-0.5 text-[13px] text-neutral-500">{employeeName}</p>
      </div>

      <form ref={form} action={submit} className="flex min-h-0 flex-1 flex-col">
        <div className={`${dialogBody} space-y-4 px-5 py-5`}>
          {state.error && <Alert>{state.error}</Alert>}

          <input type="hidden" name="employeeId" value={employeeId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Datum">
              <Input
                type="date"
                name="date"
                defaultValue={date ?? ""}
                required
                key={date ?? "tom"}
              />
            </Field>

            <Field label="Antal timmar" hint="Tim:min, t.ex. 2:00">
              <Input
                name="hours"
                inputMode="decimal"
                placeholder="2:00"
                autoComplete="off"
                required
              />
            </Field>
          </div>

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
