"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button, dialogBody, dialogEdge, dialogSurface } from ".";

/**
 * RUTA FÖR EN ÅTGÄRD SOM KAN SVARA MED ETT FEL.
 *
 * Systerkomponent till FormDialog, och skälet att den behövs är en rad:
 *
 *   onSubmit={() => dialog.current?.close()}
 *
 * FormDialog tar en vanlig serveråtgärd och stänger rutan i samma stund som
 * formuläret skickas. Det duger när åtgärden inte kan misslyckas på ett sätt
 * användaren kan rätta — men plattformspanelens åtgärder gör precis det:
 * "Ange en anledning till ändringen", "Antalet styrs av prenumerationen hos
 * Stripe". I FormDialog hade rutan redan varit stängd när det svaret kom, och
 * ändringen hade sett ut att gå igenom.
 *
 * Den här rutan äger därför sin egen useActionState, visar felet INUTI sig
 * och stänger först när åtgärden svarat att det gick.
 *
 * Utan komponenten blir följden den som panelen faktiskt hade: formulären
 * lämnas utfällda på sidan, eftersom det är enda sättet att få plats med ett
 * felmeddelande. Fem sådana ovanpå varandra är en vägg.
 */

/** Minsta gemensamma svar. Varje åtgärd får ha fler fält än så. */
export interface DialogState {
  error?: string;
  ok?: string;
}

export default function ActionDialog<S extends DialogState>({
  trigger,
  triggerTone = "secondary",
  title,
  description,
  action,
  initial,
  submitLabel,
  submitTone = "primary",
  pendingLabel = "Sparar…",
  disabled = false,
  onDone,
  children,
}: {
  trigger: ReactNode;
  triggerTone?: "primary" | "secondary" | "danger" | "ghost";
  title: string;
  description?: string;
  action: (previous: S, formData: FormData) => Promise<S>;
  /** Utgångsläget. Skickas in eftersom typen är åtgärdens, inte rutans. */
  initial: S;
  submitLabel: string;
  submitTone?: "primary" | "secondary" | "danger" | "ghost";
  pendingLabel?: string;
  /** Spärrar knappen inuti rutan. Förklaringen står då som children. */
  disabled?: boolean;
  /** Anropas med beskedet när rutan stängt, så sidan kan visa det. */
  onDone?: (ok: string) => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, submit] = useActionState<S, FormData>(action, initial);

  // Stänger när åtgärden svarat att det gick. Reffen hindrar att samma svar
  // stänger rutan en gång till om den öppnas direkt igen — useActionState
  // behåller sitt tillstånd tills nästa körning.
  const handled = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state.ok || state.ok === handled.current) return;

    handled.current = state.ok;
    dialog.current?.close();
    onDone?.(state.ok);
  }, [state.ok, onDone]);

  return (
    <>
      <Button
        type="button"
        tone={triggerTone}
        onClick={() => dialog.current?.showModal()}
      >
        {trigger}
      </Button>

      {/* Webbläsarens egen dialog. Den sköter bakgrundsdämpning,
          tangentbordsfokus, Escape och att resten av sidan inte går att nå
          medan rutan är öppen — allt sådant som blir många rader egen kod med
          subtila fel. Samma val som i FormDialog. */}
      <dialog
        ref={dialog}
        className={`w-[min(32rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
              {description}
            </p>
          )}
        </div>

        <form action={submit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${dialogBody} space-y-4 px-5 py-5`}>
            {/* Felet står överst i rutan, där blicken är efter ett tryck som
                inte gav något. */}
            {state.error && <Alert>{state.error}</Alert>}
            {children}
          </div>

          <div
            className={`${dialogEdge} flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
          >
            <Button
              type="button"
              tone="secondary"
              onClick={() => dialog.current?.close()}
            >
              Avbryt
            </Button>
            <Submit
              tone={submitTone}
              label={submitLabel}
              pendingLabel={pendingLabel}
              disabled={disabled}
            />
          </div>
        </form>
      </dialog>
    </>
  );
}

function Submit({
  tone,
  label,
  pendingLabel,
  disabled,
}: {
  tone: "primary" | "secondary" | "danger" | "ghost";
  label: string;
  pendingLabel: string;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone={tone} disabled={disabled || pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
