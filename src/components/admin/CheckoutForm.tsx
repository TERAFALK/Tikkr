"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { placeShopOrder, type CheckoutState } from "@/app/admin/(panel)/butik/actions";
import ProfileFields from "@/components/admin/ProfileFields";
import { Alert, Button } from "@/components/ui";
import type { ProfileValues } from "@/lib/shop/profile";

/**
 * KASSANS FORMULÄR: uppgifterna och knappen.
 *
 * Varukorgen följer med som dolda fält, med det antal kassan visar. Pris och
 * moms räknas på servern. Nyckeln sattes när sidan ritades, så att ett
 * dubbeltryck ger en beställning, se placeOrder.
 */
export default function CheckoutForm({
  quantities,
  profile,
  separateBilling,
  idempotencyKey,
  delivery,
}: {
  quantities: { key: string; quantity: number }[];
  profile: ProfileValues;
  separateBilling: boolean;
  idempotencyKey: string;
  /** Om något ska skickas. Styr om fälten gäller leverans eller faktura. */
  delivery: boolean;
}) {
  const [state, submit] = useActionState<CheckoutState, FormData>(placeShopOrder, {});

  // Ett fel ritar om fälten med det som skrevs. Nyckeln byts, så att de
  // verkligen tar de skickade värdena och inte står kvar som de var.
  const attempt = state.error ? `${state.error}:${JSON.stringify(state.values)}` : "first";

  return (
    <form action={submit} className="space-y-6 p-5">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {quantities.map((item) => (
        <input key={item.key} type="hidden" name={`qty-${item.key}`} value={item.quantity} />
      ))}

      {state.error && <Alert>{state.error}</Alert>}

      <div key={attempt} className="space-y-4">
        <ProfileFields
          values={state.values ?? profile}
          separateBilling={state.separateBilling ?? separateBilling}
          errors={state.fieldErrors}
          requireForOrder
          delivery={delivery}
        />

        <label className="flex items-center gap-2 text-[13px] text-neutral-700">
          <input
            type="checkbox"
            name="saveProfile"
            defaultChecked={state.saveProfile ?? true}
            className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
          />
          Spara uppgifterna för kommande beställningar
        </label>
      </div>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Skickar…" : "Skicka beställning"}
    </Button>
  );
}
