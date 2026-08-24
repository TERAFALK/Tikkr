"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { PairingFormState } from "@/app/admin/(panel)/skarmar/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * RUTAN SOM VISAR KOPPLINGSKODEN.
 *
 * Används både när en skärm skapas och när den kopplas om — det är samma sak
 * sett från den som står vid skärmen: en kod att knappa in.
 *
 * Koden visas stort och delad i två grupper om tre. Den ska gå att läsa upp
 * tvärs över en verkstad utan att någon tappar räkningen, och tre siffror i
 * taget är ungefär vad man håller i huvudet.
 *
 * Nedräkningen finns för att koden faktiskt går ut. Utan den skulle den som
 * lämnar rutan öppen och går bort en stund komma tillbaka till en kod som inte
 * längre fungerar, utan att förstå varför.
 */
export default function PairingCodeDialog({
  trigger,
  triggerTone = "primary",
  title,
  description,
  action,
  submitLabel,
  disabled,
  children,
}: {
  trigger: string;
  triggerTone?: "primary" | "secondary" | "ghost";
  title: string;
  description: string;
  action: (previous: PairingFormState, formData: FormData) => Promise<PairingFormState>;
  submitLabel: string;
  disabled?: boolean;
  /** Dolda fält, exempelvis skärmens id vid koppla om. */
  children?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, submit] = useActionState<PairingFormState, FormData>(action, {});

  return (
    <>
      <Button
        type="button"
        tone={triggerTone}
        disabled={disabled}
        onClick={() => dialog.current?.showModal()}
      >
        {trigger}
      </Button>

      <dialog
        ref={dialog}
        className="w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            {state.code ? `Kod för ${state.deviceName}` : title}
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
            {state.code
              ? "Öppna portal.tikkr.se/kiosk på skärmen och knappa in koden."
              : description}
          </p>
        </div>

        {state.code ? (
          <div className="space-y-4 px-5 py-6 text-center">
            <p className="font-mono text-5xl font-semibold tracking-[0.2em] text-neutral-900">
              {state.code.slice(0, 3)} {state.code.slice(3)}
            </p>

            <Countdown expiresAt={state.expiresAt!} />

            <p className="text-[13px] leading-relaxed text-neutral-500">
              Koden gäller för den här skärmen och kan bara användas en gång.
              Går den ut skapar du en ny med Koppla om.
            </p>
          </div>
        ) : (
          <form action={submit}>
            <div className="space-y-4 px-5 py-5">
              {state.error && <Alert>{state.error}</Alert>}
              {children}
            </div>

            <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
              <Button
                type="button"
                tone="secondary"
                onClick={() => dialog.current?.close()}
              >
                Avbryt
              </Button>
              <SubmitButton label={submitLabel} />
            </div>
          </form>
        )}

        {state.code && (
          <div className="flex justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            <Button
              type="button"
              tone="secondary"
              onClick={() => dialog.current?.close()}
            >
              Klar
            </Button>
          </div>
        )}
      </dialog>
    </>
  );
}

/** Visar hur länge koden lever kvar. Uppdateras varje sekund. */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now())
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (left === 0) {
    return (
      <p className="text-[13px] font-medium text-amber-700">
        Koden har gått ut. Stäng rutan och tryck Koppla om.
      </p>
    );
  }

  const seconds = Math.ceil(left / 1000);
  const minutes = Math.floor(seconds / 60);

  return (
    <p className="text-[13px] tabular-nums text-neutral-500">
      Gäller i {minutes}:{String(seconds % 60).padStart(2, "0")}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Skapar…" : label}
    </Button>
  );
}
