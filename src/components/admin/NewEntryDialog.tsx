"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addEntry,
  type EntryFormState,
} from "@/app/admin/(panel)/stamplingar/actions";
import {
  Alert,
  Button,
  dialogBody,
  dialogEdge,
  dialogSurface,
  Field,
  Input,
  Select,
} from "@/components/ui";
import SearchSelect from "./SearchSelect";

interface Option {
  id: string;
  label: string;
  /** Extra text i sökbara väljare. Söks i, men syns dämpat. */
  hint?: string;
}

/**
 * Lägger in en stämpling som saknas.
 *
 * Egen komponent istället för den generella FormDialog, eftersom den här rutan
 * måste stanna öppen när servern avvisar. Krockar tiden med ett annat pass är
 * det något administratören behöver läsa och rätta — stängdes rutan skulle
 * felet försvinna tillsammans med de ifyllda värdena.
 *
 * ORDERTID ELLER IMPRODUKTIV TID (tillagt 2026-10-13). Valet står först,
 * eftersom det avgör vilka fält som finns: en improduktiv post har varken
 * order eller arbetsmoment. Fälten för den sort som inte är vald ritas inte
 * alls, så att de aldrig skickas med.
 */
export default function NewEntryDialog({
  employees,
  orders,
  moments,
  indirectMoments,
  openOnMount = false,
}: {
  employees: Option[];
  orders: Option[];
  moments: Option[];
  /** De aktiva improduktiva momenten. */
  indirectMoments: Option[];
  /**
   * Öppnar rutan direkt, för genvägen på översikten (`?ny=1`). Utan den
   * landade man på sidan och fick leta rätt på samma knapp en gång till.
   */
  openOnMount?: boolean;
}) {
  const [state, action] = useActionState<EntryFormState, FormData>(addEntry, {});
  const [kind, setKind] = useState<"ORDER" | "INDIRECT">("ORDER");
  const dialog = useRef<HTMLDialogElement>(null);

  // En gång, vid uppkopplingen. Stängs rutan ska den stanna stängd.
  useEffect(() => {
    if (openOnMount) dialog.current?.showModal();
  }, [openOnMount]);

  // Stängs först när posten faktiskt skapats.
  //
  // JÄMFÖR SVARET SOM OBJEKT, inte dess text (ändrat 2026-10-21). Åtgärden
  // svarar med samma mening varje gång, så när effekten lyssnade på texten
  // stängdes rutan bara efter första posten. Från den andra stod den kvar
  // öppen med tömda fält, och pilotkunden trodde att ingenting sparats. Samma
  // rättelse som i ActionDialog, se tests/dialog-close.test.ts.
  const handled = useRef<EntryFormState | null>(null);

  useEffect(() => {
    if (!state.ok || handled.current === state) return;

    handled.current = state;
    dialog.current?.close();
  }, [state]);

  return (
    <>
      <Button type="button" onClick={() => dialog.current?.showModal()}>
        Ny stämpling
      </Button>

      <dialog
        ref={dialog}
        className={`w-[min(40rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">
            Lägg till stämpling
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
            För tid som aldrig blev stämplad. Posten märks som manuell.
          </p>
        </div>

        <form action={action} className="flex min-h-0 flex-1 flex-col">
          <div className={`${dialogBody} space-y-4 px-5 py-5`}>
            {state.error && <Alert>{state.error}</Alert>}

            <Field label="Anställd">
              <Select name="employeeId" required defaultValue="">
                <option value="" disabled>
                  Välj…
                </option>
                {employees.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Utan improduktiva moment finns inget att välja, och valet
                visas inte. */}
            {indirectMoments.length > 0 && (
              <fieldset className="flex flex-wrap gap-4 text-[13px]">
                <legend className="sr-only">Sort</legend>
                {(
                  [
                    ["ORDER", "Ordertid"],
                    ["INDIRECT", "Improduktiv tid"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 font-medium text-neutral-900"
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={value}
                      checked={kind === value}
                      onChange={() => setKind(value)}
                      className="h-3.5 w-3.5 border-neutral-300 text-blue-600 focus:ring-blue-600"
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {kind === "INDIRECT" ? (
                <div className="sm:col-span-2">
                  <Field label="Improduktivt moment">
                    <Select name="indirectMomentId" required defaultValue="">
                      <option value="" disabled>
                        Välj…
                      </option>
                      {indirectMoments.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : (
                <>
                  {/* Sökbar, till skillnad från de andra två. Ordrar samlas
                      fortare än både anställda och arbetsmoment — efter ett års
                      drift är listan hundratals rader, och man vet vilket
                      nummer man letar efter. Att skrolla till det är fel
                      verktyg. */}
                  <Field label="Order">
                    <SearchSelect
                      name="orderId"
                      inDialog
                      options={orders}
                      placeholder="Sök order…"
                      emptyLabel="Välj order…"
                      required
                    />
                  </Field>

                  <Field label="Arbetsmoment">
                    <Select name="momentId" required defaultValue="">
                      <option value="" disabled>
                        Välj…
                      </option>
                      {moments.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}

              <Field label="Instämplad">
                <Input type="datetime-local" name="clockInAt" required />
              </Field>

              <Field label="Utstämplad">
                <Input type="datetime-local" name="clockOutAt" required />
              </Field>
            </div>
          </div>

          <div
            className={`${dialogEdge} flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
          >
            <Button
              type="button"
              tone="secondary"
              onClick={() => dialog.current?.close()}
            >
              Avbryt
            </Button>
            <SubmitButton />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Lägger till…" : "Lägg till"}
    </Button>
  );
}
