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
  Card,
  PageHeader,
  dialogBody,
  dialogEdge,
  dialogSurface,
} from "@/components/ui";
import { formatDuration, minutesBetween } from "@/lib/format";
import type { BudgetMomentOption } from "./BudgetMoments";
import { ExportGroup, ExportLink } from "./ExportButtons";
import OrderFields from "./OrderFields";
import PrintButton from "./PrintButton";
import AskDialog from "@/components/ui/AskDialog";
import { useFieldError, useKeptSubmit } from "@/components/ui/useFieldError";
import UnsavedGuard from "@/components/ui/UnsavedGuard";
import type { OrderBudgetRow } from "@/lib/orders";
import type { SearchSelectOption } from "./SearchSelect";

/**
 * RUBRIKEN OCH ÅTGÄRDERNA PÅ ORDERNS EGEN SIDA.
 *
 * Var en meny som öppnades av ordernumret i listan (ändrat 2026-10-30). Nu
 * öppnas ordern som en kund, och samma val står på sidan: efterkalkyl och
 * underlag med samma knappar som markeringsläget, Ändra och Stäng ordern.
 *
 * Rubriken ligger här och inte på sidan eftersom knapparna i den och knapparna
 * i dokumentkortet delar tillstånd: en uttagen efterkalkyl frågar om ordern
 * ska avslutas, och svaret går samma väg som Stäng ordern.
 */
