"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeLicenses,
  type LicenseFormState,
} from "@/app/admin/(panel)/installningar/prenumeration/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Ändrar antalet licenser på en pågående prenumeration.
 *
 * Formuläret genomför ingen ändring. Det räknar fram vad den nya avgiften blir
 * och skickar sedan vidare till Stripes bekräftelsesida, där det exakta
 * beloppet står — inklusive vad ändringen kostar för resterande dagar av
 * perioden. Ingenting debiteras förrän kunden godkänt beloppet där.
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

  const [screens, setScreens] = useState(current);

  const period = interval === "year" ? "år" : "månad";
  const valid = Number.isInteger(screens) && screens >= 1 && screens <= 100;
  const changed = valid && screens !== current;

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Field label="Antal skärmar">
            <Input
              type="number"
              name="screens"
              min={Math.max(1, used)}
              max={100}
              value={screens}
              onChange={(event) => setScreens(Number(event.target.value))}
              required
            />
          </Field>
        </div>
        <SubmitButton disabled={!changed} />
      </div>

      {/* Räknas fram medan man skriver. Den som funderar på en skärm till ska
          se vad det innebär innan de lämnar sidan. */}
      {changed && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex items-center justify-between">
              <dt className="text-neutral-500">Nuvarande avgift</dt>
              <dd className="tabular-nums text-neutral-600">
                {(current * pricePerScreen).toLocaleString("sv-SE")} kr per{" "}
                {period}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="font-medium text-neutral-700">Ny avgift</dt>
              <dd className="font-medium tabular-nums text-neutral-900">
                {(screens * pricePerScreen).toLocaleString("sv-SE")} kr per{" "}
                {period}
              </dd>
            </div>
          </dl>
          <p className="mt-2 border-t border-neutral-200 pt-2 text-xs leading-relaxed text-neutral-500">
            Beloppen är exklusive moms. Det exakta beloppet, inklusive
            avräkningen för resterande dagar av innevarande period, visas för
            godkännande hos Stripe. Ingenting debiteras dessförinnan.
          </p>
        </div>
      )}

      <p className="text-xs leading-relaxed text-neutral-500">
        {pricePerScreen.toLocaleString("sv-SE")} kr per skärm och {period}. Vid
        utökning under pågående period debiteras endast återstående dagar av
        perioden.
        {used > 0 && (
          <>
            {" "}
            Antalet kan inte understiga {used}, vilket motsvarar antalet aktiva
            skärmar.
          </>
        )}
      </p>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={disabled || pending}>
      {pending ? "Öppnar Stripe…" : "Granska ändringen"}
    </Button>
  );
}
