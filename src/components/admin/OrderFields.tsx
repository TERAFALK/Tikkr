"use client";

import { Field, Input } from "@/components/ui";
import BudgetMoments, { type BudgetMomentOption } from "./BudgetMoments";
import SearchSelect, { type SearchSelectOption } from "./SearchSelect";

/**
 * ORDERNS UPPGIFTER — samma fält när den skapas som när den ändras.
 *
 * Låg de på två ställen blev de olika, och det blev de: påslag och fast pris
 * gick länge bara att fylla i efteråt, eftersom skapa-rutan var ett kortare
 * formulär som ingen kom ihåg att hålla i takt. Den som la upp en fastprisorder
 * fick lägga upp den först och rätta den sedan.
 *
 * Nu finns fälten en gång. Skillnaden mellan rutorna är bara vad de heter och
 * vad de börjar med.
 */

export interface OrderFieldsDefaults {
  orderNumber: string;
  customerId: string | null;
  budgets: { momentId: string; minutes: number }[];
  markupPercent: number | null;
  fixedPriceOre: number | null;
}

export default function OrderFields({
  customers,
  moments,
  defaults,
  autoFocus = false,
}: {
  customers: SearchSelectOption[];
  moments: BudgetMomentOption[];
  /** Utelämnat betyder en ny order: tomma fält. */
  defaults?: OrderFieldsDefaults;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Field label="Ordernummer">
        <Input
          name="orderNumber"
          defaultValue={defaults?.orderNumber ?? ""}
          placeholder="2601"
          required
          autoFocus={autoFocus}
        />
      </Field>

      <Field label="Kund" hint="Valfritt. Sök på namn, kundnummer eller org.nr.">
        <SearchSelect
          name="customerId"
          options={customers}
          defaultValue={defaults?.customerId ?? null}
          emptyLabel="Ingen kund"
          placeholder="Sök kund…"
        />
      </Field>

      <Field
        label="Beräknad tid"
        hint="Valfritt. Ett arbetsmoment i taget, i timmar. Totalen är orderns beräknade tid."
      >
        <BudgetMoments moments={moments} defaultRows={defaults?.budgets} />
      </Field>

      <Field
        label="Påslag"
        hint="Faktor, t.ex. 1,4. Lämna tomt för företagets standard. Används inte när ett fast pris är satt."
      >
        <Input
          name="markup"
          inputMode="decimal"
          // Samma skäl som timfältet i BudgetMoments: ett belopp i ett kort
          // numeriskt fält lockar till sig lösenordshanterarnas kortifyllning.
          autoComplete="off"
          defaultValue={
            defaults?.markupPercent == null
              ? ""
              : (defaults.markupPercent / 100).toFixed(2).replace(".", ",")
          }
          placeholder="1,4"
        />
      </Field>

      <Field
        label="Fast kundpris"
        hint="Kronor för hela ordern. Ifyllt visar kalkylen det som pris och räknar vinsten mot självkostnaden. Tomt betyder löpande räkning."
      >
        <Input
          name="fixedPrice"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={
            defaults?.fixedPriceOre == null
              ? ""
              : (defaults.fixedPriceOre / 100).toFixed(2).replace(".", ",")
          }
          placeholder="7350"
        />
      </Field>
    </>
  );
}
