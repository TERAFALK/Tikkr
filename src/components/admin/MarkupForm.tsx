"use client";

import type { SaveState } from "@/lib/save-state";
import { Field, Input } from "@/components/ui";
import SaveForm from "./SaveForm";

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
  action: (state: SaveState, formData: FormData) => Promise<SaveState>;
  markupPercent: number;
}) {
  return (
    <SaveForm action={action}>
      <Field label="Påslag" hint="Faktor, t.ex. 1,4. Tomt visar bara kostnaden">
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
    </SaveForm>
  );
}
