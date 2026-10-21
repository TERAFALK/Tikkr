"use client";

import { startTransition, useActionState, useRef, useState, type ReactNode } from "react";
import {
  saveProductAction,
  type ProductFormState,
} from "@/app/plattform/(panel)/produkter/actions";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import type { Benefit, ProductKind, SpecGroup } from "@/lib/shop/catalog";

/** Produktens värden som formuläret visar dem. */
export interface ProductFormValues {
  id: string | null;
  name: string;
  slug: string;
  kind: ProductKind;
  summary: string;
  description: string;
  /** Kronor exklusive moms, som fältet tar emot dem. */
  price: string;
  vatRatePercent: number;
  maxQuantity: number;
  delivery: string;
  warranty: string;
  benefits: Benefit[];
  included: string[];
  requirements: string[];
  specs: SpecGroup[];
  inShop: boolean;
  onSite: boolean;
  sortOrder: number;
}

/**
 * EN PRODUKT I BUTIKEN, SOM PLATTFORMEN LÄGGER UPP OCH ÄNDRAR DEN.
 *
 * Fälten heter som `readProductForm` i product-admin.ts läser dem. Listorna
 * skickas som upprepade fält, ett per rad, och raderna här är bara deras
 * ordning på skärmen; varje rad har ett eget id så att React inte blandar
 * ihop två rader när en i mitten tas bort.
 */
export default function ProductForm({ product }: { product: ProductFormValues }) {
  const [state, submit, pending] = useActionState<ProductFormState, FormData>(
    saveProductAction,
    {}
  );

  // Formuläret skickas för hand och inte med `action`. React tömmer ett
  // formulär efter en `action`, och ett fel i priset hade då raderat allt
  // som skrivits i listorna. Sidan läses om efter en sparning, och den nya
  // nyckeln på komponenten (se sidan) ritar då fälten med de sparade värdena.
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => submit(data));
      }}
    >
      {product.id && <input type="hidden" name="id" value={product.id} />}

      {state.error && <Alert>{state.error}</Alert>}

      <Card>
        <CardHeader title="Produkten" />
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Namn">
              <Input name="name" defaultValue={product.name} required maxLength={120} />
            </Field>
            <Field label="Typ" hint="En vara skickas och kräver leveransadress">
              <Select name="kind" defaultValue={product.kind}>
                <option value="GOODS">Vara</option>
                <option value="SERVICE">Tjänst</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Adress"
            hint="Små bokstäver, siffror och bindestreck. Tomt ger en av namnet. Visas som /tillbehor/adress"
          >
            <Input name="slug" defaultValue={product.slug} maxLength={60} spellCheck={false} />
          </Field>
          <Field label="Kort beskrivning" hint="En mening, under namnet i butiken">
            <Input name="summary" defaultValue={product.summary} required maxLength={300} />
          </Field>
          <Field label="Beskrivning" hint="Stycken skiljs åt av en tom rad">
            <Textarea name="description" defaultValue={product.description} rows={6} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Pris och leverans" />
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Pris, kr exkl. moms" hint="Gäller nya beställningar">
              <Input name="price" defaultValue={product.price} inputMode="decimal" required />
            </Field>
            <Field label="Moms">
              <Select name="vatRatePercent" defaultValue={String(product.vatRatePercent)}>
                {[25, 12, 6, 0].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate} %
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Högsta antal per beställning">
              <Input
                name="maxQuantity"
                type="number"
                min={1}
                max={999}
                defaultValue={product.maxQuantity}
              />
            </Field>
          </div>
          <Field label="Leverans" hint="T.ex. Tillverkas på beställning. Beräknad leveranstid 3–4 veckor.">
            <Input name="delivery" defaultValue={product.delivery} />
          </Field>
          <Field label="Garanti" hint="Valfritt">
            <Textarea name="warranty" defaultValue={product.warranty} rows={3} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Synlighet" />
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 p-5">
          <Check name="inShop" defaultChecked={product.inShop}>
            I butiken i panelen
          </Check>
          <Check name="onSite" defaultChecked={product.onSite}>
            På säljsidan
          </Check>
          <div className="w-32">
            <Field label="Ordning" hint="Lägre står först">
              <Input name="sortOrder" type="number" defaultValue={product.sortOrder} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Fördelar" />
        <Rows
          initial={product.benefits.map((benefit) => [benefit.title, benefit.body])}
          columns={[
            { name: "benefitTitle", label: "Rubrik", width: "sm:w-56" },
            { name: "benefitBody", label: "Text" },
          ]}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Det här ingår" />
          <Rows
            initial={product.included.map((item) => [item])}
            columns={[{ name: "included", label: "Rad" }]}
          />
        </Card>
        <Card>
          <CardHeader title="Det här behöver kunden" />
          <Rows
            initial={product.requirements.map((item) => [item])}
            columns={[{ name: "requirements", label: "Rad" }]}
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Specifikationer"
          description="Rader i följd med samma grupp visas under samma rubrik."
        />
        <Rows
          initial={product.specs.flatMap((group) =>
            group.rows.map((row) => [group.title, row.label, row.value])
          )}
          columns={[
            { name: "specGroup", label: "Grupp", width: "sm:w-40" },
            { name: "specLabel", label: "Egenskap", width: "sm:w-48" },
            { name: "specValue", label: "Värde" },
          ]}
          copyFirstColumn
        />
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sparar…" : product.id ? "Spara" : "Lägg upp produkten"}
        </Button>
        {state.ok && !pending && (
          <span aria-live="polite" className="text-[13px] font-medium text-emerald-700">
            {state.ok}
          </span>
        )}
      </div>
    </form>
  );
}

function Check({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 pb-2 text-[13px] text-neutral-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
      />
      {children}
    </label>
  );
}

/**
 * Rader med en eller flera kolumner. Lägg till rad lägger en tom sist,
 * och för specifikationerna står gruppen från raden ovanför redan ifylld.
 */
function Rows({
  initial,
  columns,
  copyFirstColumn = false,
}: {
  initial: string[][];
  columns: { name: string; label: string; width?: string }[];
  copyFirstColumn?: boolean;
}) {
  const next = useRef(0);
  const nextId = () => (next.current += 1);

  const [rows, setRows] = useState(() =>
    initial.map((values) => ({ id: nextId(), values }))
  );

  const add = () =>
    setRows((current) => {
      const last = current.at(-1);
      const values = columns.map((_, index) =>
        copyFirstColumn && index === 0 && last ? last.values[0] : ""
      );
      return [...current, { id: nextId(), values }];
    });

  return (
    <div className="space-y-2 p-5">
      {rows.length === 0 && <p className="text-[13px] text-neutral-500">Inga rader</p>}

      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
          {columns.map((column, index) => (
            <div key={column.name} className={`w-full ${column.width ?? "sm:flex-1"}`}>
              <Input
                name={column.name}
                defaultValue={row.values[index] ?? ""}
                aria-label={column.label}
                placeholder={column.label}
                maxLength={300}
              />
            </div>
          ))}
          <Button
            type="button"
            tone="ghost"
            aria-label="Ta bort raden"
            onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
          >
            Ta bort
          </Button>
        </div>
      ))}

      <Button type="button" tone="secondary" onClick={add}>
        Lägg till rad
      </Button>
    </div>
  );
}
