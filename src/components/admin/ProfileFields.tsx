"use client";

import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui";
import type { ProfileErrors, ProfileField, ProfileValues } from "@/lib/shop/profile";

/**
 * FÖRETAGETS LEVERANS- OCH FAKTURAUPPGIFTER.
 *
 * Står på två sidor: Inställningar, Företag, och beställningsformuläret under
 * Tillbehör. Fälten ritas här och läses av readProfileForm i
 * src/lib/shop/profile.ts, en gång var, så att de två sidorna inte kan börja
 * skicka olika saker.
 *
 * Fälten är okontrollerade och bär sina värden som defaultValue. Formuläret
 * runt dem skickar dem som vanliga fält, och ett fel skickar tillbaka det som
 * skrevs.
 */
export default function ProfileFields({
  values,
  separateBilling: initialSeparate,
  errors = {},
  requireForOrder = false,
  delivery = true,
}: {
  values: ProfileValues;
  separateBilling: boolean;
  errors?: ProfileErrors;
  /** Markerar fälten en beställning kräver. */
  requireForOrder?: boolean;
  /**
   * false när inget ska skickas. Adressen blir då fakturaadressen, och
   * märkningen och den separata fakturaadressen döljs. Se validateProfile.
   */
  delivery?: boolean;
}) {
  const [separate, setSeparate] = useState(initialSeparate);

  const field = (
    name: ProfileField,
    label: string,
    props: { hint?: string; autoComplete?: string; inputMode?: "numeric" | "email" | "tel"; type?: string; required?: boolean } = {}
  ) => (
    <ProfileField
      key={name}
      name={name}
      label={label}
      hint={props.hint}
      error={errors[name]}
    >
      <Input
        id={`profile-${name}`}
        name={name}
        defaultValue={values[name]}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        type={props.type ?? "text"}
        required={requireForOrder && props.required}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `profile-${name}-error` : undefined}
      />
    </ProfileField>
  );

  return (
    <div className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="mb-3 text-[13px] font-semibold text-neutral-900">
          Kontakt
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("orgNumber", "Organisationsnummer", { inputMode: "numeric", required: true })}
          {field("contactName", "Kontaktperson", { autoComplete: "name", required: true })}
          {field("orderEmail", "E-post för beställningar", {
            type: "email",
            inputMode: "email",
            autoComplete: "email",
            hint: "Orderbekräftelse och leveransbesked",
            required: true,
          })}
          {field("phone", "Telefon", { type: "tel", inputMode: "tel", autoComplete: "tel", required: true })}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 text-[13px] font-semibold text-neutral-900">
          {delivery ? "Leveransadress" : "Fakturaadress"}
        </legend>
        {field("addressLine", "Adress", { autoComplete: "street-address", required: true })}
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          {field("postalCode", "Postnummer", { inputMode: "numeric", autoComplete: "postal-code", required: true })}
          {field("city", "Ort", { autoComplete: "address-level2", required: true })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-[13px] font-medium text-neutral-700">Land</span>
            <p className="py-1.5 text-[13px] text-neutral-900">Sverige</p>
          </div>
          {delivery &&
            field("deliveryReference", "Märkning", {
              hint: "Valfritt. T.ex. namn eller kostnadsställe",
            })}
        </div>
      </fieldset>

      {delivery && (
        <fieldset className="space-y-4">
          <legend className="sr-only">Fakturaadress</legend>
          <label className="flex items-center gap-2 text-[13px] text-neutral-700">
            <input
              type="checkbox"
              name="separateBilling"
              checked={separate}
              onChange={(event) => setSeparate(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
            />
            Annan fakturaadress
          </label>

          {separate && (
            <div className="space-y-4 border-l-2 border-neutral-200 pl-4">
              {field("billingAddressLine", "Fakturaadress", { required: true })}
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                {field("billingPostalCode", "Postnummer", { inputMode: "numeric", required: true })}
                {field("billingCity", "Ort", { required: true })}
              </div>
              {field("invoiceEmail", "E-post för faktura", {
                type: "email",
                inputMode: "email",
                hint: "Valfritt",
              })}
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}

/**
 * Ett fält med etikett, hjälptext och fel.
 *
 * Felet står under fältet och är kopplat till det med aria-describedby, så
 * att en skärmläsare läser upp det när fältet får fokus.
 */
function ProfileField({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: ProfileField;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={`profile-${name}`} className="mb-1 block text-[13px] font-medium text-neutral-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`profile-${name}-error`} className="mt-1 text-xs text-red-700">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs leading-relaxed text-neutral-500">{hint}</p>
      )}
    </div>
  );
}
