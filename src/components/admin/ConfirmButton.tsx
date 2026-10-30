"use client";

import { useRef, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui";
import AskDialog from "@/components/ui/AskDialog";

/**
 * Knapp som frågar innan den skickar formuläret.
 *
 * Används för det som inte går att ångra. En rad i en tabell ligger nära nästa,
 * och raderad tid är fakturaunderlag som försvinner — en fråga är billigare än
 * en förlorad timme.
 *
 * FRÅGAN STÄLLS I TIKKRS EGEN RUTA (ändrat 2026-10-30). Webbläsarens gråa ruta
 * säger bara OK och Avbryt, och verbet på knappen är det som säger vad som
 * händer. Knappen i rutan bär därför samma ord som knappen på sidan.
 *
 * `question` är frågan och därefter konsekvensen: "Ta bort skärmen? Licensen
 * frigörs." Frågan blir rubrik och resten text under den.
 */
export default function ConfirmButton({
  question,
  children,
  ...props
}: ComponentProps<typeof Button> & { question: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);

  const end = question.indexOf("?");
  const title = end === -1 ? question : question.slice(0, end + 1);
  const detail = end === -1 ? "" : question.slice(end + 1).trim();

  return (
    <>
      <Button
        {...props}
        ref={button}
        onClick={(event) => {
          event.preventDefault();
          setAsking(true);
        }}
      >
        {children}
      </Button>

      {/* Ritas bara när frågan ställs. En lista med femtio rader ska inte bära
          femtio rutor. */}
      {asking && (
        <AskDialog
          open
          title={title}
          confirmLabel={typeof children === "string" ? children : "Bekräfta"}
          cancelLabel="Avbryt"
          confirmTone="danger"
          onConfirm={() => {
            setAsking(false);
            button.current?.form?.requestSubmit(button.current);
          }}
          onClose={() => setAsking(false)}
        >
          {detail}
        </AskDialog>
      )}
    </>
  );
}
