"use client";

import { useState } from "react";
import { Select } from "@/components/ui";
import { IconClose, IconPlus } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format";
import {
  BUDGET_HOURS_FIELD,
  BUDGET_MOMENT_FIELD,
  parseHours,
} from "@/lib/order-budget";

/**
 * BERÄKNAD TID, EN RAD PER ARBETSMOMENT.
 *
 * Var ett enda timfält på ordern fram till 2026-09-26. Den siffran var en
 * gissning på hela jobbet och gick därför inte att följa upp: en order som
 * spruckit sa ingenting om vilket moment som drog över, och nästa beräkning
 * blev lika grov som den förra.
 *
 * Nu läggs raderna till en i taget med plusknappen — moment och tid — och
 * totalen räknas fram medan man skriver. Det är totalen som visas i
 * orderlistan, precis som förut.
 *
 * RADERNAS ORDNING ÄR EN UPPGIFT när planeringen är påslagen: den säger i
 * vilken följd momenten ska göras, och tavlan ritar pilar efter den. Pilarna
 * som flyttar en rad visas därför bara då, se `ordered`.
 *
 * Skriver vanliga formulärfält med samma namn på varje rad. Serveråtgärden
 * läser dem med getAll() i samma ordning som de står här, så ingen av rutorna
 * behöver veta hur den här listan fungerar. Ordningen behöver alltså inget
 * eget fält — den ÄR fältens ordning. Se src/lib/order-budget.ts, som
 * också äger tolkningen av timfältet — samma funktion i webbläsaren som på
 * servern, annars visar totalen en sak och sparar en annan.
 */

export interface BudgetMomentOption {
  id: string;
  name: string;
  /** Avslutade moment går inte att välja nytt, men syns på gamla rader. */
  active: boolean;
}

export interface BudgetMomentRow {
  momentId: string;
  minutes: number;
}

interface DraftRow {
  /** Stabil nyckel för React. Radens moment kan ändras, nyckeln inte. */
  key: number;
  momentId: string;
  /** Som det står i fältet, alltså timmar med komma eller punkt. */
  hours: string;
}

