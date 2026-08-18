"use client";

import { useRef } from "react";
import { Button, Field, Input } from "@/components/ui";
import BudgetBar from "./BudgetBar";
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
}: {
  order: {
    id: string;
    orderNumber: string;
    customerName: string | null;
    status: string;
    entries: number;
    minutes: number;
    budgetMinutes: number | null;
  };
  updateAction: (formData: FormData) => void | Promise<void>;
  toggleAction: (formData: FormData) => void | Promise<void>;
}) {
  const menu = useRef<HTMLDialogElement>(null);
  const edit = useRef<HTMLDialogElement>(null);

  const isOpen = order.status === "OPEN";
  const exportBase = `/api/admin/export/orders?order=${order.id}`;

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
        className="w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="border-b border-neutral-200 px-5 py-4">
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
            </div>
          )}
        </div>

        <div className="p-2">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Underlag
          </p>

          <MenuLink
            href={`${exportBase}&format=pdf`}
            icon={<IconOrder />}
            title="Ladda ner PDF"
            description="Färdigt dokument att bifoga en faktura"
            onPick={() => menu.current?.close()}
          />
          <MenuLink
            href={`${exportBase}&format=excel`}
            icon={<IconReport />}
            title="Ladda ner Excel"
            description="Samma innehåll, att räkna vidare på"
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

          <form action={toggleAction} onSubmit={() => menu.current?.close()}>
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

        <div className="flex justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-3">
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
        className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            Ändra order {order.orderNumber}
          </h2>
        </div>

        <form action={updateAction} onSubmit={() => edit.current?.close()}>
          <div className="space-y-4 px-5 py-5">
            <input type="hidden" name="id" value={order.id} />
            <Field label="Ordernummer">
              <Input
                name="orderNumber"
                defaultValue={order.orderNumber}
                required
              />
            </Field>
            <Field label="Kund">
              <Input
                name="customerName"
                defaultValue={order.customerName ?? ""}
                placeholder="Valfritt"
              />
            </Field>
            <Field
              label="Beräknad tid"
              hint="Timmar. Lämna tomt för ingen beräkning."
            >
              <Input
                name="budgetHours"
                inputMode="decimal"
                defaultValue={
                  order.budgetMinutes
                    ? String(order.budgetMinutes / 60).replace(".", ",")
                    : ""
                }
                placeholder="40"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            <Button
              type="button"
              tone="secondary"
              onClick={() => edit.current?.close()}
            >
              Avbryt
            </Button>
            <Button type="submit">Spara</Button>
          </div>
        </form>
      </dialog>
    </>
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
