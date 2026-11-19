"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { TokenState } from "@/app/admin/(panel)/installningar/integrationer/actions";
import { Alert, Button } from "@/components/ui";

/**
 * RUTAN SOM VISAR EN REGISTRERINGSTOKEN FÖR TIKKR GATEWAY.
 *
 * Token visas EN gång. Den sparas bara som fingeravtryck och går inte att
 * visa igen; stängs rutan skapas en ny. Samma hållning som kopplingskoden till
 * skärmarna (PairingCodeDialog).
 *
 * Kommandot för tyst installation står under, för den som rullar ut med ett
 * RMM-verktyg. Innehållet byggs om vid varje öppning, så att en gammal token
 * aldrig står kvar.
 */
export default function GatewayTokenDialog({
  action,
  msiFile,
}: {
  action: (previous: TokenState, formData: FormData) => Promise<TokenState>;
  /** MSI:ns filnamn. Utan publicerad version finns inget kommando. */
  msiFile: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opening, setOpening] = useState(0);

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setOpening((count) => count + 1);
          dialog.current?.showModal();
        }}
      >
        Ny registreringstoken
      </Button>

      <dialog
        ref={dialog}
        className="w-[min(42rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <Body key={opening} action={action} msiFile={msiFile} onClose={() => dialog.current?.close()} />
      </dialog>
    </>
  );
}

function Body({
  action,
  msiFile,
  onClose,
}: {
  action: (previous: TokenState, formData: FormData) => Promise<TokenState>;
  msiFile: string | null;
  onClose: () => void;
}) {
  const [state, submit] = useActionState<TokenState, FormData>(action, {});

  if (state.token) {
    return (
      <>
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">Registreringstoken</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
            Klistra in den i installationen. Den gäller en gång, i ett dygn, och visas inte igen.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <Copyable label="Token" value={state.token} />
          {msiFile && <Copyable label="Tyst installation" value={`msiexec /i ${msiFile} /qn TOKEN=${state.token}`} />}
          <Copyable label="Eller på en server där gatewayen redan finns" value={`tikkr-gateway register ${state.token}`} />
        </div>

        <div className="flex justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button type="button" tone="secondary" onClick={onClose}>
            Klar
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-neutral-900">Ny registreringstoken</h2>
      </div>
      <form action={submit}>
        <div className="space-y-4 px-5 py-5">{state.error && <Alert>{state.error}</Alert>}</div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button type="button" tone="secondary" onClick={onClose}>
            Avbryt
          </Button>
          <Submit />
        </div>
      </form>
    </>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Skapar …" : "Skapa token"}
    </Button>
  );
}

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-neutral-600">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-[13px] whitespace-nowrap text-neutral-900">
          {value}
        </code>
        <Button
          type="button"
          tone="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Utan urklipp går texten att markera och kopiera för hand.
            }
          }}
        >
          {copied ? "Kopierad" : "Kopiera"}
        </Button>
      </div>
    </div>
  );
}
