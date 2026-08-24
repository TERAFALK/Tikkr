"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createInvite,
  type InviteState,
} from "@/app/admin/(panel)/installningar/anvandare/actions";
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
} from "@/components/ui";

/**
 * Bjuder in en administratör och visar länken en enda gång.
 *
 * Länken går inte att ta fram igen — bara ett fingeravtryck av den sparas,
 * precis som för kioskskärmarna. Det står i gränssnittet istället för att
 * upptäckas efteråt.
 */
export default function InviteAdminForm({ baseUrl }: { baseUrl: string }) {
  const [state, action] = useActionState<InviteState, FormData>(
    createInvite,
    {}
  );
  const [copied, setCopied] = useState(false);

  const fullLink = state.link ? `${baseUrl}${state.link}` : null;

  return (
    <div className="space-y-5 p-5">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field label="E-postadress">
            <Input name="email" type="email" placeholder="kollega@foretaget.se" required />
          </Field>
        </div>

        <div className="w-40">
          <Field label="Behörighet">
            <Select name="role" defaultValue="ADMIN">
              <option value="ADMIN">Administratör</option>
              <option value="OWNER">Ägare</option>
            </Select>
          </Field>
        </div>

        <SubmitButton />
      </form>

      {state.error && <Alert>{state.error}</Alert>}

      {fullLink && (
        <div className="space-y-3">
          <Alert tone="info">
            {state.mailed ? (
              <>
                <strong>Inbjudan är skickad till {state.email}.</strong>{" "}
                Personen väljer sitt eget lösenord när länken öppnas. Länken
                nedan är samma som i mejlet och visas bara nu. Den kan skickas
                på annat sätt om mejlet inte kommer fram.
              </>
            ) : (
              <>
                <strong>Skicka länken till {state.email}.</strong> Inbjudan
                kunde inte mejlas, så den behöver skickas på annat sätt.
                Personen väljer sitt eget lösenord när länken öppnas. Den visas
                bara nu, gäller i sju dagar och kan bara användas en gång.
              </>
            )}
          </Alert>

          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-neutral-900 px-3 py-2.5 text-[13px] text-neutral-100">
              {fullLink}
            </code>
            <Button
              type="button"
              tone="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(fullLink);
                setCopied(true);
              }}
            >
              {copied ? "Kopierad" : "Kopiera"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Skapar…" : "Skapa inbjudan"}
    </Button>
  );
}
