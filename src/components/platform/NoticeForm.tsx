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
 * Ytorna är kryssrutor och inte ett val i en lista, eftersom ett meddelande
 * ofta ska synas på flera — och den vanligaste missen är att glömma kiosken
 * vid ett avbrott som stoppar stämplingen.
 */

const SURFACES = [
  {
    name: "showInAdmin",
    label: "Adminpanelen",
    detail: "Kundernas administratörer.",
    defaultOn: true,
  },
  {
    name: "showOnKiosk",
    label: "Stämplingsskärmarna",
    detail: "Verkstadsgolvet. Endast när stämplingen påverkas.",
    defaultOn: false,
  },
  {
    name: "showOnSite",
    label: "Säljsidan",
    detail: "Publik. Även för den som ännu inte är kund.",
    defaultOn: false,
  },
];

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
          <Field label="Rubrik">
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

      <Field label="Meddelande">
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
          <Field label="Visas från" hint="Tomt = omedelbart.">
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

        {SURFACES.map((surface) => (
          <label
            key={surface.name}
            className="mt-2 flex items-start gap-2.5 text-[13px] text-neutral-700 first:mt-0"
          >
            <input
              type="checkbox"
              name={surface.name}
              defaultChecked={surface.defaultOn}
              className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
            />
            <span>
              <span className="font-medium">{surface.label}</span>
              <span className="mt-0.5 block text-neutral-500">
                {surface.detail}
              </span>
            </span>
          </label>
        ))}
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
