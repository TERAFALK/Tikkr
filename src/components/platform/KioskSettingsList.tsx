"use client";

import ActionDialog, { type DialogState } from "@/components/ui/ActionDialog";
import { Badge, Field, Input } from "@/components/ui";
import {
  KIOSK_SETTINGS,
  type KioskSettingKey,
} from "@/lib/kiosk-settings";

export interface KioskSettingRow {
  key: KioskSettingKey;
  /** Det som gäller nu, som det lagras. */
  value: string;
  /** Värdet på just den här nivån, eller null när nivån ovanför gäller. */
  own: string | null;
}

/**
 * SKÄRMINSTÄLLNINGARNA SOM EN LISTA, med Ändra per rad.
 *
 * Samma lista på två ställen: plattformens standard under Skärmar, och en
 * kunds egna värden på kundens sida. Skillnaden är vad ett tomt fält betyder,
 * och den står i `inheritedLabel` och `emptyHint`.
 *
 * Läser registret direkt. Det har inga importer och följer därför med till
 * webbläsaren utan att ta databasen med sig.
 */
export default function KioskSettingsList({
  rows,
  action,
  hidden,
  inheritedLabel,
  emptyHint,
}: {
  rows: KioskSettingRow[];
  action: (previous: DialogState, formData: FormData) => Promise<DialogState>;
  /** Fält som följer med varje sparning, t.ex. vilket företag. */
  hidden?: Record<string, string>;
  /** Märket när nivån ovanför gäller, t.ex. "Standard". */
  inheritedLabel: string;
  /** Fälthjälpens tillägg om vad tomt betyder. */
  emptyHint: string;
}) {
  return (
    <ul className="divide-y divide-neutral-100">
      {rows.map((row) => {
        const definition = KIOSK_SETTINGS[row.key];

        return (
          <li
            key={row.key}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
          >
            <span className="min-w-0 flex-1 text-[13px] font-medium text-neutral-900">
              {definition.label}
            </span>

            <span className="text-[13px] tabular-nums text-neutral-900">
              {definition.describe(row.value)}
            </span>

            {row.own === null ? (
              <Badge tone="muted">{inheritedLabel}</Badge>
            ) : (
              <Badge tone="active">Eget</Badge>
            )}

            <ActionDialog<DialogState>
              trigger="Ändra"
              triggerTone="secondary"
              title={definition.label}
              action={action}
              initial={{}}
              submitLabel="Spara"
            >
              {Object.entries(hidden ?? {}).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <input type="hidden" name="key" value={row.key} />

              <Field label={definition.label} hint={`${definition.hint}. ${emptyHint}`}>
                <Input
                  name="value"
                  autoComplete="off"
                  // Ett tomt lagrat värde är en avstängd omstart. Det skrivs
                  // som "av", eftersom ett tomt fält betyder nivån ovanför.
                  defaultValue={row.own === null ? "" : row.own === "" ? "av" : row.own}
                  placeholder={definition.describe(row.value)}
                />
              </Field>
            </ActionDialog>
          </li>
        );
      })}
    </ul>
  );
}
