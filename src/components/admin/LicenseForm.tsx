"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeLicenses,
  type LicenseFormState,
} from "@/app/admin/(panel)/installningar/prenumeration/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Ändrar antalet licenser på en pågående prenumeration.
 *
 * Priset räknas ut här och nu, så att kunden ser vad ändringen kostar innan
 * de trycker. En knapp som ändrar en faktura utan att säga hur mycket är en
 * knapp folk inte vågar trycka på.
 */
export default function LicenseForm({
  current,
  used,
  pricePerScreen,
  interval,
}: {
  current: number;
  used: number;
  pricePerScreen: number;
  interval: "month" | "year";
}) {
  const [state, action] = useActionState<LicenseFormState, FormData>(
    changeLicenses,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field label="Antal skärmar">
            <Input
              type="number"
              name="screens"
              min={Math.max(1, used)}
              max={100}
              defaultValue={current}
              required
            />
          </Field>
        </div>
        <SubmitButton />
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        {pricePerScreen.toLocaleString("sv-SE")} kr per skärm och{" "}
        {interval === "year" ? "år" : "månad"}. Ökar ni mitt i perioden räknar
        Stripe av de dagar som återstår — ni betalar bara för den tid ni
        faktiskt har skärmen.
        {used > 0 && (
          <> Ni kan inte gå under {used}, som är antalet aktiva skärmar just nu.</>
        )}
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {pending ? "Ändrar…" : "Ändra antal"}
    </Button>
  );
}
