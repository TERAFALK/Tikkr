"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui";

/**
 * Knapp som frågar innan den skickar formuläret.
 *
 * Används för det som inte går att ångra. En rad i en tabell ligger nära nästa,
 * och raderad tid är fakturaunderlag som försvinner — en fråga är billigare än
 * en förlorad timme.
 */
export default function ConfirmButton({
  question,
  children,
  ...props
}: ComponentProps<typeof Button> & { question: string }) {
  return (
    <Button
      {...props}
      onClick={(event) => {
        if (!window.confirm(question)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