export default function OrderActions({
  order,
  updateAction,
  toggleAction,
  customers,
  moments,
  planning = false,
}: {
  /** Kunderna som går att välja. Skickas ner så att väljaren kan söka lokalt. */
  customers: SearchSelectOption[];
  /** Visar leveransdatumet i ändra-rutan. Sätts när Planering är på. */
  planning?: boolean;
  /** Arbetsmomenten som går att beräkna tid på. */
  moments: BudgetMomentOption[];
  order: {
    id: string;
    orderNumber: string;
    customerId: string | null;
    customerName: string | null;
    status: string;
    budgets: OrderBudgetRow[];
    markupPercent: number | null;
    fixedPriceOre: number | null;
    plannedDueDate: Date | null;
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
  // Kryssrutan för belopp på kundens underlag. Belopp är ett val vid uttaget,
  // inte ett läge på kunden. Självkostnad och marginal kommer aldrig med.
  const [withPrice, setWithPrice] = useState(false);
  const priceParam = withPrice ? "&belopp=1" : "";

  // FRÅGAN OM ATT AVSLUTA ORDERN (ändrat 2026-10-01).
  //
  // Var en kryssruta i menyn. En kryssruta kräver att man bestämt sig innan
  // man tryckt, och den som missade den fick aldrig veta att valet fanns.
  // Nu ställs frågan när kalkylen är uttagen, vilket också är när man vet
  // svaret.
  const [asking, setAsking] = useState(false);

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

  const editForm = useRef<HTMLFormElement>(null);
  const editErrorId = useFieldError(editForm, editState);
  const { pending: saving, onSubmit: saveEdit } = useKeptSubmit(submitEdit);

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

  /** Frågar om ordern ska avslutas. En redan stängd order frågar inget. */
  function askToClose() {
    if (isOpen) setAsking(true);
  }

  /**
   * Avslutar ordern.
   *
   * Går genom samma åtgärd som knappen i rubriken, och därmed genom samma
   * mellansteg: står någon instämplad ändras ingenting, utan rutan med de
   * instämplade öppnas.
   */
  function closeOrder() {
    setAsking(false);

    const data = new FormData();
    data.set("id", order.id);
    data.set("status", order.status);
    submitToggle(data);
  }

  return (
    <>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`${order.customerName ?? "Ingen kund angiven"} · ${
          isOpen ? "Öppen" : "Stängd"
        }`}
        help="ordrar"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              tone="secondary"
              onClick={() => edit.current?.showModal()}
            >
              Ändra
            </Button>
            <form action={submitToggle}>
              <input type="hidden" name="id" value={order.id} />
              <input type="hidden" name="status" value={order.status} />
              <ToggleOrderButton isOpen={isOpen} />
            </form>
          </div>
        }
      />

      {/* Felet står här och inte bara i rutan med de instämplade, som inte
          öppnas när det inte finns några. */}
      {toggleState.error && blockers.length === 0 && (
        <div className="mb-4">
          <Alert>{toggleState.error}</Alert>
        </div>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-4">
          {/* Efterkalkylen är INTERN och underlaget är kundens. Därför
              skiljelinjen, som i orderlistans markeringsläge. */}
          <ExportGroup label="Efterkalkyl">
            <PrintButton
              href={`${exportBase}&format=kalkyl`}
              label="Skriv ut"
              onPrint={askToClose}
            />
            <ExportLink href={`${exportBase}&format=kalkyl`} onPick={askToClose}>
              Ladda ner
            </ExportLink>
          </ExportGroup>

          <span aria-hidden="true" className="h-8 w-px bg-neutral-200" />

          <ExportGroup label="Underlag">
            <PrintButton href={`${exportBase}&format=pdf${priceParam}`} label="Skriv ut" />
            <ExportLink href={`${exportBase}&format=pdf${priceParam}`} primary>
              Ladda ner
            </ExportLink>
          </ExportGroup>

          <label className="flex cursor-pointer items-start gap-2 pb-1 text-[13px]">
            <input
              type="checkbox"
              checked={withPrice}
              onChange={(event) => setWithPrice(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
            />
            <span className="font-medium text-neutral-900">
              Visa belopp och rabatt
            </span>
          </label>
        </div>
      </Card>

      {/* Frågan som ersatte kryssrutan. Ställs först när kalkylen är
          uttagen, eftersom det är då man vet om jobbet är färdigt. */}
      <AskDialog
        open={asking}
        title={`Avsluta order ${order.orderNumber}?`}
        confirmLabel="Ja, avsluta ordern"
        onConfirm={closeOrder}
        onClose={() => setAsking(false)}
      >
        Ordern döljs på stämplingsskärmen. Den registrerade tiden finns kvar,
        och ordern går att öppna igen.
      </AskDialog>

      {/* Ändra uppgifter */}
      <dialog
        ref={edit}
        onClose={() => editForm.current?.reset()}
        className={`w-[min(40rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">
            Ändra order {order.orderNumber}
          </h2>
        </div>

        <form ref={editForm} onSubmit={saveEdit} className="flex min-h-0 flex-1 flex-col">
          <UnsavedGuard form={editForm} dialog={edit} saved={editState.savedAt} />
          <div className={`${dialogBody} space-y-4 px-5 py-5`}>
            {editState.error && <Alert id={editErrorId}>{editState.error}</Alert>}
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
                plannedDueDate: toDateField(order.plannedDueDate),
              }}
              planning={planning}
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
            <SaveOrderButton pending={saving} />
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
        className={`w-[min(40rem,calc(100vw-2rem))] ${dialogSurface}`}
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

function ToggleOrderButton({ isOpen }: { isOpen: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {isOpen ? "Stäng ordern" : "Öppna ordern igen"}
    </Button>
  );
}

function SaveOrderButton({ pending }: { pending: boolean }) {
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

/**
 * Datumet som ett datumfält vill ha det: "2026-10-08".
 *
 * Läses i UTC och inte i företagets tidszon. Datumet SKREVS vid middagstid
 * UTC just för att det ska peka ut samma dag överallt — se
 * readPlannedDueDate i ordrar/actions.ts — och att tolka det i en lokal
 * tidszon här vore att flytta tillbaka det.
 */
function toDateField(value: Date | null): string | null {
  if (!value) return null;

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(
    value.getUTCDate()
  )}`;
}
