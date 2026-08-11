"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  acceptInvitation,
  type AcceptState,
} from "@/app/admin/inbjudan/[token]/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function AcceptInviteForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, action] = useActionState<AcceptState, FormData>(
    acceptInvitation,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      <input type="hidden" name="token" value={token} />

      <Field label="E-postadress">
        {/* Adressen är bestämd av inbjudan och går inte att ändra här — annars
            skulle en länk kunna användas för att skapa konto åt vem som helst. */}
        <Input value={email} readOnly disabled />
      </Field>

      <Field label="Välj ett lösenord" hint="Minst 10 tecken.">
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          autoFocus
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
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Skapar kontot…" : "Skapa kontot och logga in"}
    </Button>
  );
}
