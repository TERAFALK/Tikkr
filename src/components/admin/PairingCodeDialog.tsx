"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { PairingFormState } from "@/app/admin/(panel)/installningar/skarmar/actions";
import { Alert, Button } from "@/components/ui";

/**
 * RUTAN SOM VISAR KOPPLINGSKODEN.
 *
 * Används både när en skärm skapas och när den kopplas om — det är samma sak
 * sett från den som står vid skärmen: en kod att knappa in.
 *
 * Koden visas stort och delad i två grupper om tre. Den ska gå att läsa upp
 * tvärs över en verkstad utan att någon tappar räkningen, och tre siffror i
 * taget är ungefär vad man håller i huvudet.
 *
 * Nedräkningen finns för att koden faktiskt går ut. Utan den skulle den som
 * lämnar rutan öppen och går bort en stund komma tillbaka till en kod som inte
 * längre fungerar, utan att förstå varför.
 *
 * INNEHÅLLET BYGGS OM VARJE GÅNG RUTAN ÖPPNAS. Utan det låg förra kodens svar
 * kvar i formulärets tillstånd, och den som skapat en skärm och tryckte "Ny
 * skärm" igen fick se den föregående koden i stället för ett tomt fält — en
 * andra skärm gick inte att lägga upp utan att ladda om sidan.
 *
 * Priset är att en kod inte går att titta på igen efter att rutan stängts. Det
 * är avsiktligt: raden i listan har en egen knapp för en ny kod, så ingen
 * tvingas skapa om själva skärmen, och en färsk kod med känd livslängd är
 * ärligare än en gammal vars återstående tid ingen längre ser.
 *
 * LISTAN HÄMTAS OM FÖRST NÄR RUTAN STÄNGS (ändrat 2026-11-27). Åtgärden
 * hämtade om sidan direkt, och den första skärmen skapas från knappen i den
 * tomma listan. Den tomma listan byttes då mot tabellen, rutan försvann med
 * den, och koden syntes aldrig. Från den andra skärmen stod knappen i
 * rubriken och fanns kvar.
 *
 * ADRESSEN STÅR SOM ETT EGET STEG, lika stort som koden. Den stod i en
 * liten rad under rubriken, och det var inte självklart vart skärmen skulle.
 */
export default function PairingCodeDialog({
  trigger,
  triggerTone = "primary",
  title,
  description,
  action,
  submitLabel,
  disabled,
  address,
  children,
}: {
  /** Adressen skärmen öppnar, utan https://, till exempel tikkr.se/kiosk. */
  address: string;
  trigger: string;
  triggerTone?: "primary" | "secondary" | "ghost";
  title: string;
  description?: string;
  action: (
    previous: PairingFormState,
    formData: FormData
  ) => Promise<PairingFormState>;
  submitLabel: string;
  disabled?: boolean;
  /** Dolda fält och formulärfält, exempelvis skärmens id vid koppla om. */
  children?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  // Räknas upp vid varje öppning. Används som key på innehållet nedan, vilket
  // bygger om det från grunden — inklusive formulärets tillstånd.
  const [opening, setOpening] = useState(0);

  return (
    <>
      <Button
        type="button"
        tone={triggerTone}
        disabled={disabled}
        onClick={() => {
          setOpening((count) => count + 1);
          dialog.current?.showModal();
        }}
      >
        {trigger}
      </Button>

      <dialog
        ref={dialog}
        onClose={() => router.refresh()}
        className="w-[min(42rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <Body
          key={opening}
          title={title}
          description={description}
          action={action}
          submitLabel={submitLabel}
          address={address}
          onClose={() => dialog.current?.close()}
        >
          {children}
        </Body>
      </dialog>
    </>
  );
}

function Body({
  title,
  description,
  action,
  submitLabel,
  address,
  onClose,
  children,
}: {
  address: string;
  title: string;
  description?: string;
  action: (
    previous: PairingFormState,
    formData: FormData
  ) => Promise<PairingFormState>;
  submitLabel: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [state, submit] = useActionState<PairingFormState, FormData>(action, {});

  if (state.code) {
    return (
      <>
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            Kod för {state.deviceName}
          </h2>
        </div>

        <div className="space-y-6 px-5 py-6 text-center">
          <div>
            <p className="text-[13px] font-medium text-neutral-600">
              1. Öppna adressen i webbläsaren på skärmen
            </p>
            <p className="mt-1 select-all font-mono text-2xl font-semibold text-neutral-900">
              {address}
            </p>
          </div>

          <div>
            <p className="text-[13px] font-medium text-neutral-600">
              2. Knappa in koden
            </p>
            <p className="mt-1 font-mono text-5xl font-semibold tracking-[0.2em] text-neutral-900">
              {state.code.slice(0, 3)} {state.code.slice(3)}
            </p>
          </div>

          <Countdown expiresAt={state.expiresAt!} />

          <p className="text-[13px] leading-relaxed text-neutral-500">
            Koden gäller en gång, för den här skärmen.
          </p>
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
          {children}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          <Button type="button" tone="secondary" onClick={onClose}>
            Avbryt
          </Button>
          <SubmitButton label={submitLabel} />
        </div>
      </form>
    </>
  );
}

/** Visar hur länge koden lever kvar. Uppdateras varje sekund. */
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now())
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (left === 0) {
    return (
      <p className="text-[13px] font-medium text-amber-700">
        Koden har gått ut. Stäng rutan och hämta en ny.
      </p>
    );
  }

  const seconds = Math.ceil(left / 1000);
  const minutes = Math.floor(seconds / 60);

  return (
    <p className="text-[13px] tabular-nums text-neutral-500">
      Gäller i {minutes}:{String(seconds % 60).padStart(2, "0")}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Skapar…" : label}
    </Button>
  );
}
