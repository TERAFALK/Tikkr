"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
import { useFieldError, useKeptSubmit } from "@/components/ui/useFieldError";
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
 * Egen komponent istället för den generella ActionDialog, eftersom den här rutan
 * måste stanna öppen när servern avvisar. Krockar tiden med ett annat pass är
 * det något administratören behöver läsa och rätta — stängdes rutan skulle
 * felet försvinna tillsammans med de ifyllda värdena.
 *
 * ORDERTID ELLER IMPRODUKTIV TID (tillagt 2026-10-13). Valet står först,
 * eftersom det avgör vilka fält som finns: en improduktiv post har varken
 * order eller arbetsmoment. Fälten för den sort som inte är vald ritas inte
 * alls, så att de aldrig skickas med.
 *
 * DUBBELJOBB I ETT STEG (tillagt 2026-11-23, pilotkundens begäran). Lägg till
 * samtidig stämpling gör det Lägg till jobb gör på stämplingsskärmen: ett jobb
 * till, på ett annat arbetsmoment, för samma person. Varje rad har egna tider,
 * eftersom jobben på skärmen stämplas ut var för sig, men tiderna fylls i från
 * den första raden när raden läggs till. Allt sparas i ett svep, eller
 * ingenting, se createManualEntries.
 *
 * VARJE RAD VÄLJER SIN SORT (ändrat 2026-11-23, produktägarens val). De
 * tillagda raderna var bara ordertid, så ett dubbeljobb gick att lägga in med
 * improduktiv tid först men inte sist. Stämplingsskärmen gör ingen sådan
 * skillnad: Lägg till jobb tar vilket jobb som helst, och bara samma moment
 * två gånger samtidigt stoppas.
 *
 * Fälten bär radens plats i namnet (`extra-0-kind` och så vidare), eftersom
 * raderna har olika fält beroende på sort. Med samma namn på varje rad och
 * `getAll` hade en rad med ordertid och en med improduktiv tid hamnat i otakt.
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
  const [kind, setKind] = useState<Kind>("ORDER");
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const errorId = useFieldError(form, state);
  const { pending, onSubmit } = useKeptSubmit(action);

  // De tillagda raderna. Sorten styr vilka fält som ritas; resten är
  // okontrollerat, som formuläret i övrigt.
  const [extra, setExtra] = useState<
    { key: number; kind: Kind; from: string; to: string }[]
  >([]);
  const nextKey = useRef(0);

  function addParallel() {
    const elements = form.current?.elements;
    const value = (name: string) => {
      const field = elements?.namedItem(name);
      return field instanceof HTMLInputElement ? field.value : "";
    };
    setExtra((rows) => [
      ...rows,
      {
        key: nextKey.current++,
        kind: "ORDER",
        from: value("clockInAt"),
        to: value("clockOutAt"),
      },
    ]);
  }

  function resetForm() {
    form.current?.reset();
    setExtra([]);
  }

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
    resetForm();
  }, [state]);

  return (
    <>
      <Button type="button" onClick={() => dialog.current?.showModal()}>
        Ny stämpling
      </Button>

      <dialog
        ref={dialog}
        onClose={resetForm}
        className={`w-[min(40rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">
            Lägg till stämpling
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
            För tid som aldrig blev stämplad. Posten märks som manuell. Två
            stämplingar samtidigt för samma anställd läggs på olika moment.
          </p>
        </div>

        <form ref={form} onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${dialogBody} space-y-4 px-5 py-5`}>
            {state.error && <Alert id={errorId}>{state.error}</Alert>}

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
              <KindChoice name="kind" value={kind} onChange={setKind} />
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

            <input type="hidden" name="extraCount" value={extra.length} />

            {extra.map((row, index) => {
              const field = (name: string) => `extra-${index}-${name}`;

              return (
                <section
                  key={row.key}
                  aria-label={`Samtidig stämpling ${index + 1}`}
                  className="space-y-4 border-t border-neutral-200 pt-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[13px] font-semibold text-neutral-900">
                      Samtidig stämpling{extra.length > 1 ? ` ${index + 1}` : ""}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setExtra((rows) => rows.filter((r) => r.key !== row.key))
                      }
                      className="text-[13px] font-medium text-link hover:underline"
                    >
                      Ta bort
                    </button>
                  </div>

                  {indirectMoments.length > 0 ? (
                    <KindChoice
                      name={field("kind")}
                      value={row.kind}
                      onChange={(next) =>
                        setExtra((rows) =>
                          rows.map((r) =>
                            r.key === row.key ? { ...r, kind: next } : r
                          )
                        )
                      }
                    />
                  ) : (
                    <input type="hidden" name={field("kind")} value="ORDER" />
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    {row.kind === "INDIRECT" ? (
                      <div className="sm:col-span-2">
                        <Field label="Improduktivt moment">
                          <Select
                            name={field("indirectMomentId")}
                            required
                            defaultValue=""
                          >
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
                        <Field label="Order">
                          <SearchSelect
                            name={field("orderId")}
                            inDialog
                            options={orders}
                            placeholder="Sök order…"
                            emptyLabel="Välj order…"
                            required
                          />
                        </Field>

                        <Field label="Arbetsmoment">
                          <Select name={field("momentId")} required defaultValue="">
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
                      <Input
                        type="datetime-local"
                        name={field("clockInAt")}
                        defaultValue={row.from}
                        required
                      />
                    </Field>

                    <Field label="Utstämplad">
                      <Input
                        type="datetime-local"
                        name={field("clockOutAt")}
                        defaultValue={row.to}
                        required
                      />
                    </Field>
                  </div>
                </section>
              );
            })}

            <Button type="button" tone="secondary" onClick={addParallel}>
              Lägg till samtidig stämpling
            </Button>
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
            <SubmitButton pending={pending} />
          </div>
        </form>
      </dialog>
    </>
  );
}

type Kind = "ORDER" | "INDIRECT";

/** Ordertid eller improduktiv tid. Samma val på första raden och de tillagda. */
function KindChoice({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Kind;
  onChange: (kind: Kind) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-4 text-[13px]">
      <legend className="sr-only">Sort</legend>
      {(
        [
          ["ORDER", "Ordertid"],
          ["INDIRECT", "Improduktiv tid"],
        ] as const
      ).map(([option, label]) => (
        <label
          key={option}
          className="flex cursor-pointer items-center gap-2 font-medium text-neutral-900"
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="h-3.5 w-3.5 border-neutral-300 text-blue-600 focus:ring-blue-600"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Lägger till…" : "Lägg till"}
    </Button>
  );
}
