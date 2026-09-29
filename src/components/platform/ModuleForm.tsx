"use client";

import {
  changeModule,
  type ModuleFormState,
} from "@/app/plattform/kunder/[companyId]/actions";
import ActionDialog from "@/components/ui/ActionDialog";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { Badge, Field, Input } from "@/components/ui";

export interface ModuleRow {
  key: ModuleKey;
  enabled: boolean;
  source: "STRIPE" | "MANUAL" | null;
  enabledBy: string | null;
}

/**
 * Tillvalen för ett företag.
 *
 * Listan visas alltid — vad kunden köpt står ingen annanstans i panelen. Att
 * ÄNDRA går bara för fakturakunder: har företaget en prenumeration hos Stripe
 * ligger modulen som en rad på fakturan, och ett reglage här hade satt ett
 * läge kunden inte betalar för.
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
  return (
    <ul className="divide-y divide-neutral-100">
      {modules.map((row) => (
        <li
          key={row.key}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-neutral-900">
              {MODULES[row.key].name}
            </span>
            {row.enabled && row.enabledBy && (
              <span className="mt-0.5 block text-xs text-neutral-400">
                Påslaget av {row.enabledBy}
              </span>
            )}
          </span>

          {row.enabled && row.source === "STRIPE" && <Badge>Stripe</Badge>}

          {row.enabled ? (
            <Badge tone="active">Påslaget</Badge>
          ) : (
            <Badge tone="muted">Avstängt</Badge>
          )}

          {!managedByStripe && (
            <ActionDialog<ModuleFormState>
              trigger={row.enabled ? "Slå av" : "Slå på"}
              title={
                row.enabled
                  ? `Stäng av ${MODULES[row.key].name}`
                  : `Slå på ${MODULES[row.key].name}`
              }
              description={
                row.enabled
                  ? "Ingen data raderas. Scheman, raster och frånvaro ligger kvar."
                  : undefined
              }
              action={changeModule}
              initial={{}}
              submitLabel={row.enabled ? "Slå av" : "Slå på"}
            >
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="module" value={row.key} />
              <input type="hidden" name="on" value={row.enabled ? "0" : "1"} />

              <Field label="Anledning" hint="Sparas i åtgärdsloggen">
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
            </ActionDialog>
          )}
        </li>
      ))}
    </ul>
  );
}
