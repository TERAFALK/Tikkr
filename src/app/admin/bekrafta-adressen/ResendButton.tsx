"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/**
 * "Skicka igen" med besked om att det pågår.
 *
 * Ett utskick tar en stund, och utan besked ser knappen ut att inte göra
 * något. Då trycker man igen, och det andra trycket möts av spärren mot att
 * skicka för tätt — alltså ett besked om att vänta, på ett mejl som redan är
 * på väg.
 */
export default function ResendButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending} className="w-full">
      {pending ? "Skickar…" : "Skicka länken igen"}
    </Button>
  );
}
