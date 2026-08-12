"use client";

import { useRef, useState } from "react";
import { addDevice } from "@/app/admin/(panel)/skarmar/actions";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Skapar en skärm och visar kopplingslänken en enda gång.
 *
 * Rutan stängs INTE när skärmen skapats, till skillnad från övriga formulär.
 * Länken går inte att ta fram igen — bara ett fingeravtryck av den sparas —
 * så stängdes rutan direkt vore skärmen omöjlig att koppla.
 */
export default function NewDeviceForm({
  baseUrl,
  available,
}: {
  baseUrl: string;
  /** Lediga licenser. Är den noll går ingen skärm att skapa. */
  available: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handle(formData: FormData) {
    const result = await addDevice(formData);

    if (result?.error) {
      setError(result.error);
      return;
    }

    if (result?.token) {
      setError(null);
      setLink(`${baseUrl}/kiosk/koppla/${result.token}`);
      setCopied(false);
    }
  }

  function open() {
    setLink(null);
    setError(null);
    setCopied(false);
    dialog.current?.showModal();
  }

  return (
    <>
      <Button type="button" onClick={open} disabled={available <= 0}>
        {available > 0 ? "Ny skärm" : "Inga lediga licenser"}
      </Button>

      <dialog
        ref={dialog}
        className="w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            {link ? "Skärmen är skapad" : "Lägg till skärm"}
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
            {link
              ? "Öppna länken en gång på den enhet som ska användas för stämpling."
              : "Ange ett namn som beskriver var skärmen är placerad. Kopplingslänken visas direkt."}
          </p>
        </div>

        {link ? (
          <div className="space-y-4 px-5 py-5">
            <Alert tone="warning">
              <strong>Länken visas endast en gång.</strong> Den sparas inte av
              säkerhetsskäl. Om länken går förlorad skapas en ny skärm och den
              befintliga återkallas.
            </Alert>

            <code className="block overflow-x-auto rounded-md bg-neutral-900 px-3 py-2.5 text-[13px] text-neutral-100">
              {link}
            </code>

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? "Kopierad" : "Kopiera länken"}
              </Button>
              <Button
                type="button"
                tone="secondary"
                onClick={() => dialog.current?.close()}
              >
                Klar
              </Button>
            </div>
          </div>
        ) : (
          <form action={handle}>
            <div className="space-y-4 px-5 py-5">
              {error && <Alert>{error}</Alert>}

              <Field
                label="Namn"
                hint={`${available} lediga licenser.`}
              >
                <Input
                  name="name"
                  placeholder="Verkstaden, entrén, monteringen…"
                  required
                  autoFocus
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
              <Button type="submit">Skapa kopplingslänk</Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
