"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  deleteImageAction,
  moveImageAction,
  updateImageAction,
} from "@/app/plattform/(panel)/produkter/actions";
import { Alert, Button, Card, CardHeader, Field, Input } from "@/components/ui";

export interface ImageRow {
  id: string;
  src: string;
  alt: string;
  illustration: boolean;
  /** En fil under public/ och inte en uppladdad bild. */
  isStatic: boolean;
}

/**
 * PRODUKTENS BILDER.
 *
 * Den första bilden är den som visas i butiken och överst på produktsidan.
 * Uppladdningen går till en egen rutt, eftersom serveråtgärder tar emot högst
 * 1 MB, se api/plattform/produkter/bild. Allt annat är vanliga åtgärder.
 */
export default function ProductImages({
  productId,
  images,
}: {
  productId: string;
  images: ImageRow[];
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setUploading(true);

    try {
      const response = await fetch("/api/plattform/produkter/bild", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Bilden gick inte att ladda upp. Försök igen.");
        return;
      }

      form.current?.reset();
      router.refresh();
    } catch {
      setError("Bilden gick inte att ladda upp. Kontrollera anslutningen och försök igen.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Bilder" description="Den första visas i butiken och överst på produktsidan." />

      {images.length > 0 && (
        <ul className="divide-y divide-neutral-100">
          {images.map((image, index) => (
            <li key={image.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div className="h-20 w-28 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.src} alt="" className="h-full w-full object-contain" />
              </div>

              <form action={updateImageAction} className="min-w-0 flex-1 space-y-2">
                <input type="hidden" name="imageId" value={image.id} />
                <Field label="Beskrivning för skärmläsare">
                  <Input name="alt" defaultValue={image.alt} maxLength={300} />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-[13px] text-neutral-700">
                    <input
                      type="checkbox"
                      name="illustration"
                      defaultChecked={image.illustration}
                      className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
                    />
                    Illustration, inte foto
                  </label>
                  <Button type="submit" tone="secondary">
                    Spara
                  </Button>
                </div>
                {image.isStatic && (
                  <p className="text-xs text-neutral-500">Fil i appen: {image.src}</p>
                )}
              </form>

              <div className="flex shrink-0 gap-1">
                <form action={moveImageAction}>
                  <input type="hidden" name="imageId" value={image.id} />
                  <input type="hidden" name="direction" value="up" />
                  <Button type="submit" tone="ghost" disabled={index === 0} aria-label="Flytta upp">
                    ↑
                  </Button>
                </form>
                <form action={moveImageAction}>
                  <input type="hidden" name="imageId" value={image.id} />
                  <input type="hidden" name="direction" value="down" />
                  <Button
                    type="submit"
                    tone="ghost"
                    disabled={index === images.length - 1}
                    aria-label="Flytta ner"
                  >
                    ↓
                  </Button>
                </form>
                <form
                  action={deleteImageAction}
                  onSubmit={(event) => {
                    if (!window.confirm("Ta bort bilden?")) event.preventDefault();
                  }}
                >
                  <input type="hidden" name="imageId" value={image.id} />
                  <Button type="submit" tone="danger">
                    Ta bort
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form ref={form} onSubmit={upload} className="space-y-3 border-t border-neutral-100 p-5">
        {error && <Alert>{error}</Alert>}
        <input type="hidden" name="productId" value={productId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ny bild" hint="PNG, JPEG eller WebP, högst 5 MB">
            <input
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp"
              required
              className="block w-full text-[13px] text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-neutral-900 hover:file:bg-neutral-200"
            />
          </Field>
          <Field label="Beskrivning för skärmläsare">
            <Input name="alt" maxLength={300} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[13px] text-neutral-700">
            <input
              type="checkbox"
              name="illustration"
              className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
            />
            Illustration, inte foto
          </label>
          <Button type="submit" disabled={uploading}>
            {uploading ? "Laddar upp…" : "Ladda upp"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
