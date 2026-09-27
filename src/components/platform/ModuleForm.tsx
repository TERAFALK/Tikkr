"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeModule,
  type ModuleFormState,
} from "@/app/plattform/[companyId]/actions";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { Alert, Badge, Button, Field, Input } from "@/components/ui";

export interface ModuleRow {
  key: ModuleKey;
  enabled: boolean;
  source: "STRIPE" | "MANUAL" | null;
  enabledBy: string | null;
}

/**
 * Tillvalen för ett företag.
 *
 * Går att ändra bara för fakturakunder, av samma skäl som licenserna: har
 * företaget en prenumeration hos Stripe ligger modulen som en rad på fakturan,
 * och ett reglage här hade satt ett läge kunden inte betalar för.
 */
export default function ModuleForm({
  companyId,
  modules,
  managedByStripe,
}: {
  companyId: string;
  modules: ModuleRow[];
  managedByStripe: boolean;
}) {
  const [state, action] = useActionState<ModuleFormState, FormData>(
    changeModule,
    {}
  );

  return (
    <div className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <ul className="space-y-3">
        {modules.map((row) => (
          <li key={row.key} className="border-t border-neutral-100 pt-3 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-neutral-800">
                {MODULES[row.key].name}
              </span>

              {row.enabled ? (
                <Badge tone="active">Påslaget</Badge>
              ) : (
                <Badge tone="muted">Avstängt</Badge>
              )}

              {row.enabled && row.source === "STRIPE" && <Badge>Stripe</Badge>}
            </div>

            {row.enabled && row.enabledBy && (
              <p className="mt-1 text-xs text-neutral-400">
                Påslaget av {row.enabledBy}
              </p>
            )}

            {!managedByStripe && (
              <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="companyId" value={companyId} />
                <input type="hidden" name="module" value={row.key} />
                <input type="hidden" name="on" value={row.enabled ? "0" : "1"} />

                <div className="min-w-48 flex-1">
                  <Field label="Anledning">
                    <Input
                      name="reason"
                      placeholder={
                        row.enabled
                          ? "Kunden vill inte längre ha den"
                          : "Fakturakund, ingår i avtalet"
                      }
                      required
                    />
                  </Field>
                </div>

                <SubmitButton on={!row.enabled} />
              </form>
            )}
          </li>
        ))}
      </ul>

      {!managedByStripe && (
        <p className="text-xs leading-relaxed text-neutral-500">
          Att stänga av raderar ingen data. Anledningen sparas i åtgärdsloggen.
        </p>
      )}
    </div>
  );
}

function SubmitButton({ on }: { on: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {pending ? "Sparar…" : on ? "Slå på" : "Slå av"}
    </Button>
  );
}
