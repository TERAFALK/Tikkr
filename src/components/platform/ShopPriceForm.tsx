"use client";

import { saveShopPrice } from "@/app/plattform/(panel)/artiklar/actions";
import SaveForm from "@/components/admin/SaveForm";
import { Field, Input } from "@/components/ui";

/**
 * Priset på ett tillbehör, i kronor exklusive moms.
 *
 * Katalogens pris visas som platshållare när ingen rad finns, av samma skäl
 * som artikelnumrens miljövariabler: ett tomt fält ska inte se ut som att
 * produkten saknar pris.
 */
export default function ShopPriceForm({
  productKey,
  priceKr,
  fallbackKr,
  updatedByEmail,
}: {
  productKey: string;
  /** Satt pris i kronor, eller null när katalogens gäller. */
  priceKr: string | null;
  fallbackKr: string;
  updatedByEmail: string | null;
}) {
  return (
    <SaveForm action={saveShopPrice} className="space-y-4">
      <input type="hidden" name="productKey" value={productKey} />

      <div className="max-w-xs">
        <Field
          label="Pris, kr exkl. moms"
          hint={priceKr ? undefined : `Katalogens pris gäller: ${fallbackKr} kr`}
        >
          <Input
            name="price"
            inputMode="decimal"
            defaultValue={priceKr ?? ""}
            placeholder={fallbackKr}
            required
          />
        </Field>
      </div>

      {updatedByEmail && (
        <p className="text-xs text-neutral-400">Senast ändrat av {updatedByEmail}</p>
      )}
    </SaveForm>
  );
}
