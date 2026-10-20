"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import ActionDialog from "@/components/ui/ActionDialog";
import SearchSelect, {
  type SearchSelectOption,
} from "@/components/admin/SearchSelect";
import { Button, Field, Input, Select } from "@/components/ui";
import { momentOptionsFor, type PickableMoment } from "@/lib/moment-options";
import {
  editEntry,
  type EditEntryState,
} from "@/app/admin/(panel)/stamplingar/actions";

/**
 * EN ÄNDRA-RUTA FÖR HELA LISTAN (ändrat 2026-10-20).
 *
 * Varje rad i Stämplingar bar en egen ruta, och varje ruta fick hela
 * orderregistret med sig till ordervalet. Femtio rader och femhundra ordrar
 * blev femtio kopior av registret i varje sidvisning, och det var det som
 * gjorde sidan långsam. Nu finns rutan en gång, och raderna bär bara sina
 * egna värden.
 *
 * Rutan ritas om för varje öppning (`key`), så att fälten alltid börjar på
 * radens sparade värden och aldrig på det någon skrev och avbröt förra gången.
 */

export interface EditableEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  kind: "ORDER" | "INDIRECT";
  orderId: string | null;
  momentId: string | null;
  indirectMomentId: string | null;
  /** Färdiga för fälten, i företagets tidszon. */
  clockInAt: string;
  clockOutAt: string;
}


const OpenEditor = createContext<(entry: EditableEntry) => void>(() => {});

export function EntryEditor({
  orders,
  moments,
  indirectMoments,
  children,
}: {
  orders: SearchSelectOption[];
  moments: PickableMoment[];
  indirectMoments: PickableMoment[];
  children: ReactNode;
}) {
  const [editing, setEditing] = useState<{
    entry: EditableEntry;
    opened: number;
  } | null>(null);

  const open = (entry: EditableEntry) =>
    setEditing((previous) => ({ entry, opened: (previous?.opened ?? 0) + 1 }));

  return (
    <OpenEditor.Provider value={open}>
      {children}
      {editing && (
        <ActionDialog<EditEntryState>
          key={editing.opened}
          openOnMount
          trigger={() => null}
          title={`Ändra stämpling: ${editing.entry.employeeName}`}
          action={editEntry}
          initial={{}}
          submitLabel="Spara"
        >
          <EntryFields
            entry={editing.entry}
            orders={orders}
            moments={moments}
            indirectMoments={indirectMoments}
          />
        </ActionDialog>
      )}
    </OpenEditor.Provider>
  );
}

/** Knappen på raden. Öppnar den gemensamma rutan med radens värden. */
export function EditEntryButton({ entry }: { entry: EditableEntry }) {
  const open = useContext(OpenEditor);

  return (
    <Button type="button" tone="ghost" onClick={() => open(entry)}>
      Ändra
    </Button>
  );
}

function EntryFields({
  entry,
  orders,
  moments,
  indirectMoments,
}: {
  entry: EditableEntry;
  orders: SearchSelectOption[];
  moments: PickableMoment[];
  indirectMoments: PickableMoment[];
}) {
  return (
    <>
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="employeeId" value={entry.employeeId} />

      {/* Posten behåller sin sort. En improduktiv stämpling har varken order
          eller arbetsmoment, och visades den i orderformuläret skulle ett
          sparat formulär göra en städtimme till fakturerbar ordertid — tyst. */}
      <input type="hidden" name="kind" value={entry.kind} />

      {entry.kind === "INDIRECT" ? (
        <Field label="Improduktivt moment">
          <Select
            name="indirectMomentId"
            defaultValue={entry.indirectMomentId ?? ""}
          >
            {momentOptionsFor(indirectMoments, entry.indirectMomentId).map(
              (option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              )
            )}
          </Select>
        </Field>
      ) : (
        <>
          <Field label="Order">
            <SearchSelect
              name="orderId"
              inDialog
              options={orders}
              defaultValue={entry.orderId}
              placeholder="Sök order…"
              emptyLabel="Välj order…"
              required
            />
          </Field>

          <Field label="Arbetsmoment">
            <Select name="momentId" defaultValue={entry.momentId ?? ""}>
              {momentOptionsFor(moments, entry.momentId).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instämplad">
          <Input
            type="datetime-local"
            name="clockInAt"
            defaultValue={entry.clockInAt}
          />
        </Field>
        <Field label="Utstämplad">
          <Input
            type="datetime-local"
            name="clockOutAt"
            defaultValue={entry.clockOutAt}
          />
        </Field>
      </div>
    </>
  );
}
