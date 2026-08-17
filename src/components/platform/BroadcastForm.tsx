"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  broadcast,
  type BroadcastFormState,
} from "@/app/plattform/meddelanden/actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

/**
 * Massutskick till kundernas administratörer.
 *
 * Antalet mottagare måste skrivas in för hand innan knappen fungerar. Det är
 * en medveten friktion: ett utskick går inte att ta tillbaka, och en felskickad
 * rad når varenda kund samtidigt. Att skriva "23" tar två sekunder och tvingar
 * ögat att läsa siffran.
 */
export default function BroadcastForm({
  counts,
}: {
  /** Antal mottagare per urval, framräknat på servern. */
  counts: { all: number; paying: number; trialing: number };
}) {
  const [state, action] = useActionState<BroadcastFormState, FormData>(
    broadcast,
    {}
  );

  const [audience, setAudience] = useState<keyof typeof counts>("all");
  const expected = counts[audience];

  return (
    <form action={action} className="space-y-4 p-5">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <input type="hidden" name="expected" value={expected} />

      <div className="flex flex-wrap gap-3">
        <div className="w-56">
          <Field label="Mottagare">
            <Select
              name="audience"
              value={audience}
              onChange={(event) =>
                setAudience(event.target.value as keyof typeof counts)
              }
            >
              <option value="all">Alla kunder ({counts.all})</option>
              <option value="paying">Endast betalande ({counts.paying})</option>
              <option value="trialing">
                Endast provperioder ({counts.trialing})
              </option>
            </Select>
          </Field>
        </div>

        <div className="min-w-64 flex-1">
          <Field label="Ämne">
            <Input
              name="subject"
              required
              placeholder="Planerat underhåll natten mot söndag"
            />
          </Field>
        </div>
      </div>

      <Field label="Meddelande" hint="Tomrad ger nytt stycke.">
        <textarea
          name="body"
          rows={7}
          required
          placeholder={
            "Hej,\n\nTikkr är otillgängligt mellan 02:00 och 04:00 natten mot söndag den 17 augusti.\n\nStämplingsskärmarna påverkas inte — tid som registreras under underhållet finns kvar som vanligt."
          }
          className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] leading-relaxed text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
        />
      </Field>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
        <p className="text-[13px] font-medium text-amber-900">
          {expected} mottagare. Utskicket kan inte ångras.
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
          Ett separat mejl per mottagare. Adresserna syns inte för varandra.
        </p>

        <div className="mt-3 w-48">
          <Field label={`Skriv ${expected} för att bekräfta`}>
            <Input name="confirm" required autoComplete="off" />
          </Field>
        </div>
      </div>

      <SubmitButton disabled={expected === 0} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Skickar…" : "Skicka utskicket"}
    </Button>
  );
}
