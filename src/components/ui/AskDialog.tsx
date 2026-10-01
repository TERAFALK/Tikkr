"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button, dialogEdge, dialogSurface } from ".";

/**
 * EN FRÅGA SOM STÄLLS AV SIG SJÄLV.
 *
 * Till skillnad från FormDialog och ActionDialog öppnas den inte av en knapp
 * utan av att något hänt: en efterkalkyl har tagits ut, och nästa fråga är om
 * ordern ska avslutas.
 *
 * Därför `open` som prop i stället för en trigger. Komponenten äger bara
 * rutan; den som använder den äger frågan och vad svaret leder till.
 *
 * Ersatte en kryssruta. Skillnaden är att en kryssruta kräver att man bestämt
 * sig innan man tryckt, och att den som missade den aldrig får veta att valet
 * fanns.
 */
export default function AskDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Nej",
  confirmTone = "primary",
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  /** Frågans text. Hålls till en mening. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: "primary" | "secondary" | "danger";
  /** Spärrar knapparna medan svaret behandlas. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    // showModal kastar på en ruta som redan är öppen, och close på en stängd
    // gör ingenting. Läget kontrolleras därför innan.
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      // Escape stänger rutan utan att något händer. Det är rätt svar på en
      // fråga man inte vill besvara.
      onClose={onClose}
      className={`w-[min(32rem,calc(100vw-2rem))] ${dialogSurface}`}
    >
      <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      </div>

      {children && (
        <div className="px-5 py-5 text-[13px] leading-relaxed text-neutral-600">
          {children}
        </div>
      )}

      <div
        className={`${dialogEdge} flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
      >
        <Button type="button" tone="secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          tone={confirmTone}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
