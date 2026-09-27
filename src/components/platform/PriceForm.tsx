"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  savePrices,
  type PriceFormState,
} from "@/app/plattform/artiklar/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Artikelnumren för en sak vi säljer.
 *
 * Miljövariabelns värde visas som platshållare i ett tomt fält. Det är
 * skillnaden mellan "inget är satt" och "något är satt någon annanstans, och
 * det är detta" — utan den ser sidan ut att ljuga om att ingen artikel finns.
 */
export default function PriceForm({
  item,
  month,
  year,
  envMonth,
  envYear,
  envNameMonth,
  envNameYear,
  updatedByEmail,
}: {
  item: string;
  month: string;
  year: string;
  envMonth: string | null;
  envYear: string | null;
  envNameMonth: string;
  envNameYear: string;
  updatedByEmail: string | null;
}) {
  const [state, action] = useActionState<PriceFormState, FormData>(
    savePrices,
    {}
  );

  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <input type="hidden" name="item" value={item} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Månad" hint={envHint(envMonth, envNameMonth)}>
          <Input
            name="month"
            defaultValue={month}
            placeholder={envMonth ?? "price_..."}
            spellCheck={false}
          />
        </Field>

        <Field label="År" hint={envHint(envYear, envNameYear)}>
          <Input
            name="year"
            defaultValue={year}
            placeholder={envYear ?? "price_..."}
            spellCheck={false}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />

        {updatedByEmail && (
          <span className="text-xs text-neutral-400">
            Senast ändrat av {updatedByEmail}
          </span>
        )}
      </div>
    </form>
  );
}

/** Talar om att ett tomt fält ändå har ett värde, och varifrån. */
function envHint(value: string | null, name: string): string | undefined {
  if (!value) return undefined;
  return `Ligger i ${name}`;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {pending ? "Kontrollerar…" : "Spara"}
    </Button>
  );
}
