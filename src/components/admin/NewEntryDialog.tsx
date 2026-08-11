"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  addEntry,
  type EntryFormState,
} from "@/app/admin/(panel)/stamplingar/actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

interface Option {
  id: string;
  label: string;
}

/**
 * Lägger in en stämpling som saknas.
 *
 * Egen komponent istället för den generella FormDialog, eftersom den här rutan
 * måste stanna öppen när servern avvisar. Krockar tiden med ett annat pass är
 * det något administratören behöver läsa och rätta — stängdes rutan skulle
 * felet försvinna tillsammans med de ifyllda värdena.
 */
export default function NewEntryDialog({
  employees,
  orders,
  moments,
}: {
  employees: Option[];
  orders: Option[];
  moments: Option[];
}) {
  const [state, action] = useActionState<EntryFormState, FormData>(addEntry, {});
  const dialog = useRef<HTMLDialogElement>(null);

  // Stängs först när posten faktiskt skapats.
  useEffect(() => {
    if (state.ok) dialog.current?.close();
  }, [state.ok]);

  return (
    <>
      <Button type="button" onClick={() => dialog.current?.showModal()}>
        Ny stämpling
      </Button>

      <dialog
        ref={dialog}
        className="w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            Lägg till stämpling
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
            För tid som aldrig blev stämplad — oftast när någon glömt stämpla
            in. Posten märks som manuell.
          </p>
        </div>

        <form action={action}>
          <div className="space-y-4 px-5 py-5">
            {state.error && <Alert>{state.error}</Alert>}

            <Field label="Anställd">
              <Select name="employeeId" required defaultValue="">
                <option value="" disabled>
                  Välj…
                </option>
                {employees.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Order">
                <Select name="orderId" required defaultValue="">
                  <option value="" disabled>
                    Välj…
                  </option>
                  {orders.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Arbetsmoment">
                <Select name="momentId" required defaultValue="">
                  <option value="" disabled>
                    Välj…
                  </option>
                  {moments.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Instämplad">
                <Input type="datetime-local" name="clockInAt" required />
              </Field>

              <Field label="Utstämplad">
                <Input type="datetime-local" name="clockOutAt" required />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            <Button
              type="button"
              tone="secondary"
              onClick={() => dialog.current?.close()}
            >
              Avbryt
            </Button>
            <SubmitButton />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Lägger till…" : "Lägg till"}
    </Button>
  );
}
