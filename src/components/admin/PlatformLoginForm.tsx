"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  platformLogin,
  type PlatformLoginState,
} from "@/app/plattform/login/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function PlatformLoginForm() {
  const [state, action] = useActionState<PlatformLoginState, FormData>(
    platformLogin,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      <Field label="E-postadress">
        <Input name="email" type="email" autoComplete="username" required autoFocus />
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
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Loggar in…" : "Logga in"}
    </Button>
  );
}
