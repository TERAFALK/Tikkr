"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button } from "@/components/ui";
import type { SaveState } from "@/lib/save-state";

/**
 * ETT FORMULÄR SOM SÄGER ATT DET SPARADE.
 *
 * Utan besked ser en lyckad sparning likadan ut som en misslyckad: sidan
 * står kvar som den var. Den som är osäker trycker en gång till, eller låter
 * bli att lita på att det gick fram — och en inställning man inte litar på
 * kontrolleras i efterhand mot verkligheten, vilket är dyrare än en rad text.
 *
 * Beskedet står bredvid knappen och inte överst på sidan, eftersom det är vid
 * knappen blicken är när man precis tryckt.
 *
 * Används för de åtgärder där resultatet INTE syns av sig självt. Försvinner
 * en rad ur en tabell eller byter en knapp text har sidan redan svarat, och en
 * rad till är brus.
 */
export default function SaveForm({
  action,
  children,
  submitLabel = "Spara",
  savedLabel = "Sparat",
  pendingLabel = "Sparar…",
  tone = "primary",
  className = "max-w-md space-y-4 p-5",
}: {
  action: (state: SaveState, formData: FormData) => Promise<SaveState>;
  children: ReactNode;
  submitLabel?: string;
  savedLabel?: string;
  pendingLabel?: string;
  tone?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const [state, submit] = useActionState<SaveState, FormData>(action, {});

  return (
    <form action={submit} className={className}>
      {state.error && <Alert>{state.error}</Alert>}

      {children}

      <div className="flex items-center gap-3">
        <SubmitButton
          tone={tone}
          label={submitLabel}
          pendingLabel={pendingLabel}
        />

        {state.savedAt && <SavedNote>{state.ok ?? savedLabel}</SavedNote>}
      </div>
    </form>
  );
}

function SubmitButton({
  tone,
  label,
  pendingLabel,
}: {
  tone: "primary" | "secondary" | "danger";
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone={tone} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Beskedet att det gick fram.
 *
 * Döljer sig medan formuläret skickas, och det är hela poängen: sparar man en
 * gång till står annars samma text kvar oförändrad, och det går inte att se
 * att andra tryckningen tog. Måste ligga inuti sitt `<form>`, eftersom
 * `useFormStatus` läser det närmaste.
 */
export function SavedNote({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  if (pending) return null;

  return (
    // aria-live läser upp beskedet för den som inte ser skärmen. En grön text
    // som ingen ser är ingen bekräftelse.
    <span
      aria-live="polite"
      className="text-[13px] font-medium text-emerald-700"
    >
      {children}
    </span>
  );
}
