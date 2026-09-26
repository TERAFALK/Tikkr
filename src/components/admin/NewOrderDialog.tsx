"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { OrderFormState } from "@/app/admin/(panel)/ordrar/actions";
import {
  Alert,
  Button,
  dialogBody,
  dialogEdge,
  dialogSurface,
} from "@/components/ui";
import OrderFields from "./OrderFields";
import type { BudgetMomentOption } from "./BudgetMoments";
import type { SearchSelectOption } from "./SearchSelect";

/**
 * RUTAN SOM LÄGGER UPP EN NY ORDER.
 *
 * Egen ruta och inte den allmänna FormDialog, av ett skäl: den här åtgärden
 * kan avvisas. Ett påslag skrivet som "40" när man menade "1,4" ska inte
 * sparas tyst, och då måste rutan stå kvar med felet i stället för att stänga
 * sig och se ut som att allt gick bra.
 *
 * Fälten är desamma som när ordern ändras — se OrderFields.
 */
export default function NewOrderDialog({
  customers,
  moments,
  action,
  trigger = "Ny order",
}: {
  customers: SearchSelectOption[];
  moments: BudgetMomentOption[];
  action: (
    previous: OrderFormState,
    formData: FormData
  ) => Promise<OrderFormState>;
  trigger?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  const [state, submit] = useActionState<OrderFormState, FormData>(action, {});

  // Stängs bara när sparandet gick igenom. Ett avvisat påslag ska stå kvar med
  // sitt felmeddelande, inte försvinna och lämna kvar det man skrivit.
  useEffect(() => {
    if (state.savedAt) dialog.current?.close();
  }, [state.savedAt]);

  return (
    <>
      <Button type="button" onClick={() => dialog.current?.showModal()}>
        {trigger}
      </Button>

      <dialog
        ref={dialog}
        className={`w-[min(30rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">
            Lägg till order
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
            Öppna ordrar är valbara på stämplingsskärmen.
          </p>
        </div>

        <form action={submit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${dialogBody} space-y-4 px-5 py-5`}>
            {state.error && <Alert>{state.error}</Alert>}

            {/* Nyckeln byts när en order lagts upp, vilket monterar om fälten
                tomma. Nästa order ska börja på ett blankt formulär, inte på
                förra orderns nummer och arbetsmoment.

                Och just därför räcker inte formulärets egen reset(): raderna
                under Beräknad tid och kundväljaren är React-tillstånd, inte
                fältvärden webbläsaren känner till. En reset hade lämnat dem
                ifyllda. */}
            <OrderFields
              key={state.savedAt ?? 0}
              customers={customers}
              moments={moments}
              autoFocus
            />
          </div>

          <div
            className={`${dialogEdge} flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
          >
            <Button
              type="button"
              tone="secondary"
              onClick={() => dialog.current?.close()}
            >
              Avbryt
            </Button>
            <SaveButton />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Lägger till…" : "Lägg till"}
    </Button>
  );
}
