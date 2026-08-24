"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  removeCompany,
  type DeleteCompanyState,
} from "@/app/plattform/[companyId]/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * RADERING AV ETT KUNDFÖRETAG.
 *
 * Ligger hopfälld bakom en länk, längst ned och avskild från allt annat. Den
 * ska gå att hitta av den som söker den och aldrig råkas ut för av den som
 * skummar sidan.
 *
 * Företagsnamnet måste skrivas för hand. En kryssruta klickas bort utan att
 * läsas; ett namn tvingar ögat att stanna vid vilket företag det gäller.
 */
export default function DeleteCompanyForm({
  companyId,
  companyName,
  managedByStripe,
}: {
  companyId: string;
  companyName: string;
  managedByStripe: boolean;
}) {
  const [state, submit] = useActionState<DeleteCompanyState, FormData>(
    removeCompany,
    {}
  );

  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[13px] font-medium text-neutral-400 hover:text-red-600"
      >
        Radera företaget
      </button>
    );
  }

  return (
    <form action={submit} className="max-w-lg space-y-4">
      <input type="hidden" name="companyId" value={companyId} />

      {state.error && <Alert>{state.error}</Alert>}

      {managedByStripe ? (
        <Alert tone="warning">
          Företaget har en aktiv prenumeration hos Stripe. Avsluta den där
          först, annars fortsätter faktureringen mot en kund som inte längre
          finns.
        </Alert>
      ) : (
        <Alert tone="warning">
          Anställda, ordrar, arbetsmoment, stämplingar, administratörer och
          skärmar raderas. Åtgärden går inte att ångra. Enda återläsningen är
          nattens säkerhetskopia.
        </Alert>
      )}

      <Field label={`Skriv ${companyName} för att bekräfta`}>
        <Input name="confirmName" autoComplete="off" required />
      </Field>

      <Field label="Anledning" hint="Sparas i åtgärdsloggen.">
        <Input
          name="reason"
          placeholder="Avslutat kundförhållande, begärd radering"
          required
        />
      </Field>

      <div className="flex gap-2">
        <SubmitButton disabled={managedByStripe} />
        <Button type="button" tone="secondary" onClick={() => setOpen(false)}>
          Avbryt
        </Button>
      </div>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="danger" disabled={disabled || pending}>
      {pending ? "Raderar…" : "Radera företaget permanent"}
    </Button>
  );
}
