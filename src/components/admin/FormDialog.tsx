"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui";

/**
 * Knapp som öppnar en ruta med fält.
 *
 * Ersätter mönstret där varje rad var ett formulär med synliga fält. Det blev
 * en vägg av rutor där man inte såg vad som var registrerad data och vad som
 * var något man skulle fylla i — och i en lista med tjugo anställda var det
 * omöjligt att hitta det man kom för.
 *
 * Bygger på webbläsarens egen dialog. Den sköter bakgrundsdämpning,
 * tangentbordsfokus, Escape för att stänga och att resten av sidan inte går
 * att nå medan rutan är öppen. Allt det hade blivit många rader egen kod med
 * subtila fel.
 */
export default function FormDialog({
  trigger,
  triggerTone = "primary",
  title,
  description,
  action,
  submitLabel,
  submitTone = "primary",
  children,
}: {
  trigger: ReactNode;
  triggerTone?: "primary" | "secondary" | "danger" | "ghost";
  title: string;
  description?: string;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  submitTone?: "primary" | "secondary" | "danger" | "ghost";
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <Button
        type="button"
        tone={triggerTone}
        onClick={() => dialog.current?.showModal()}
      >
        {trigger}
      </Button>

      <dialog
        ref={dialog}
        className="w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
              {description}
            </p>
          )}
        </div>

        <form
          action={action}
          // Rutan stängs när formuläret skickas. Serveråtgärden laddar om
          // sidan med det nya innehållet, så den som väntar kvar i en öppen
          // ruta skulle bara se sina egna gamla värden.
          onSubmit={() => dialog.current?.close()}
        >
          <div className="space-y-4 px-5 py-5">{children}</div>

          <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            <Button
              type="button"
              tone="secondary"
              onClick={() => dialog.current?.close()}
            >
              Avbryt
            </Button>
            <Button type="submit" tone={submitTone}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
