"use client";

import {
  changeAgreedPrice,
  type PriceFormState,
} from "@/app/plattform/kunder/[companyId]/actions";
import ActionDialog from "@/components/ui/ActionDialog";
import { Badge, Field, Input } from "@/components/ui";

export interface AgreedPriceRow {
  /** "SCREEN", eller en modulnyckel. */
  item: string;
  name: string;
  /** Listpriset per månad, i kronor. Det som står hos Stripe. */
  listMonth: number;
  /** Avtalat månadspris i kronor, eller null när listpriset gäller. */
  agreed: number | null;
  /**
   * Rabatten i procent, eller null när det inte finns någon att visa.
   *
   * Räknas på SERVERN och skickas hit färdig. Funktionen bor i
   * company-prices.ts, som importerar Prisma — och den här filen är en
   * klientkomponent. Hade den importerat därifrån skulle databasklienten
   * följt med in i webbläsarens paket.
   */
  discountPercent: number | null;
}

/**
 * AVTALADE PRISER FÖR ETT FÖRETAG.
 *
 * Heter AgreedPriceForm och inte PriceForm: den senare finns redan och är
 * artikelnumren hos Stripe, under Artiklar. Två filer med samma namn i samma
 * mapp är inte ett problem bara för bygget — den som letar efter "prisrutan"
 * ett halvår senare hittar fel.
 *
 * Listpriset gäller alla; det här är vad vi kommit överens om med just den
 * här kunden. En pilotkund som får systemet gratis, en kund som förhandlat
 * ner skärmlicensen.
 *
 * Går bara att ändra för fakturakunder, av samma skäl som tillvalen: har
 * företaget en prenumeration hos Stripe är det kortet som dras, och ett annat
 * tal här hade bara visats på kundens sida utan att ändra vad som betalas.
 *
 * Kunden ser samma siffror på sin prenumerationssida, med listpriset
 * överstruket och rabatten i procent.
 */
export default function AgreedPriceForm({
  companyId,
  prices,
  managedByStripe,
}: {
  companyId: string;
  prices: AgreedPriceRow[];
  managedByStripe: boolean;
}) {
  return (
    <ul className="divide-y divide-neutral-100">
      {prices.map((row) => {
        const paying = row.agreed ?? row.listMonth;

        return (
          <li
            key={row.item}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-neutral-900">
                {row.name}
              </span>
              <span className="mt-0.5 block text-xs text-neutral-400">
                {row.item === "SCREEN" ? "Per licens och månad" : "Per månad"}
              </span>
            </span>

            <span className="flex items-baseline gap-2 text-[13px] tabular-nums">
              {row.agreed !== null && row.agreed !== row.listMonth && (
                <span className="text-neutral-400 line-through">
                  {row.listMonth} kr
                </span>
              )}
              <span className="font-medium text-neutral-900">{paying} kr</span>
            </span>

            {row.discountPercent !== null && (
              <Badge tone="active">{row.discountPercent} %</Badge>
            )}

            {!managedByStripe && (
              <ActionDialog<PriceFormState>
                trigger={row.agreed === null ? "Sätt pris" : "Ändra"}
                triggerTone="secondary"
                title={`Avtalat pris: ${row.name}`}
                description={`Listpriset är ${row.listMonth} kr per månad.`}
                action={changeAgreedPrice}
                initial={{}}
                submitLabel="Spara"
              >
                <input type="hidden" name="companyId" value={companyId} />
                <input type="hidden" name="item" value={row.item} />

                {/* Tomt fält tar bort överenskommelsen, noll betyder gratis.
                    Skillnaden måste stå i rutan: den som vill ge bort
                    systemet skriver 0, och den som ångrar sig tömmer fältet. */}
                <Field
                  label="Avtalat pris"
                  hint="Kronor per månad. 0 ger gratis, tomt ger listpriset"
                >
                  <Input
                    name="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    defaultValue={row.agreed === null ? "" : String(row.agreed)}
                    placeholder={String(row.listMonth)}
                  />
                </Field>

                <Field label="Anledning" hint="Sparas i åtgärdsloggen">
                  <Input
                    name="reason"
                    placeholder="Pilotkund, gratis enligt överenskommelse"
                    required
                  />
                </Field>
              </ActionDialog>
            )}
          </li>
        );
      })}
    </ul>
  );
}
