"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeModule,
  type ModuleFormState,
} from "@/app/admin/(panel)/installningar/prenumeration/actions";
import type { ModuleOffer } from "@/lib/billing";
import { Alert, Badge, Button } from "@/components/ui";

/**
 * Tillvalen på prenumerationssidan.
 *
 * Utan prenumeration är reglaget ett tryck: under provperioden kostar det
 * ingenting. Med prenumeration är det två, och mellansteget visar vad Stripe
 * kommer att fakturera. En kryssruta som tyst ändrar en faktura är inte ett
 * val kunden gjort medvetet.
 *
 * För ett företag som SKÖTS AV OSS finns inget reglage alls. Tillvalen står
 * där som en upplysning, och ändras i plattformspanelen — se `managed`.
 */
export default function ModuleSection({
  modules,
  hasSubscription,
  interval,
  managed = false,
}: {
  modules: ModuleOffer[];
  hasSubscription: boolean;
  interval: "month" | "year";
  /**
   * Företaget sköts av oss: tillvalen visas men går inte att ändra här.
   *
   * Att knappen försvinner är kosmetik. Åtgärden frågar själv — se
   * changeModule i prenumeration/actions.ts.
   */
  managed?: boolean;
}) {
  const [state, action] = useActionState<ModuleFormState, FormData>(
    changeModule,
    {}
  );

  const kr = (amount: number) => amount.toLocaleString("sv-SE");
  const per = interval === "year" ? "år" : "månad";

  /**
   * Rabatten mot listpriset, i procent.
   *
   * Räknas här och inte i company-prices.ts: den filen importerar Prisma, och
   * det här är en klientkomponent. Samma skäl som i AgreedPriceForm.
   */
  const discount = (list: number, paying: number): number | null => {
    if (list <= 0 || paying >= list) return null;
    return Math.round(((list - paying) / list) * 100);
  };

  return (
    <div className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      {state.preview && (
        <ConfirmPanel preview={state.preview} action={action} />
      )}

      <ul className="divide-y divide-neutral-100">
        {modules.map((module) => (
          <li
            key={module.key}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0"
          >
            <div className="min-w-48 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-neutral-900">
                  {module.name}
                </span>
                {module.enabled && <Badge tone="active">Påslaget</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                {module.summary}
              </p>
            </div>

            {/* AVTALAT PRIS visas med listpriset överstruket och rabatten
                i procent, precis som totalen ovanför. Kunden ska se vad hen
                fått, och samma sak ska se likadan ut på hela sidan. */}
            <span className="flex items-baseline gap-2 text-[13px] tabular-nums">
              {module.listAmount !== module.amount && (
                <span className="text-neutral-400 line-through">
                  {kr(module.listAmount)} kr
                </span>
              )}
              <span className="font-medium text-neutral-900">
                {kr(module.amount)} kr/{per}
              </span>
              {discount(module.listAmount, module.amount) !== null && (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                  {discount(module.listAmount, module.amount)} %
                </span>
              )}
            </span>

            {managed ? (
              <span className="text-xs text-neutral-400">
                {module.enabled ? "Ingår" : "Ingår inte"}
              </span>
            ) : module.enabled || module.forSale || !hasSubscription ? (
              <form action={action}>
                <input type="hidden" name="module" value={module.key} />
                <input
                  type="hidden"
                  name="on"
                  value={module.enabled ? "0" : "1"}
                />
                <ToggleButton on={!module.enabled} />
              </form>
            ) : (
              <span className="text-xs text-neutral-400">
                {module.soldMonthly && interval === "year"
                  ? "Endast månadsbetalning"
                  : "Kan inte köpas än"}
              </span>
            )}
          </li>
        ))}
      </ul>

      {!hasSubscription && (
        <p className="text-xs leading-relaxed text-neutral-500">
          Utan kostnad under provperioden. Det som är påslaget vid köp läggs
          till på prenumerationen.
        </p>
      )}
    </div>
  );
}

function ConfirmPanel({
  preview,
  action,
}: {
  preview: NonNullable<ModuleFormState["preview"]>;
  action: (formData: FormData) => void;
}) {
  const kr = (amount: number) => amount.toLocaleString("sv-SE");
  const per = preview.interval === "year" ? "år" : "månad";

  const date = preview.nextInvoiceAt
    ? new Date(preview.nextInvoiceAt).toLocaleDateString("sv-SE")
    : null;

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-[13px] font-medium text-neutral-900">
        {preview.on
          ? `Lägg till ${preview.name}`
          : `Ta bort ${preview.name}`}
      </p>

      <dl className="mt-3 space-y-1.5 text-[13px]">
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

        <div className="flex justify-between gap-4">
          <dt className="text-neutral-500">
            {preview.on ? "Tillkommer löpande" : "Utgår löpande"}
          </dt>
          <dd className="font-medium tabular-nums text-neutral-900">
            {kr(preview.recurringAmount)} kr/{per}
          </dd>
        </div>
      </dl>

      {preview.nextInvoiceAmount === null && (
        <p className="mt-2 text-xs text-neutral-500">
          Beloppet för nästa faktura kunde inte hämtas. Resten av perioden
          räknas av.
        </p>
      )}

      <form action={action} className="mt-4 flex gap-2">
        <input type="hidden" name="module" value={preview.key} />
        <input type="hidden" name="on" value={preview.on ? "1" : "0"} />
        <ConfirmButton />
        <Button type="submit" name="step" value="cancel" tone="secondary">
          Avbryt
        </Button>
      </form>
    </div>
  );
}

function ToggleButton({ on }: { on: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {pending ? "Vänta…" : on ? "Slå på" : "Slå av"}
    </Button>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();

  // Steget sitter på knappen och inte i ett dolt fält, så att Bekräfta och
  // Avbryt kan skicka samma formulär med olika innebörd.
  return (
    <Button type="submit" name="step" value="apply" disabled={pending}>
      {pending ? "Ändrar…" : "Bekräfta"}
    </Button>
  );
}
