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
 * Uppladdning av en logotyp.
 *
 * Används två gånger: en gång för det fyrkantiga märket och en gång för den
 * breda som ligger på utskrifter.
 *
 * Förhandsvisningen har tidpunkten för senaste ändring i sin adress. Utan den
 * visar webbläsaren kvar den gamla bilden ur sin mellanlagring, och det ser ut
 * som att uppladdningen inte tagit.
 */
export default function LogoUpload({
  variant,
  hasLogo,
  updatedAt,
}: {
  variant: "square" | "wide";
  hasLogo: boolean;
  updatedAt: string | null;
}) {
  const [state, action] = useActionState<LogoState, FormData>(uploadLogo, {});
  const wide = variant === "wide";

  return (
    <div className="space-y-4 p-5">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      {hasLogo && (
        <div className="flex items-center gap-4">
          <span
            className={`flex items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-white ${
              wide ? "h-16 w-40 p-2" : "h-16 w-16"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={updatedAt ?? variant}
              src={`/api/company/logo?variant=${variant}&v=${updatedAt ?? ""}`}
              alt=""
              className={
                wide
                  ? "max-h-full max-w-full object-contain"
                  : "h-full w-full object-cover"
              }
            />
          </span>

          <form action={removeLogo}>
            <input type="hidden" name="variant" value={variant} />
            <Button type="submit" tone="danger">
              Ta bort
            </Button>
          </form>
        </div>
      )}

      <form action={action} className="space-y-4">
        <input type="hidden" name="variant" value={variant} />

        <Field
          label={hasLogo ? "Byt bild" : "Ladda upp bild"}
          hint={
            wide
              ? "PNG eller JPEG, högst 512 kB. Bred bild med namnet utskrivet fungerar bäst — den läggs överst på underlaget som en brevhuvud."
              : "PNG eller JPEG, högst 512 kB. Bilden fyller rutan helt, så en kvadratisk bild blir bäst. En PNG med genomskinlig bakgrund ser snyggast ut på stämplingsskärmen."
          }
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
      {pending ? "Laddar upp…" : "Spara"}
    </Button>
  );
}
