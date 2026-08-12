"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeLicenses,
  type LicenseFormState,
} from "@/app/admin/(panel)/installningar/prenumeration/actions";
import { Alert, Button } from "@/components/ui";

/**
 * Leder till Stripe, där antalet licenser ändras.
 *
 * Antalet väljs inte här. Att skriva en siffra i vår panel och sedan bekräfta
 * ett belopp någon annanstans är två steg som beskriver samma sak på två
 * ställen. Hos Stripe hör siffran och beloppet ihop: det som står där är det
 * som debiteras.
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

  const period = interval === "year" ? "år" : "månad";

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
        <dl className="space-y-1.5 text-[13px]">
          <div className="flex items-center justify-between">
            <dt className="text-neutral-500">Licenser</dt>
            <dd className="tabular-nums text-neutral-900">
              {current} {current === 1 ? "skärm" : "skärmar"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-neutral-500">Avgift</dt>
            <dd className="tabular-nums text-neutral-900">
              {(current * pricePerScreen).toLocaleString("sv-SE")} kr per{" "}
              {period}
            </dd>
          </div>
        </dl>
      </div>

      <SubmitButton />

      <p className="text-xs leading-relaxed text-neutral-500">
        Antalet ändras hos Stripe, där det nya beloppet och avräkningen för
        resterande dagar av perioden räknas fram och godkänns. Ingenting
        debiteras dessförinnan, och avbryts ändringen sker ingenting.
        {used > 0 && (
          <>
            {" "}
            Ni har {used} aktiva {used === 1 ? "skärm" : "skärmar"}. Sänks
            antalet under det behöver skärmar återkallas här i panelen —
            stämplingen fortsätter fungera under tiden.
          </>
        )}
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {pending ? "Öppnar Stripe…" : "Ändra antal skärmar hos Stripe"}
    </Button>
  );
}