export default function BudgetMoments({
  moments,
  defaultRows = [],
  ordered = false,
}: {
  moments: BudgetMomentOption[];
  defaultRows?: BudgetMomentRow[];
  /**
   * Visar pilarna som flyttar en rad, och numret framför den.
   *
   * Hör till tillvalet Planering: utan tavlan finns ingenting som läser
   * ordningen, och två pilar per rad vore då bara brus i en ruta som redan är
   * full. Sidan avgör genom `hasModule`.
   *
   * ORDNINGEN SPARAS ÄNDÅ, för varje kund. Den kommer ur radernas ordning i
   * formuläret, och den finns oavsett om någon kan ändra den eller inte. Den
   * som köper planeringen ett halvår senare har alltså en ordning redan, i
   * stället för en tom uppgift att fylla i på varje order.
   */
  ordered?: boolean;
}) {
  const [rows, setRows] = useState<DraftRow[]>(() =>
    defaultRows.map((row, index) => ({
      key: index,
      momentId: row.momentId,
      // Tim:min, som tiden visas överallt annars. Fältet tar emot "8" lika
      // gärna, se parseHours.
      hours: formatDuration(row.minutes),
    }))
  );

  // Räknas upp för varje ny rad. Att använda rows.length hade gett samma
  // nyckel igen så fort en rad tagits bort och en ny lagts till.
  const [nextKey, setNextKey] = useState(defaultRows.length);

  const chosen = new Set(rows.map((row) => row.momentId));

  /** Momenten som ännu inte står på en rad. Aktiva först. */
  const available = moments.filter(
    (moment) => moment.active && !chosen.has(moment.id)
  );

  function add() {
    const moment = available[0];
    if (!moment) return;

    setRows((current) => [
      ...current,
      { key: nextKey, momentId: moment.id, hours: "" },
    ]);
    setNextKey((key) => key + 1);
  }

  function update(key: number, patch: Partial<DraftRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  function remove(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  /**
   * Flyttar en rad ett steg.
   *
   * Byter plats på två rader i listan, och det är hela lagringen: fälten
   * skickas i den ordning de står, och servern numrerar om dem. Inget dolt
   * fält, ingen andra sanning.
   */
  function move(key: number, direction: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key);
      const target = index + direction;

      if (index < 0 || target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const total = rows.reduce(
    (sum, row) => sum + (parseHours(row.hours) ?? 0),
    0
  );

  // Ingenting att välja OCH ingenting valt. Då är en plusknapp som inte går
  // att trycka på bara en gåta — säg istället vad som saknas.
  if (available.length === 0 && rows.length === 0) {
    return (
      <p className="text-[13px] text-neutral-500">
        {moments.length === 0
          ? "Inga arbetsmoment upplagda."
          : "Alla arbetsmoment är avaktiverade."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        // Radens eget moment måste finnas kvar i listan, annars skulle
        // webbläsaren visa ett annat namn än det som sparats.
        const options = moments.filter(
          (moment) =>
            moment.id === row.momentId ||
            (moment.active && !chosen.has(moment.id))
        );

        return (
          <div key={row.key} className="flex items-center gap-2">
            {ordered && (
              <>
                {/* Numret står framför raden. Utan det är två pilar bara två
                    pilar; med det syns att raderna har en följd. */}
                <span className="w-5 shrink-0 text-right text-[13px] tabular-nums text-neutral-400">
                  {index + 1}
                </span>

                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => move(row.key, -1)}
                    disabled={index === 0}
                    aria-label="Flytta upp"
                    className="px-1 text-[10px] leading-none text-neutral-400 hover:text-neutral-900 disabled:text-neutral-200"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(row.key, 1)}
                    disabled={index === rows.length - 1}
                    aria-label="Flytta ner"
                    className="px-1 text-[10px] leading-none text-neutral-400 hover:text-neutral-900 disabled:text-neutral-200"
                  >
                    ▼
                  </button>
                </div>
              </>
            )}

            <Select
              name={BUDGET_MOMENT_FIELD}
              value={row.momentId}
              onChange={(event) =>
                update(row.key, { momentId: event.target.value })
              }
              aria-label="Arbetsmoment"
              className="min-w-0 flex-1"
            >
              {options.map((moment) => (
                <option key={moment.id} value={moment.id}>
                  {moment.name}
                  {!moment.active && " (avslutat)"}
                </option>
              ))}
            </Select>

            {/* Fältet tar både "7:30" och "7,5". Tim:min står förifyllt,
                eftersom det är formatet den beräknade tiden visas i på
                orderlistan och i underlaget. */}
            <div className="relative w-24 shrink-0">
              <input
                name={BUDGET_HOURS_FIELD}
                value={row.hours}
                onChange={(event) =>
                  update(row.key, { hours: event.target.value })
                }
                inputMode="text"
                placeholder="8:00"
                aria-label="Beräknad tid"
                // HÅLLER LÖSENORDSHANTERARE BORTA FRÅN FÄLTET.
                //
                // Ett kort numeriskt fält i ett formulär med belopp i tolkas
                // av tilläggen som ett kortnummer, och då lägger de sin ikon
                // och sin lista över rutan, fyller i fel och flyttar
                // skrollningen. Fältet är timmar på ett arbetsmoment och har
                // ingenting med betalning att göra.
                //
                // Attributen är olika per tillägg och ignoreras av dem som
                // inte känner igen dem — därför står de allihop. Kvarstår
                // problemet får tillägget stängas av för sidan; ett
                // webbsideskript kan inte tvinga ett tillägg att avstå.
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                data-np-ignore
                data-form-type="other"
                className="block w-full rounded-md border-0 bg-white py-1.5 pl-2.5 pr-8 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-400 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-neutral-400">
                tim
              </span>
            </div>

            <button
              type="button"
              onClick={() => remove(row.key)}
              aria-label="Ta bort raden"
              className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <IconClose />
            </button>
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-3 pt-0.5">
        <button
          type="button"
          onClick={add}
          disabled={available.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-tick-deep hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-transparent"
        >
          <IconPlus />
          Lägg till arbetsmoment
        </button>

        {/* Totalen står bara när det finns något att summera. En nolla under
            en tom lista ser ut som ett svar, och det är det inte. */}
        {total > 0 && (
          <span className="text-[13px] tabular-nums text-neutral-500">
            Totalt{" "}
            <span className="font-medium text-neutral-900">
              {formatDuration(total)}
            </span>
          </span>
        )}
      </div>


    </div>
  );
}
