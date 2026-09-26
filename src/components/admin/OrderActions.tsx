"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type {
  OrderFormState,
  OrderToggleState,
} from "@/app/admin/(panel)/ordrar/actions";
import {
  Alert,
  Button,
  dialogBody,
  dialogEdge,
  dialogSurface,
} from "@/components/ui";
import { formatDuration, minutesBetween } from "@/lib/format";
import BudgetBar from "./BudgetBar";
import type { BudgetMomentOption } from "./BudgetMoments";
import OrderFields from "./OrderFields";
import type { OrderBudgetRow } from "./OrdersTable";
import type { SearchSelectOption } from "./SearchSelect";
import { IconOrder, IconReport } from "@/components/ui/icons";

/**
 * Menyn som öppnas när man klickar på en order.
 *
 * Alternativet vore fyra knappar per rad, vilket i en lista med femtio ordrar
 * blir tvåhundra knappar. Här ligger de bakom ordernumret, som är det man
 * ändå tittar på när man letar.
 */
export default function OrderActions({
  order,
  updateAction,
  toggleAction,
  customers,
  moments,
}: {
  /** Kunderna som går att välja. Skickas ner så att väljaren kan söka lokalt. */
  customers: SearchSelectOption[];
  /** Arbetsmomenten som går att beräkna tid på. */
  moments: BudgetMomentOption[];
  order: {
    id: string;
    orderNumber: string;
    customerId: string | null;
    customerName: string | null;
    status: string;
    entries: number;
    minutes: number;
    budgetMinutes: number | null;
    budgets: OrderBudgetRow[];
    markupPercent: number | null;
    fixedPriceOre: number | null;
  };
  updateAction: (
    state: OrderFormState,
    formData: FormData
  ) => Promise<OrderFormState>;
  toggleAction: (
    state: OrderToggleState,
    formData: FormData
  ) => Promise<OrderToggleState>;
}) {
  // Kryssrutan för belopp på kundens underlag. Nollställs inte mellan
  // öppningar med flit: den som tar ut tre ordrar i rad vill oftast ha samma
  // sorts underlag på alla tre.
  const [withPrice, setWithPrice] = useState(false);
  const priceParam = withPrice ? "&belopp=1" : "";

  const menu = useRef<HTMLDialogElement>(null);
  const edit = useRef<HTMLDialogElement>(null);
  // Inte "confirm": det namnet är webbläsarens egen dialogfunktion, och att
  // skugga den i en fil full av rutor är att be om förvirring.
  const closeConfirm = useRef<HTMLDialogElement>(null);

  const isOpen = order.status === "OPEN";
  const exportBase = `/api/admin/export/orders?order=${order.id}`;

  const [toggleState, submitToggle] = useActionState<OrderToggleState, FormData>(
    toggleAction,
    {}
  );

  const [editState, submitEdit] = useActionState<OrderFormState, FormData>(
    updateAction,
    {}
  );

  // Rutan stängs bara när sparandet gick igenom. Ett avvisat påslag ska stå
  // kvar med sitt felmeddelande, inte försvinna och lämna kvar det gamla.
  useEffect(() => {
    if (editState.savedAt) edit.current?.close();
  }, [editState.savedAt]);

  const blockers = toggleState.blockers ?? [];

  // Kom det tillbaka instämplade har ingenting ändrats — då är det en fråga,
  // och frågan ska synas. Gick stängningen igenom stängs rutan igen.
  useEffect(() => {
    // showModal kastar på en ruta som redan är öppen. Kan inte inträffa i
    // dagens flöde, men en oväntad omrendering ska inte kunna fälla sidan.
    if (blockers.length > 0 && !closeConfirm.current?.open) {
      closeConfirm.current?.showModal();
    }
  }, [toggleState, blockers.length]);

  useEffect(() => {
    if (toggleState.savedAt) closeConfirm.current?.close();
  }, [toggleState.savedAt]);

  return (
    <>
      <button
        type="button"
        onClick={() => menu.current?.showModal()}
        className="rounded font-medium text-neutral-900 underline-offset-4 hover:underline"
      >
        {order.orderNumber}
      </button>

      {/* Meny */}
      <dialog
        ref={menu}
        className={`w-[min(26rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">
            Order {order.orderNumber}
          </h2>
          <p className="mt-0.5 text-[13px] text-neutral-500">
            {order.customerName ?? "Ingen kund angiven"} · {order.entries}{" "}
            {order.entries === 1 ? "stämpling" : "stämplingar"}
          </p>

          {order.budgetMinutes && (
            <div className="mt-3">
              <BudgetBar
                budgetMinutes={order.budgetMinutes}
                usedMinutes={order.minutes}
              />

              {/* Uppdelningen under totalen, inte istället för den. Totalen
                  svarar på om ordern håller; raderna på vilket moment som
                  drar över — och det är den frågan nästa beräkning behöver
                  svar på. */}
              <ul className="mt-3 space-y-1.5">
                {order.budgets.map((budget) => (
                  <li
                    key={budget.momentId}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="truncate text-[13px] text-neutral-600">
                      {budget.momentName}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                      {formatDuration(budget.usedMinutes)} av{" "}
                      {formatDuration(budget.minutes)}
                      {budget.usedMinutes > budget.minutes && (
                        <span className="ml-1.5 font-medium text-amber-700">
                          {formatDuration(budget.usedMinutes - budget.minutes)}{" "}
                          över
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={`${dialogBody} p-2`}>
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Underlag
          </p>

          {/* Kryssrutan styr BARA det här uttaget. Belopp på kundens underlag
              är ett val man gör per gång, inte ett läge man ställer in på en kund
              och sedan glömmer. Självkostnad och marginal kommer aldrig med —
              det är en annan sorts dokument, längre ner i menyn. */}
          <label className="flex cursor-pointer items-start gap-2 rounded-md px-3 py-2 text-[13px] hover:bg-neutral-50">
            <input
              type="checkbox"
              checked={withPrice}
              onChange={(event) => setWithPrice(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
            />
            <span>
              <span className="block font-medium text-neutral-900">
                Visa belopp och rabatt
              </span>
              <span className="block text-neutral-500">
                Utan kryss visas bara tid
              </span>
            </span>
          </label>

          <MenuLink
            href={`${exportBase}&format=pdf${priceParam}`}
            icon={<IconOrder />}
            title="Ladda ner PDF"
            description="Bilaga till faktura"
            onPick={() => menu.current?.close()}
          />
          <MenuLink
            href={`${exportBase}&format=excel${priceParam}`}
            icon={<IconReport />}
            title="Ladda ner Excel"
            description="Samma innehåll som PDF"
            onPick={() => menu.current?.close()}
          />

          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Internt
          </p>

          {/* Egen rubrik och egen knapp, inte ett kryss i rutan ovanför.
              Kalkylen innehåller självkostnad och marginal och får aldrig
              förväxlas med underlaget som skickas till kunden. */}
          <MenuLink
            href={`${exportBase}&format=kalkyl`}
            icon={<IconOrder />}
            title="Efterkalkyl som PDF"
            description="Kostnad och marginal. Internt"
            onPick={() => menu.current?.close()}
          />
          <MenuLink
            href={`${exportBase}&format=kalkyl-excel`}
            icon={<IconReport />}
            title="Efterkalkyl som Excel"
            description="Kostnad och marginal. Internt"
            onPick={() => menu.current?.close()}
          />

          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Ordern
          </p>

          <button
            type="button"
            onClick={() => {
              menu.current?.close();
              edit.current?.showModal();
            }}
            className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-neutral-50"
          >
            <span className="mt-0.5 text-neutral-400">
              <IconOrder />
            </span>
            <span>
              <span className="block text-[13px] font-medium text-neutral-900">
                Ändra uppgifter
              </span>
              <span className="block text-xs text-neutral-500">
                Ordernummer och kund
              </span>
            </span>
          </button>

          <form action={submitToggle} onSubmit={() => menu.current?.close()}>
            <input type="hidden" name="id" value={order.id} />
            <input type="hidden" name="status" value={order.status} />
            <button
              type="submit"
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-neutral-50"
            >
              <span className="mt-0.5 text-neutral-400">
                <IconOrder />
              </span>
              <span>
                <span className="block text-[13px] font-medium text-neutral-900">
                  {isOpen ? "Stäng ordern" : "Öppna ordern igen"}
                </span>
                <span className="block text-xs text-neutral-500">
                  {isOpen
                    ? "Döljs på stämplingsskärmen, tiden finns kvar"
                    : "Går att stämpla på igen"}
                </span>
              </span>
            </button>
          </form>
        </div>

        <div
          className={`${dialogEdge} flex justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
        >
          <Button
            type="button"
            tone="secondary"
            onClick={() => menu.current?.close()}
          >
            Stäng
          </Button>
        </div>
      </dialog>

      {/* Ändra uppgifter */}
      <dialog
        ref={edit}
        className={`w-[min(28rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">
            Ändra order {order.orderNumber}
          </h2>
        </div>

        <form action={submitEdit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${dialogBody} space-y-4 px-5 py-5`}>
            {editState.error && <Alert>{editState.error}</Alert>}
            <input type="hidden" name="id" value={order.id} />
            <OrderFields
              customers={customers}
              moments={moments}
              defaults={{
                orderNumber: order.orderNumber,
                customerId: order.customerId,
                budgets: order.budgets.map((budget) => ({
                  momentId: budget.momentId,
                  minutes: budget.minutes,
                })),
                markupPercent: order.markupPercent,
                fixedPriceOre: order.fixedPriceOre,
              }}
            />
          </div>

          <div
            className={`${dialogEdge} flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
          >
            <Button
              type="button"
              tone="secondary"
              onClick={() => edit.current?.close()}
            >
              Avbryt
            </Button>
            <SaveOrderButton />
          </div>
        </form>
      </dialog>

      {/* Avsluta en order som någon står instämplad på.
          Rutan öppnas först efter att servern svarat, eftersom det är servern
          som vet vem som är inne — en lista som skärmen gissat sig till hade
          kunnat vara några minuter gammal, och det är just precision som
          behövs för att våga trycka på knappen. */}
      <dialog
        ref={closeConfirm}
        className={`w-[min(28rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">
            Avsluta order {order.orderNumber}?
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
            {/* Stämplingar och inte personer: samma person kan vara inne på
                två arbetsmoment på samma order sedan två maskiner tilläts. */}
            {blockers.length === 1
              ? "En stämpling pågår på ordern just nu."
              : `${blockers.length} stämplingar pågår på ordern just nu.`}{" "}
            Avslutar du den stämplas de ut, och tiden flaggas för granskning så
            att du kan rätta den innan fakturering.
          </p>
        </div>

        <ul className={`${dialogBody} divide-y divide-neutral-100 px-5 py-2`}>
          {blockers.map((blocker) => (
            <li
              key={`${blocker.employeeName}-${blocker.momentName}-${blocker.since}`}
              className="flex items-baseline justify-between gap-3 py-2"
            >
              <span className="text-[13px] font-medium text-neutral-900">
                {blocker.employeeName}
                {blocker.momentName && (
                  <span className="font-normal text-neutral-500">
                    {" · "}
                    {blocker.momentName}
                  </span>
                )}
              </span>
              <span className="text-xs text-neutral-500">
                {/* Förfluten tid i stället för klockslag: skärmen känner inte
                    till företagets tidszon, och en varaktighet går inte att
                    läsa fel oavsett var servern står. */}
                pågått{" "}
                {formatDuration(minutesBetween(new Date(blocker.since), null))}
              </span>
            </li>
          ))}
        </ul>

        {toggleState.error && (
          <div className="px-5 pb-2">
            <Alert>{toggleState.error}</Alert>
          </div>
        )}

        <div
          className={`${dialogEdge} flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
        >
          <Button
            type="button"
            tone="secondary"
            onClick={() => closeConfirm.current?.close()}
          >
            Avbryt
          </Button>
          <form action={submitToggle}>
            <input type="hidden" name="id" value={order.id} />
            <input type="hidden" name="status" value="OPEN" />
            <input type="hidden" name="force" value="1" />
            <ConfirmCloseButton />
          </form>
        </div>
      </dialog>
    </>
  );
}

function SaveOrderButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : "Spara"}
    </Button>
  );
}

function ConfirmCloseButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Avslutar…" : "Stämpla ut alla och avsluta"}
    </Button>
  );
}

function MenuLink({
  href,
  icon,
  title,
  description,
  onPick,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onPick: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onPick}
      className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-neutral-50"
    >
      <span className="mt-0.5 text-neutral-400">{icon}</span>
      <span>
        <span className="block text-[13px] font-medium text-neutral-900">
          {title}
        </span>
        <span className="block text-xs text-neutral-500">{description}</span>
      </span>
    </a>
  );
}
