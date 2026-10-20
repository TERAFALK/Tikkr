"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { RemoteControlState } from "@/app/admin/(panel)/installningar/skarmar/actions";
import ConfirmButton from "@/components/admin/ConfirmButton";
import {
  Alert,
  Button,
  Field,
  Input,
  dialogBody,
  dialogEdge,
  dialogSurface,
} from "@/components/ui";

/**
 * FJÄRRSTYRNING AV EN STÄMPLINGSSKÄRM VI SÅLT.
 *
 * Visas bara för skärmar som kör i kioskappen, se `src/lib/fully.ts`. En kunds
 * egen dator har ingen knapp alls, inte en gråad: § 7.1 punkt 1.
 *
 * Ljusstyrkan och omstarten låg förut direkt på raden i listan, och raden blev
 * så bred att talet i rutan klipptes: 100 visades som 10. Ett klippt tal läses
 * som ett annat värde, så det var ett fel och inte bara ett utseende. Här får
 * de plats, och nästa uppgift om enheten har ett ställe att stå.
 *
 * TVÅ FORMULÄR OCH INTE ETT. Ljusstyrka och omstart är oberoende åtgärder, och
 * var och en svarar med sin egen kvittens. Därför inte `ActionDialog`, som
 * bär ett enda formulär med en knapp; utseendet är ändå dess.
 *
 * INNEHÅLLET BYGGS OM VARJE GÅNG RUTAN ÖPPNAS, som i PairingCodeDialog. Annars
 * låg förra gångens kvittens kvar, och fältet visade det man skrev senast i
 * stället för det som är sparat.
 */

export interface RemoteDevice {
  id: string;
  name: string;
  fullyVersion: string;
  webviewVersion: string | null;
  serialNumber: string | null;
  networkType: "WIFI" | "WIRED" | null;
  wifiSsid: string | null;
  wifiSignal: string | null;
  /** Färdigformaterad på servern, i företagets tidszon. */
  reportedAt: string | null;
  brightness: number | null;
}

type Action = (
  previous: RemoteControlState,
  formData: FormData
) => Promise<RemoteControlState>;

export default function RemoteControlDialog({
  device,
  setBrightness,
  requestRestart,
}: {
  device: RemoteDevice;
  setBrightness: Action;
  requestRestart: Action;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opening, setOpening] = useState(0);

  return (
    <>
      <Button
        type="button"
        tone="secondary"
        onClick={() => {
          setOpening((count) => count + 1);
          dialog.current?.showModal();
        }}
      >
        Fjärrstyrning
      </Button>

      <dialog
        ref={dialog}
        className={`w-[min(32rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">
            Fjärrstyrning av {device.name}
          </h2>
        </div>

        <Body
          key={opening}
          device={device}
          setBrightness={setBrightness}
          requestRestart={requestRestart}
        />

        <div
          className={`${dialogEdge} flex justify-end border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
        >
          <Button
            type="button"
            tone="secondary"
            onClick={() => dialog.current?.close()}
          >
            Stäng
          </Button>
        </div>
      </dialog>
    </>
  );
}

function Body({
  device,
  setBrightness,
  requestRestart,
}: {
  device: RemoteDevice;
  setBrightness: Action;
  requestRestart: Action;
}) {
  const [brightnessState, submitBrightness] = useActionState(setBrightness, {});
  const [restartState, submitRestart] = useActionState(requestRestart, {});

  return (
    <div className={`${dialogBody} space-y-6 px-5 py-5`}>
      <dl className="divide-y divide-neutral-100 text-[13px]">
        <Row label="App">Fully {device.fullyVersion}</Row>
        {device.webviewVersion && (
          <Row label="WebView">{device.webviewVersion}</Row>
        )}
        {device.networkType && (
          <Row label="Anslutning">
            {device.networkType === "WIRED"
              ? "Kabel"
              : device.wifiSsid
                ? `Wifi, ${device.wifiSsid}`
                : "Wifi"}
          </Row>
        )}
        {/* Som appen lämnar den. Skalan är inte dokumenterad och tolkas inte
            förrän den lästs av på en fysisk skärm, se schemat. */}
        {device.networkType === "WIFI" && device.wifiSignal && (
          <Row label="Wifisignal">{device.wifiSignal}</Row>
        )}
        {device.serialNumber && (
          <Row label="Serienummer">{device.serialNumber}</Row>
        )}
        {device.reportedAt && <Row label="Avläst">{device.reportedAt}</Row>}
      </dl>

      <form action={submitBrightness} className="space-y-2">
        <input type="hidden" name="id" value={device.id} />
        <Field label="Ljusstyrka" hint="Procent, 0–100">
          <div className="flex items-center gap-2">
            <Input
              name="brightness"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              defaultValue={device.brightness ?? 100}
              required
              className="w-24"
            />
            <Submit label="Spara" />
          </div>
        </Field>
        <Answer state={brightnessState} />
      </form>

      <form action={submitRestart} className="space-y-2">
        <input type="hidden" name="id" value={device.id} />
        <RestartButton name={device.name} />
        <Answer state={restartState} />
      </form>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-900 [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

/** Kvittensen eller felet under en åtgärd. */
function Answer({ state }: { state: RemoteControlState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.ok) {
    return (
      <p role="status" className="text-[13px] font-medium text-tick-deep">
        {state.ok}
      </p>
    );
  }
  return null;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {pending ? "Sparar…" : label}
    </Button>
  );
}

function RestartButton({ name }: { name: string }) {
  const { pending } = useFormStatus();

  return (
    <ConfirmButton
      type="submit"
      tone="secondary"
      disabled={pending}
      question={`Starta om ${name}? Skärmen är borta i några sekunder.`}
    >
      Starta om
    </ConfirmButton>
  );
}
