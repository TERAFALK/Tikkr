"use client";

import { useState } from "react";
import { addDevice } from "@/app/admin/(panel)/skarmar/actions";
import { Alert, Button, Card, Input } from "@/components/ui";

/**
 * Skapar en skärm och visar kopplingslänken en enda gång.
 *
 * Länken visas bara här och nu — den går inte att få fram igen, eftersom bara
 * ett fingeravtryck av den sparas. Därför säger vi det rakt ut i gränssnittet
 * istället för att låta någon upptäcka det senare.
 */
export default function NewDeviceForm({ baseUrl }: { baseUrl: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handle(formData: FormData) {
    const result = await addDevice(formData);
    if (result?.token) {
      setLink(`${baseUrl}/kiosk/koppla/${result.token}`);
      setCopied(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <form action={handle} className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label
            htmlFor="device-name"
            className="mb-1.5 block text-sm font-medium text-neutral-700"
          >
            Lägg till skärm
          </label>
          <Input
            id="device-name"
            name="name"
            placeholder="Verkstaden, entrén, monteringen…"
            required
          />
        </div>
        <Button type="submit">Skapa kopplingslänk</Button>
      </form>

      {link && (
        <div className="mt-5 space-y-3">
          <Alert tone="info">
            <strong>Öppna den här länken en gång på skärmen.</strong> Den visas
            bara nu — av säkerhetsskäl går den inte att ta fram igen. Tappar du
            bort den skapar du en ny skärm och återkallar den här.
          </Alert>

          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-neutral-900 px-4 py-3 text-sm text-neutral-100">
              {link}
            </code>
            <Button
              type="button"
              tone="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(link);
                setCopied(true);
              }}
            >
              {copied ? "Kopierad" : "Kopiera"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
