"use client";

import { savePrices } from "@/app/plattform/artiklar/actions";
import SaveForm from "@/components/admin/SaveForm";
import { Field, Input } from "@/components/ui";

/**
 * Artikelnumren för en sak vi säljer.
 *
 * Miljövariabelns värde visas som platshållare i ett tomt fält. Det är
 * skillnaden mellan "inget är satt" och "något är satt någon annanstans, och
 * det är detta" — utan den ser sidan ut att ljuga om att ingen artikel finns.
 *
 * Fälten ligger kvar på sidan och inte i en ruta. Det här är en sida man
 * kommer till för att fylla i, till skillnad från kundsidan där man kommer
 * för att läsa.
 */
export default function PriceForm({
  item,
  month,
  year,
  envMonth,
  envYear,
  envNameMonth,
  envNameYear,
  updatedByEmail,
}: {
  item: string;
  month: string;
  year: string;
  envMonth: string | null;
  envYear: string | null;
  envNameMonth: string;
  envNameYear: string;
  updatedByEmail: string | null;
}) {
  return (
    <SaveForm
      action={savePrices}
      className="space-y-4"
      pendingLabel="Kontrollerar…"
    >
      <input type="hidden" name="item" value={item} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Månad" hint={envHint(envMonth, envNameMonth)}>
          <Input
            name="month"
            defaultValue={month}
            placeholder={envMonth ?? "price_..."}
            spellCheck={false}
          />
        </Field>

        <Field label="År" hint={envHint(envYear, envNameYear)}>
          <Input
            name="year"
            defaultValue={year}
            placeholder={envYear ?? "price_..."}
            spellCheck={false}
          />
        </Field>
      </div>

      {updatedByEmail && (
        <p className="text-xs text-neutral-400">
          Senast ändrat av {updatedByEmail}
        </p>
      )}
    </SaveForm>
  );
}

/** Talar om att ett tomt fält ändå har ett värde, och varifrån. */
function envHint(value: string | null, name: string): string | undefined {
  if (!value) return undefined;
  return `Ligger i ${name}`;
}
