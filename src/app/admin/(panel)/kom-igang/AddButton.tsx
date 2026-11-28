"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/**
 * Lägg till, med besked medan det sparas (tillagt 2026-11-27).
 *
 * Knappen gav inget besked förrän sidan hämtats om, och det tar en stund
 * eftersom guiden räknar om alla steg. Kunden tryckte en gång till i tron att
 * det första trycket missat. Nu står den låst med Sparar… tills det är klart.
 */
export default function AddButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : "Lägg till"}
    </Button>
  );
}
