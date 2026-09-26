"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { CustomerState } from "@/app/admin/(panel)/kunder/actions";
import {
  Alert,
  Button,
  dialogBody,
  dialogEdge,
  dialogSurface,
  Field,
  Input,
  SectionTitle,
} from "@/components/ui";

/**
 * RUTAN DÄR EN KUND LÄGGS UPP ELLER ÄNDRAS.
 *
 * Bara namnet krävs. Ett register som kräver org.nr innan man får lägga upp
 * någon blir ett register ingen fyller i — och då står man där med fritext
 * igen, fast i anteckningsfältet.
 *
 * Fälten står i fyra grupper: vem kunden är, hur man når dem, var de finns,
 * och vad de kostar. Priset står SIST med flit — den som bara ska rätta en
 * adress ska inte behöva skrolla förbi ett påslag och råka ändra det.
 *
 * Rutan stängs inte av sig själv vid fel. Ett upptaget kundnummer ska gå att
 * rätta utan att skriva in allt igen.
 */
export default function CustomerDialog({
  trigger,
  triggerTone = "primary",
  title,
  action,
  submitLabel,
  customer,
}: {
  trigger: string;
  triggerTone?: "primary" | "secondary" | "ghost";
  title: string;
  action: (
    previous: CustomerState,
    formData: FormData
  ) => Promise<CustomerState>;
  submitLabel: string;
  /** Utelämnas när en ny kund läggs upp. */
  customer?: {
    id: string;
    name: string;
    customerNumber: string | null;
    orgNumber: string | null;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    notes: string | null;
    markupPercent: number | null;
    discountPercent: number | null;
  };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, submit] = useActionState<CustomerState, FormData>(action, {});

  useEffect(() => {
    if (state.savedAt) dialog.current?.close();
  }, [state.savedAt]);

  return (
    <>
      <Button
        type="button"
        tone={triggerTone}
        onClick={() => dialog.current?.showModal()}
      >
        {trigger}
      </Button>

      <dialog
        ref={dialog}
        className={`w-[min(34rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        </div>

        <form action={submit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${dialogBody} space-y-5 px-5 py-5`}>
            {state.error && <Alert>{state.error}</Alert>}

            {customer && <input type="hidden" name="id" value={customer.id} />}

            <div className="space-y-4">
              <Field label="Namn">
                <Input
                  name="name"
                  defaultValue={customer?.name ?? ""}
                  placeholder="Volvo Lastvagnar"
                  required
                  autoFocus
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Kundnummer" hint="Ert eget">
                  <Input
                    name="customerNumber"
                    defaultValue={customer?.customerNumber ?? ""}
                    placeholder="1001"
                  />
                </Field>
                <Field label="Organisationsnummer">
                  <Input
                    name="orgNumber"
                    defaultValue={customer?.orgNumber ?? ""}
                    placeholder="556013-9700"
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-4 border-t border-neutral-100 pt-5">
              <SectionTitle hint="Syns inte för kunden">
                Kontakt
              </SectionTitle>

              <Field label="Kontaktperson">
                <Input
                  name="contactName"
                  defaultValue={customer?.contactName ?? ""}
                  placeholder="Anna Svensson"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="E-post">
                  <Input
                    type="email"
                    name="email"
                    defaultValue={customer?.email ?? ""}
                    placeholder="anna@example.com"
                  />
                </Field>
                <Field label="Telefon">
                  <Input
                    name="phone"
                    defaultValue={customer?.phone ?? ""}
                    placeholder="0520-123 45"
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-4 border-t border-neutral-100 pt-5">
              <SectionTitle hint="Skrivs ut på kundens underlag">
                Adress
              </SectionTitle>

              <Field label="Gatuadress">
                <Input
                  name="addressLine"
                  defaultValue={customer?.addressLine ?? ""}
                  placeholder="Verkstadsgatan 4"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Postnummer">
                  <Input
                    name="postalCode"
                    defaultValue={customer?.postalCode ?? ""}
                    placeholder="462 35"
                  />
                </Field>
                <Field label="Ort">
                  <Input
                    name="city"
                    defaultValue={customer?.city ?? ""}
                    placeholder="Vänersborg"
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-4 border-t border-neutral-100 pt-5">
              <SectionTitle hint="Tomt ger företagets standard">
                Pris
              </SectionTitle>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Påslag"
                  hint="Faktor, t.ex. 1,3"
                >
                  <Input
                    name="markup"
                    inputMode="decimal"
                    placeholder="1,3"
                    defaultValue={
                      customer?.markupPercent == null
                        ? ""
                        : String(customer.markupPercent / 100).replace(".", ",")
                    }
                  />
                </Field>
                <Field
                  label="Rabatt (%)"
                  hint="Dras av efter påslaget. Syns för kunden"
                >
                  <Input
                    name="discount"
                    inputMode="decimal"
                    placeholder="10"
                    defaultValue={customer?.discountPercent ?? ""}
                  />
                </Field>
              </div>

              <Field label="Anteckning" hint="Syns inte för kunden">
                <Input
                  name="notes"
                  defaultValue={customer?.notes ?? ""}
                  placeholder="Fakturamärkning, avtal, annat att minnas"
                />
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
            <SubmitButton label={submitLabel} />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : label}
    </Button>
  );
}
