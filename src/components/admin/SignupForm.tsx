"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { register, type SignupState } from "@/app/registrera/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function SignupForm() {
  const [state, action] = useActionState<SignupState, FormData>(register, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      <Field label="Företagets namn">
        <Input name="companyName" required autoFocus placeholder="Mekaniska AB" />
      </Field>

      <Field label="Din e-postadress" hint="Används för att logga in.">
        <Input name="email" type="email" autoComplete="username" required />
      </Field>

      <Field label="Lösenord" hint="Minst 10 tecken.">
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      <Field label="Upprepa lösenordet">
        <Input
          name="repeat"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  // Lösenordshashningen tar en dryg sekund med flit. Utan besked ser sidan
  // död ut under tiden, och folk trycker igen.
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Skapar arbetsyta…" : "Skapa arbetsyta"}
    </Button>
  );
}
