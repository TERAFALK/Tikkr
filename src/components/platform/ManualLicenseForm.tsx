"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeLicenseCount,
  type LicenseFormState,
} from "@/app/plattform/[companyId]/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Antal licenser för en fakturakund.
 *
 * Visas bara när företaget INTE har en prenumeration hos Stripe. Har det en
 * styrs antalet därifrån, och ett fält här hade bara varit ett sätt att sätta
 * en siffra som skrivs över vid nästa besked.
 */
export default function ManualLicenseForm({
  companyId,
  current,
  used,
  managedByStripe,
}: {
  companyId: string;
  current: number;
  used: number;
  managedByStripe: boolean;
}) {
  const [state, action] = useActionState<LicenseFormState, FormData>(
    changeLicenseCount,
    {}
  );

  if (managedByStripe) {
    return (
      <div className="p-5">
        <Alert tone="info">
          Antalet licenser styrs av prenumerationen hos Stripe. Kunden ändrar
          det själv under Inställningar → Prenumeration.
        </Alert>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 p-5">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <input type="hidden" name="companyId" value={companyId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field label="Antal licenser">
            <Input
              type="number"
              name="licenses"
              min={1}
              max={100}
              defaultValue={current}
              required
            />
          </Field>
        </div>

        <div className="min-w-56 flex-1">
          <Field label="Anledning" hint="Sparas i åtgärdsloggen.">
            <Input
              name="reason"
              placeholder="Fakturakund, avtalat tre skärmar"
              required
            />
          </Field>
        </div>

        <SubmitButton />
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        {used} av {current} används just nu. Sänks antalet under det stängs
        ingen skärm av — kunden får själv återkalla de som ska bort, och
        panelen påpekar skillnaden för dem.
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {pending ? "Sparar…" : "Spara"}
    </Button>
  );
}
