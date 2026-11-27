"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/** "Bekräfta" med besked om att det pågår, som Skicka länken igen. */
export default function ConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Bekräftar…" : "Bekräfta"}
    </Button>
  );
}
