"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  removeEmployeePhoto,
  uploadEmployeePhoto,
  type PhotoState,
} from "@/app/admin/(panel)/anstallda/actions";
import { Alert, Button } from "@/components/ui";
import EmployeeAvatar from "@/components/ui/EmployeeAvatar";

/**
 * Byter porträtt på en anställd.
 *
 * Filväljaren skickar formuläret så fort en bild valts. Ett extra klick på
 * "spara" efter att man redan valt en fil är ett steg som bara går att glömma.
 *
 * Vald bild visas direkt, innan servern svarat. Uppladdningen tar en stund på
 * en verkstads uppkoppling, och utan förhandsvisningen ser det ut som att
 * ingenting hände.
 */
export default function EmployeePhotoForm({
  employeeId,
  name,
  hasPhoto,
}: {
  employeeId: string;
  name: string;
  hasPhoto: boolean;
}) {
  const [state, action] = useActionState<PhotoState, FormData>(
    uploadEmployeePhoto,
    {}
  );

  const form = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-20 w-20 shrink-0 rounded-full object-cover ring-1 ring-neutral-200"
          />
        ) : (
          <EmployeeAvatar
            employeeId={employeeId}
            name={name}
            hasPhoto={hasPhoto}
            size={80}
          />
        )}

        <div className="min-w-0">
          <p className="text-[13px] font-medium text-neutral-900">{name}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
            PNG, JPEG eller WebP, högst 512 kB. Bilden beskärs till en cirkel,
            så ett ansikte mitt i bilden fungerar bäst.
          </p>
        </div>
      </div>

      <form ref={form} action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={employeeId} />

        <label className="cursor-pointer rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">
          {hasPhoto ? "Byt bild" : "Välj bild"}
          <input
            type="file"
            name="photo"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) setPreview(URL.createObjectURL(file));
              form.current?.requestSubmit();
            }}
          />
        </label>

        <Pending />
      </form>

      {hasPhoto && (
        <form action={removeEmployeePhoto}>
          <input type="hidden" name="id" value={employeeId} />
          <Button type="submit" tone="ghost">
            Ta bort bilden
          </Button>
        </form>
      )}
    </div>
  );
}

function Pending() {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <span className="self-center text-[13px] text-neutral-500">
      Laddar upp…
    </span>
  );
}
