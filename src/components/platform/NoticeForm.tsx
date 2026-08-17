"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addNotice,
  type NoticeFormState,
} from "@/app/plattform/meddelanden/actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

/**
 * Lägger in ett driftmeddelande.
 *
 * Ytorna är två kryssrutor och inte ett val i en lista, eftersom ett
 * meddelande ofta ska synas på båda — och den vanligaste missen är att glömma
 * kiosken vid ett avbrott som stoppar stämplingen.
 */
export default function NoticeForm() {
  const [state, action] = useActionState<NoticeFormState, FormData>(
    addNotice,
    {}
  );

  const [kind, setKind] = useState("MAINTENANCE");

  return (
    <form action={action} className="space-y-4 p-5">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Field label="Typ">
            <Select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="MAINTENANCE">Planerat underhåll</option>
              <option value="INCIDENT">Pågående avbrott</option>
              <option value="INFO">Information</option>
            </Select>
          </Field>
        </div>

        <div className="min-w-64 flex-1">
          <Field label="Rubrik" hint="Visas i fetstil i bannern.">
            <Input
              name="title"
              required
              placeholder={
                kind === "INCIDENT"
                  ? "Störningar i rapporterna"
                  : "Planerat underhåll natten mot söndag"
              }
            />
          </Field>
        </div>
      </div>

      <Field
        label="Meddelande"
        hint="En eller två meningar. Säg vad som gäller och vad kunden behöver göra, om något."
      >
        <textarea
          name="body"
          rows={3}
          required
          placeholder="Tjänsten är otillgänglig mellan 02:00 och 04:00. Stämplingsskärmarna påverkas inte."
          className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <div className="w-56">
          <Field label="Visas från" hint="Lämnas tomt för direkt.">
            <Input type="datetime-local" name="startsAt" />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Visas till" hint="Tomt = tills det arkiveras.">
            <Input type="datetime-local" name="endsAt" />
          </Field>
        </div>
      </div>

      <fieldset className="rounded-md border border-neutral-200 p-4">
        <legend className="px-1.5 text-[13px] font-medium text-neutral-700">
          Var det ska synas
        </legend>

        <label className="flex items-start gap-2.5 text-[13px] text-neutral-700">
          <input
            type="checkbox"
            name="showInAdmin"
            defaultChecked
            className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
          />
          <span>
            <span className="font-medium">Adminpanelen</span>
            <span className="mt-0.5 block text-neutral-500">
              Syns för den som administrerar. Rätt för allt som rör rapporter,
              export och fakturering.
            </span>
          </span>
        </label>

        <label className="mt-3 flex items-start gap-2.5 text-[13px] text-neutral-700">
          <input
            type="checkbox"
            name="showOnKiosk"
            className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
          />
          <span>
            <span className="font-medium">Stämplingsskärmarna</span>
            <span className="mt-0.5 block text-neutral-500">
              Syns i verkstaden. Använd bara när stämplingen faktiskt påverkas —
              ett meddelande som ingen där kan göra något åt skapar bara oro.
            </span>
          </span>
        </label>
      </fieldset>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Lägger in…" : "Lägg in meddelandet"}
    </Button>
  );
}
