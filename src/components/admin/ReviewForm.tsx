"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ReviewState } from "@/app/admin/(panel)/granskning/actions";
import { Button, Input } from "@/components/ui";

/**
 * SLUTTIDEN PÅ EN POST SOM SKA GRANSKAS.
 *
 * Ett fält och en knapp. Servern jämför tiden i fältet med den som står på
 * posten och avgör själv vad som hände: orörd tid godkänns, ändrad tid rättas
 * och märks som inskriven av en människa.
 *
 * EGEN KOMPONENT FÖR ATT FELET SKA SYNAS. Raden låg tidigare i ett vanligt
 * formulär som anropade serveråtgärden direkt. Skrev någon en sluttid FÖRE
 * starttiden gjorde servern ingenting alls och svarade ingenting alls: posten
 * stod kvar i listan, och den som skrivit 07:00 i stället för 17:00 trodde att
 * knappen var trasig. Nu står svaret under fältet.
 *
 * Åtgärden skickas in som en prop, som i rutorna. Sidan äger kopplingen till
 * servern; komponenten äger bara hur svaret visas.
 */
export default function ReviewForm({
  id,
  defaultValue,
  action,
}: {
  id: string;
  /** Den beräknade sluttiden, i fältets eget format. */
  defaultValue: string;
  action: (
    previous: ReviewState,
    formData: FormData
  ) => Promise<ReviewState>;
}) {
  const [state, submit] = useActionState<ReviewState, FormData>(action, {});

  return (
    <form action={submit}>
      <div className="flex gap-2">
        <input type="hidden" name="id" value={id} />
        <Input
          type="datetime-local"
          name="clockOutAt"
          defaultValue={defaultValue}
          aria-label="Sluttid"
          className="w-52"
        />
        <SubmitButton />
      </div>

      {state.error && (
        <p className="mt-1.5 text-[13px] text-red-600">{state.error}</p>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : "Godkänn"}
    </Button>
  );
}
