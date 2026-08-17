"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestReset,
  type ForgotPasswordState,
} from "@/app/admin/glomt-losenord/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Begär en återställningslänk.
 *
 * Kvittensen är formulerad så att den är sann oavsett om adressen fanns: "har
 * adressen ett konto är mejlet på väg". Ett rakare "vi har skickat ett mejl"
 * vore en lögn i hälften av fallen, och ett "adressen finns inte" vore ett
 * sätt att kartlägga våra kunder.
 */
export default function ForgotPasswordForm() {
  const [state, action] = useActionState<ForgotPasswordState, FormData>(
    requestReset,
    {}
  );

  if (state.sent) {
    return (
      <Alert tone="info">
        Har adressen ett konto i Tikkr är ett mejl med en återställningslänk på
        väg. Länken gäller i en timme.
        <span className="mt-1.5 block">
          Kontrollera skräpposten om det dröjer.
        </span>
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      <Field
        label="E-postadress"
        hint="Adressen du loggar in med."
      >
        <Input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
        />
      </Field>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Skickar…" : "Skicka återställningslänk"}
    </Button>
  );
}
