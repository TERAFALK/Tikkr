"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * STEG TVÅ I INLOGGNINGEN: QR-KODEN, ELLER KODEN FRÅN APPEN.
 *
 * Samma formulär för kundernas panel och för plattformen, eftersom flödet är
 * detsamma (beslutat 2026-10-06). Lösenordet är redan kontrollerat när det
 * här visas, se login-ticket.ts.
 *
 * Med `enrollment` satt är appen inte uppsatt än: QR-koden visas, med nyckeln
 * i klartext under för den som inte kan skanna, och en länk som öppnar appen
 * direkt för den som loggar in på telefonen. Den första koden bekräftar att
 * uppsättningen gick rätt.
 *
 * QR-koden kommer som färdig SVG från servern (two-step.ts) och skrivs in som
 * den är. Innehållet är vår egen länk, inget en användare skrivit.
 */

export interface TwoStepState {
  error?: string;
}

export default function TwoStepForm({
  action,
  cancel,
  enrollment,
}: {
  action: (state: TwoStepState, formData: FormData) => Promise<TwoStepState>;
  cancel: () => Promise<void>;
  enrollment?: { key: string; uri: string; qrSvg: string };
}) {
  const [state, submit] = useActionState<TwoStepState, FormData>(action, {});

  return (
    <div className="space-y-4">
      <form action={submit} className="space-y-4">
        {state.error && <Alert>{state.error}</Alert>}

        {enrollment && (
          <div className="space-y-3 text-center">
            <p className="text-[13px] leading-relaxed text-neutral-600">
              Skanna koden med en autentiseringsapp, till exempel Microsoft
              Authenticator eller Google Authenticator.
            </p>
            <div
              className="mx-auto w-48 rounded-md bg-white p-2 ring-1 ring-neutral-200"
              dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
            />
            <p className="text-[13px] text-neutral-600">
              Eller skriv in nyckeln:
              <span className="mt-1 block font-mono text-sm tracking-wider text-neutral-900">
                {enrollment.key}
              </span>
            </p>
            <a
              href={enrollment.uri}
              className="inline-block text-[13px] font-medium text-tick-deep hover:underline"
            >
              Öppna i appen på den här telefonen
            </a>
          </div>
        )}

        <Field
          label="Kod"
          hint={enrollment ? "Sex siffror som appen visar efter skanningen" : "Sex siffror från autentiseringsappen"}
        >
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
          />
        </Field>

        <SubmitButton label={enrollment ? "Bekräfta och logga in" : "Logga in"} />
      </form>

      <form action={cancel} className="text-center">
        <button
          type="submit"
          className="text-[13px] font-medium text-neutral-500 hover:underline"
        >
          Avbryt
        </button>
      </form>
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Kontrollerar…" : label}
    </Button>
  );
}
