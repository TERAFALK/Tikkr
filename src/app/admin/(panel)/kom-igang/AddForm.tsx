"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

/**
 * Formulären i Kom igång, med Lägg till sist (ändrat 2026-11-27).
 *
 * Knappen stod ibland kvar på Sparar… fast det var sparat, och släppte först
 * när man klickade någon annanstans på sidan. Med `<form action>` hänger
 * knappens läge på att Next ritar om sidan med svaret, och den omritningen
 * blev ibland liggande. Nu anropas åtgärden direkt: knappen släpper när
 * servern svarat, och det beskedet är en vanlig uppdatering som också drar
 * igång omritningen.
 */
export default function AddForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      ref={form}
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || !form.current) return;
        setPending(true);
        try {
          await action(new FormData(form.current));
          form.current?.reset();
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
      <Button type="submit" disabled={pending}>
        {pending ? "Sparar…" : "Lägg till"}
      </Button>
    </form>
  );
}
