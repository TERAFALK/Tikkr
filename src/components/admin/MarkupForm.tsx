"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { MarkupState } from "@/app/admin/(panel)/installningar/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Företagets standardpåslag i kalkylen.
 *
 * Egen komponent och inte ett fält i företagsformuläret, eftersom värdet kan
 * avvisas. Ett påslag som skrivits fel ska stå kvar i rutan med ett besked om
 * varför, inte försvinna och lämna kvar det gamla värdet utan att någon
 * märker det.
 */
export default function MarkupForm({
  action,
  markupPercent,
}: {
  action: (state: MarkupState, formData: FormData) => Promise<MarkupState>;
  markupPercent: number;
}) {
  const [state, submit] = useActionState<MarkupState, FormData>(action, {});

  return (
    <form action={submit} className="max-w-md space-y-4 p-5">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <Field
        label="Påslag"
        hint="Faktor, t.ex. 1,4. Tomt visar bara kostnaden"
      >
        <Input
          name="markup"
          inputMode="decimal"
          placeholder="1,4"
          defaultValue={
            markupPercent === 100
              ? ""
              : (markupPercent / 100).toFixed(2).replace(".", ",")
          }
        />
      </Field>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : "Spara"}
    </Button>
  );
}
