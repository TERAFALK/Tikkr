"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "@/app/admin/login/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      <Field label="E-postadress">
        <Input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
        />
      </Field>

      <Field label="Lösenord">
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  // Visar att något händer medan inloggningen behandlas. Utan det ser sidan
  // död ut i den sekund lösenordskontrollen tar, och folk klickar igen.
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Loggar in…" : "Logga in"}
    </Button>
  );
}
