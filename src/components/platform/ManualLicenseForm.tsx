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
      <Alert tone="info">
        Antalet licenser styrs av prenumerationen hos Stripe och ändras av
        kunden.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <p className="text-[13px] font-medium text-neutral-700">
        Antal licenser
      </p>

      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <input type="hidden" name="companyId" value={companyId} />

      {/* Fälten saknar hjälptext med flit. Ett fält med text under och ett utan
          får olika höjd, och då hamnar etiketterna på olika rader — vilket är
          precis vad som hände förut. Förklaringarna står i stället samlade
          under raden. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-24">
          <Field label="Antal">
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

        <div className="min-w-48 flex-1">
          <Field label="Anledning">
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
        {used} av {current} används. Ett lägre antal stänger ingen skärm.
        Anledningen sparas i åtgärdsloggen.
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
