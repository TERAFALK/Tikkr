"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  removeLogo,
  uploadLogo,
  type LogoState,
} from "@/app/admin/(panel)/installningar/actions";
import { Alert, Button, Field } from "@/components/ui";

/**
 * Uppladdning av kundens logotyp.
 *
 * Visar bilden som redan finns, så man ser vad man byter ut. Nyckeln på
 * förhandsvisningen innehåller tidpunkten för senaste ändring — utan den
 * skulle webbläsaren visa den gamla bilden kvar från sin egen mellanlagring
 * och det skulle se ut som att uppladdningen inte tagit.
 */
export default function LogoUpload({
  hasLogo,
  updatedAt,
}: {
  hasLogo: boolean;
  updatedAt: string | null;
}) {
  const [state, action] = useActionState<LogoState, FormData>(uploadLogo, {});

  return (
    <div className="space-y-4 p-5">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      {hasLogo && (
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={updatedAt ?? "logo"}
              src={`/api/company/logo?v=${updatedAt ?? ""}`}
              alt="Nuvarande logotyp"
              className="max-h-full max-w-full object-contain"
            />
          </span>

          <form action={removeLogo}>
            <Button type="submit" tone="danger">
              Ta bort
            </Button>
          </form>
        </div>
      )}

      <form action={action} className="space-y-4">
        <Field
          label={hasLogo ? "Byt logotyp" : "Ladda upp logotyp"}
          hint="PNG eller JPEG, högst 512 kB. En PNG med genomskinlig bakgrund ser bäst ut på stämplingsskärmen."
        >
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg"
            required
            className="block w-full text-[13px] text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-white hover:file:bg-neutral-800"
          />
        </Field>

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Laddar upp…" : "Spara logotyp"}
    </Button>
  );
}
