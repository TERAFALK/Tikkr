"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button, Field, Input } from "@/components/ui";
import TwoStepEnrollment, { type Enrollment } from "./TwoStepEnrollment";

/**
 * STEG TVÅ I INLOGGNINGEN: QR-KODEN, ELLER KODEN FRÅN APPEN.
 *
 * Samma formulär för kundernas panel och för plattformen, eftersom flödet är
 * detsamma (beslutat 2026-10-06). Lösenordet är redan kontrollerat när det
 * här visas, se login-ticket.ts.
 *
 * Med `enrollment` satt är appen inte uppsatt än, och då ritas uppsättningen
 * av `TwoStepEnrollment`. Den ligger i en egen fil sedan 2026-10-11, eftersom
 * uppsättningen numera också går att göra inifrån panelen, under Ditt konto.
 * Den första koden bekräftar att uppsättningen gick rätt.
 *
 * Kundernas panel har två tillägg (2026-10-07), som plattformen saknar:
 * `method="email"` när koden kommit via e-post, och `rememberDays`, som visar
 * rutan "Kom ihåg den här datorn". `alternatives` är platsen under knappen
 * där sidan lägger länken till inloggningsalternativen.
 *
 */

export interface TwoStepState {
  error?: string;
}

export default function TwoStepForm({
  action,
  cancel,
  enrollment,
  method = "app",
  intro,
  rememberDays,
  alternatives,
}: {
  action: (state: TwoStepState, formData: FormData) => Promise<TwoStepState>;
  cancel: () => Promise<void>;
  enrollment?: Enrollment;
  method?: "app" | "email";
  intro?: ReactNode;
  rememberDays?: number;
  alternatives?: ReactNode;
}) {
  const [state, submit] = useActionState<TwoStepState, FormData>(action, {});

  const hint = enrollment
    ? "Sex siffror som appen visar efter skanningen"
    : method === "email"
      ? "Sex siffror från mejlet"
      : "Sex siffror från autentiseringsappen";

  return (
    <div className="space-y-4">
      <form action={submit} className="space-y-4">
        <input type="hidden" name="method" value={method} />

        {state.error && <Alert>{state.error}</Alert>}

        {intro}

        {enrollment && <TwoStepEnrollment enrollment={enrollment} />}

        <Field label="Kod" hint={hint}>
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

        {rememberDays && (
          <label className="flex cursor-pointer items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              name="remember"
              className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
            />
            <span className="font-medium text-neutral-900">
              Kom ihåg den här datorn i {rememberDays} dagar
            </span>
          </label>
        )}

        <SubmitButton label={enrollment ? "Bekräfta och logga in" : "Logga in"} />
      </form>

      {alternatives}

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
