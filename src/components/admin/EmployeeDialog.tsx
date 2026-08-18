"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { EmployeeState } from "@/app/admin/(panel)/anstallda/actions";
import { Alert, Button, Field, Input } from "@/components/ui";
import EmployeeAvatar from "@/components/ui/EmployeeAvatar";

/**
 * RUTAN DÄR EN ANSTÄLLD LÄGGS UPP ELLER ÄNDRAS.
 *
 * Namn, anställningsnummer och bild i ETT formulär. Bilden låg tidigare i en
 * egen ruta, vilket gjorde att man fick öppna två ställen för att lägga upp en
 * person ordentligt — och det andra stället var lätt att aldrig hitta.
 *
 * Rutan stängs inte av sig själv vid fel. Ett upptaget anställningsnummer ska
 * gå att rätta utan att skriva in allt igen.
 */
export default function EmployeeDialog({
  trigger,
  triggerTone = "primary",
  title,
  description,
  action,
  submitLabel,
  employee,
}: {
  trigger: string;
  triggerTone?: "primary" | "secondary" | "ghost";
  title: string;
  description?: string;
  action: (
    previous: EmployeeState,
    formData: FormData
  ) => Promise<EmployeeState>;
  submitLabel: string;
  /** Utelämnas när en ny person läggs upp. */
  employee?: {
    id: string;
    name: string;
    employeeNumber: string | null;
    hasPhoto: boolean;
  };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, submit] = useActionState<EmployeeState, FormData>(action, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  function open() {
    setPreview(null);
    setRemovePhoto(false);
    dialog.current?.showModal();
  }

  // Stänger när sparandet gick igenom. Ett fel lämnar rutan öppen med
  // värdena kvar — ett upptaget anställningsnummer ska gå att rätta utan att
  // skriva in allt igen.
  useEffect(() => {
    if (!state.savedAt) return;

    dialog.current?.close();
    setPreview(null);
    setRemovePhoto(false);
  }, [state.savedAt]);

  const showsPhoto = Boolean(employee?.hasPhoto) && !removePhoto;

  return (
    <>
      <Button type="button" tone={triggerTone} onClick={open}>
        {trigger}
      </Button>

      <dialog
        ref={dialog}
        className="w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
              {description}
            </p>
          )}
        </div>

        <form action={submit}>
          <div className="space-y-4 px-5 py-5">
            {state.error && <Alert>{state.error}</Alert>}

            {employee && (
              <input type="hidden" name="id" value={employee.id} />
            )}

            {/* Bilden överst: den syns på stämplingsskärmen och är det som
                gör knappen lätt att hitta. */}
            <div className="flex items-center gap-4">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-neutral-200"
                />
              ) : (
                <EmployeeAvatar
                  employeeId={employee?.id ?? "ny"}
                  name={employee?.name ?? "?"}
                  hasPhoto={showsPhoto}
                  size={64}
                />
              )}

              <div className="min-w-0 space-y-2">
                <label className="inline-block cursor-pointer rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">
                  {showsPhoto || preview ? "Byt bild" : "Välj bild"}
                  <input
                    type="file"
                    name="photo"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        setPreview(URL.createObjectURL(file));
                        setRemovePhoto(false);
                      }
                    }}
                  />
                </label>

                <p className="text-xs leading-relaxed text-neutral-500">
                  Visas på stämplingsskärmen. PNG, JPEG eller WebP, högst
                  512 kB. Bilden beskärs till en cirkel.
                </p>

                {employee?.hasPhoto && !preview && (
                  <label className="flex items-center gap-2 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      name="removePhoto"
                      checked={removePhoto}
                      onChange={(event) => setRemovePhoto(event.target.checked)}
                      className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
                    />
                    Ta bort bilden
                  </label>
                )}
              </div>
            </div>

            <Field label="Namn">
              <Input
                name="name"
                defaultValue={employee?.name ?? ""}
                placeholder="Anna Andersson"
                required
                autoFocus
              />
            </Field>

            <Field
              label="Anställningsnummer"
              hint="Valfritt. Syns i panelen och i rapporterna, aldrig på stämplingsskärmen."
            >
              <Input
                name="employeeNumber"
                defaultValue={employee?.employeeNumber ?? ""}
                placeholder="1042"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            <Button
              type="button"
              tone="secondary"
              onClick={() => dialog.current?.close()}
            >
              Avbryt
            </Button>
            <SubmitButton label={submitLabel} />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : label}
    </Button>
  );
}
