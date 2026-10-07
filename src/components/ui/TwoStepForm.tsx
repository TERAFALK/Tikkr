"use client";

import type { ReactNode } from "react";
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
 * Med `enrollment` satt är appen inte uppsatt än: uppsättningen i fyra steg,
 * QR-koden, och en länk som öppnar appen direkt för den som loggar in på
 * telefonen. Nyckeln för den som inte kan skanna ligger dold bakom "Kan inte
 * skanna?". Den första koden bekräftar att uppsättningen gick rätt.
 *
 * Kundernas panel har två tillägg (2026-10-07), som plattformen saknar:
 * `method="email"` när koden kommit via e-post, och `rememberDays`, som visar
 * rutan "Kom ihåg den här datorn". `alternatives` är platsen under knappen
 * där sidan lägger länken till inloggningsalternativen.
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
  method = "app",
  intro,
  rememberDays,
  alternatives,
}: {
  action: (state: TwoStepState, formData: FormData) => Promise<TwoStepState>;
  cancel: () => Promise<void>;
  enrollment?: { key: string; uri: string; qrSvg: string };
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

        {enrollment && (
          <div className="space-y-3">
            {/* STEG FÖR STEG, och inte en mening.
                
                Stod "Skanna koden med en autentiseringsapp, till exempel
                Microsoft Authenticator eller Google Authenticator". Det säger
                VAD som ska hända men inte var man trycker, och den som aldrig
                satt upp en sådan app hittar inte skannern: den ligger bakom
                Lägg till konto, under ett val som heter något annat än
                "autentiseringsapp" i varje app.
                
                Det här är ett av de få ställen där en längre förklaring hör
                hemma, se CLAUDE.md § 7.1 sista stycket. Går uppsättningen
                fel kommer man inte in alls. */}
            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-neutral-600 marker:text-neutral-400">
              <li>
                Installera Microsoft Authenticator eller Google Authenticator
                på telefonen.
              </li>
              <li>Välj Lägg till konto, och sedan Annat konto.</li>
              <li>Skanna koden nedan.</li>
              <li>Skriv in de sex siffrorna appen visar.</li>
            </ol>

            <div
              className="mx-auto w-48 rounded-md bg-white p-2 ring-1 ring-neutral-200"
              dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
            />

            <p className="text-center">
              <a
                href={enrollment.uri}
                className="text-[13px] font-medium text-tick-deep hover:underline"
              >
                Öppna i appen på den här telefonen
              </a>
            </p>

            {/* NYCKELN LIGGER DOLD. Den behövs bara av den som inte kan
                skanna, och i klartext bredvid QR-koden gjorde den rutan rörig
                för alla andra.
                
                <details> och inte en knapp med eget tillstånd: webbläsaren
                sköter öppning, tangentbord och uppläsning, och rutan behöver
                ingen extra rad kod. */}
            <details className="text-center">
              <summary className="cursor-pointer text-[13px] font-medium text-neutral-500 hover:text-neutral-900">
                Kan inte skanna?
              </summary>
              <p className="mt-2 text-[13px] text-neutral-600">
                Välj Ange nyckel manuellt i appen och skriv in:
                <span className="mt-1 block font-mono text-sm tracking-wider break-all text-neutral-900">
                  {enrollment.key}
                </span>
              </p>
            </details>
          </div>
        )}

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
