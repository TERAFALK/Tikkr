"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  setNewPassword,
  type ResetState,
} from "@/app/admin/aterstall/[token]/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function ResetPasswordForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, action] = useActionState<ResetState, FormData>(
    setNewPassword,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}

      <input type="hidden" name="token" value={token} />

      <Field label="E-postadress">
        {/* Bestäms av länken och går inte att ändra här. Annars skulle en
            återställningslänk kunna riktas om mot ett annat konto. */}
        <Input value={email} readOnly disabled />
      </Field>

      <Field label="Välj ett nytt lösenord" hint="Minst 10 tecken.">
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
      {pending ? "Sparar…" : "Spara och logga in"}
    </Button>
  );
}
