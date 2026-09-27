"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeLicenses,
  type LicenseFormState,
} from "@/app/admin/(panel)/installningar/prenumeration/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Antalet licenser, ändrat i två steg.
 *
 * Ändringen görs här och inte på betaltjänstens egen sida. Skälet är att
 * tillvalen inte går att lägga till där, och kunden mötte då två olika sätt
 * att ändra samma faktura beroende på vad de ändrade.
 *
 * Beloppet räknas fortfarande av den som debiterar. Det som står i
 * bekräftelserutan är hämtat därifrån, inte uträknat av oss.
 *
 * DET SKA INTE GÅ ATT MISSA ATT EN ÖKNING KOSTAR. Rutan visar avgiften före
 * och efter, skillnaden, och vad nästa faktura landar på. En siffra som bara
 * ändras i ett fält är inget beslut kunden fattat.
 *
 * Stripe nämns inte i texten mot kunden. Vilken leverantör som hanterar
 * betalningen är vårt val, inte något kunden behöver förhålla sig till.
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
  const kr = (amount: number) => amount.toLocaleString("sv-SE");

  return (
    <div className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      {state.preview ? (
        <ConfirmPanel preview={state.preview} action={action} />
      ) : (
        <form action={action} className="space-y-4">
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">Licenser</dt>
                <dd className="tabular-nums text-neutral-900">
                  {current}, varav {used} använda
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">Avgift</dt>
                <dd className="tabular-nums text-neutral-900">
                  {kr(current * pricePerScreen)} kr per {period}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28">
              <Field label="Nytt antal">
                <Input
                  type="number"
                  name="screens"
                  min={1}
                  max={100}
                  defaultValue={current}
                  required
                />
              </Field>
            </div>

            <SubmitButton />
          </div>

          <p className="text-xs leading-relaxed text-neutral-500">
            En licens ger en stämplingsskärm. Nästa steg visar vad ändringen
            kostar innan något debiteras.
            {used > 0 && (
              <>
                {" "}
                Sänks antalet under {used} behöver skärmar raderas under
                Stämplingsskärmar. Stämplingen fortsätter fungera under tiden.
              </>
            )}
          </p>
        </form>
      )}
    </div>
  );
}

function ConfirmPanel({
  preview,
  action,
}: {
  preview: NonNullable<LicenseFormState["preview"]>;
  action: (formData: FormData) => void;
}) {
  const kr = (amount: number) => amount.toLocaleString("sv-SE");
  const period = preview.interval === "year" ? "år" : "månad";

  const date = preview.nextInvoiceAt
    ? new Date(preview.nextInvoiceAt).toLocaleDateString("sv-SE")
    : null;

  const increase = preview.to > preview.from;
  const difference = Math.abs(preview.recurringAmount - preview.currentAmount);

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-[13px] font-medium text-neutral-900">
        {increase ? "Utöka" : "Minska"} till {preview.to}{" "}
        {preview.to === 1 ? "licens" : "licenser"}
      </p>

      <dl className="mt-3 space-y-1.5 text-[13px]">
        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Avgift idag</dt>
          <dd className="tabular-nums text-neutral-700">
            {kr(preview.currentAmount)} kr/{period}
          </dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">Ny avgift</dt>
          <dd className="font-medium tabular-nums text-neutral-900">
            {kr(preview.recurringAmount)} kr/{period}
          </dd>
        </div>

        <div className="flex justify-between gap-4 border-t border-neutral-200 pt-1.5">
          <dt className="text-neutral-500">
            {increase ? "Tillkommer" : "Utgår"}
          </dt>
          <dd className="font-medium tabular-nums text-neutral-900">
            {kr(difference)} kr/{period}
          </dd>
        </div>

        {preview.nextInvoiceAmount !== null && (
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">
              Nästa faktura{date ? ` (${date})` : ""}
            </dt>
            <dd className="font-medium tabular-nums text-neutral-900">
              {kr(preview.nextInvoiceAmount)} kr
            </dd>
          </div>
        )}
      </dl>

      {preview.nextInvoiceAmount === null && (
        <p className="mt-2 text-xs text-neutral-500">
          Beloppet för nästa faktura kunde inte hämtas. Resten av perioden
          räknas av.
        </p>
      )}

      <form action={action} className="mt-4 flex gap-2">
        <input type="hidden" name="screens" value={preview.to} />
        <ConfirmButton increase={increase} />
        <Button type="submit" name="step" value="cancel" tone="secondary">
          Avbryt
        </Button>
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {pending ? "Räknar…" : "Ändra antal"}
    </Button>
  );
}

function ConfirmButton({ increase }: { increase: boolean }) {
  const { pending } = useFormStatus();

  // Steget sitter på knappen och inte i ett dolt fält, så att Bekräfta och
  // Avbryt kan skicka samma formulär med olika innebörd.
  return (
    <Button type="submit" name="step" value="apply" disabled={pending}>
      {pending ? "Ändrar…" : increase ? "Bekräfta och utöka" : "Bekräfta"}
    </Button>
  );
}
