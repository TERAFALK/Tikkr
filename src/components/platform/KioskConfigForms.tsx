"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  chooseCompanyConfig,
  chooseDeviceConfig,
  createKioskConfig,
  restoreKioskVersion,
  saveKioskConfig,
  type ConfigFormState,
} from "@/app/plattform/(panel)/skarmar/actions";
import ActionDialog from "@/components/ui/ActionDialog";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import {
  SECRET_KEYS,
  parseConfigUpload,
  settingsToText,
  type ConfigValues,
} from "@/lib/kiosk-config";

/**
 * FORMULÄREN FÖR SKÄRMKONFIGURATIONERNA.
 *
 * Läser kiosk-config.ts direkt, som inte har några importer och därför inte
 * tar databasen med sig till webbläsaren.
 */

function Pending({ label, pending }: { label: string; pending: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <Button type="submit" disabled={busy}>
      {busy ? pending : label}
    </Button>
  );
}

/**
 * Varningarna, och knappen som sparar ändå.
 *
 * Knappen skickar formuläret igen med confirm=1. Ett namngivet värde på en
 * skicka-knapp följer med i formuläret, så ingen dold ruta behöver hållas i
 * takt.
 */
function Answer({ state, confirmLabel }: { state: ConfigFormState; confirmLabel: string }) {
  return (
    <>
      {state.error && <Alert>{state.error}</Alert>}
      {state.warnings && state.warnings.length > 0 && (
        <Alert tone="warning">
          <ul className="list-disc space-y-1 pl-4">
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <div className="mt-3">
            <Button type="submit" name="confirm" value="1" tone="danger">
              {confirmLabel}
            </Button>
          </div>
        </Alert>
      )}
      {state.ok && <p className="text-[13px] text-tick-deep">{state.ok}</p>}
    </>
  );
}

/** Läser en vald fil som text och lämnar den vidare. */
function FilePicker({ onText }: { onText: (text: string) => void }) {
  return (
    <input
      type="file"
      accept="application/json,.json"
      className="block text-[13px] text-neutral-600 file:mr-3 file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-[13px]"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        void file.text().then(onText);
      }}
    />
  );
}

/** Ny konfiguration ur en export. */
export function CreateConfigDialog() {
  const fileRef = useRef<HTMLTextAreaElement>(null);

  return (
    <ActionDialog<ConfigFormState>
      trigger="Ny konfiguration"
      triggerTone="primary"
      title="Ny konfiguration"
      description="Ladda upp en export från ProMGR, eller klistra in den."
      action={createKioskConfig}
      initial={{}}
      submitLabel="Skapa"
    >
      <Field label="Namn">
        <Input name="name" autoComplete="off" required />
      </Field>
      <Field label="Fil">
        <FilePicker
          onText={(text) => {
            if (fileRef.current) fileRef.current.value = text;
          }}
        />
      </Field>
      <Field label="Innehåll" hint="JSON, som exporten från ProMGR">
        <Textarea ref={fileRef} name="file" rows={8} className="font-mono text-xs" required />
      </Field>
    </ActionDialog>
  );
}

/**
 * Redigeraren: inställningarna som JSON och hemligheterna i egna fält.
 *
 * Hemligheterna står maskerade tills någon trycker Visa. Läser man in en ny
 * fil fylls båda delarna, och hemligheterna i filen ersätter fälten.
 */
export function ConfigEditor({
  configId,
  settings,
  secrets,
}: {
  configId: string;
  settings: ConfigValues;
  secrets: ConfigValues;
}) {
  const [state, submit] = useActionState(saveKioskConfig, {});
  const [text, setText] = useState(() => settingsToText(settings));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(SECRET_KEYS.map((key) => [key, secrets[key] === undefined ? "" : String(secrets[key])]))
  );
  const [shown, setShown] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  function loadFile(raw: string) {
    const parsed = parseConfigUpload(raw);
    if ("error" in parsed) {
      setFileError(parsed.error);
      return;
    }
    setFileError(null);
    setText(settingsToText(parsed.settings));
    setValues((current) => {
      const next = { ...current };
      for (const key of SECRET_KEYS) {
        if (key in parsed.secrets) next[key] = String(parsed.secrets[key]);
      }
      return next;
    });
  }

  return (
    <form action={submit} className="space-y-5 p-5">
      <input type="hidden" name="configId" value={configId} />

      <Field label="Läs in en fil" hint="En export från ProMGR ersätter innehållet nedan">
        <FilePicker onText={loadFile} />
      </Field>
      {fileError && <Alert>{fileError}</Alert>}

      <Field label="Inställningar" hint="JSON. Hemligheterna står för sig nedan">
        <Textarea
          name="settings"
          rows={18}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="font-mono text-xs"
          spellCheck={false}
        />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-neutral-900">Hemligheter</h3>
          <Button type="button" tone="secondary" onClick={() => setShown((value) => !value)}>
            {shown ? "Dölj" : "Visa"}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SECRET_KEYS.map((key) => (
            <Field key={key} label={key}>
              <Input
                name={`secret:${key}`}
                type={shown ? "text" : "password"}
                autoComplete="off"
                value={values[key]}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
                className="font-mono text-xs"
              />
            </Field>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">Tomt fält tas bort ur filen</p>
      </div>

      <Answer state={state} confirmLabel="Spara ändå" />

      <Pending label="Spara som ny version" pending="Sparar…" />
    </form>
  );
}

/** Sparar en äldre version som en ny. */
export function RestoreVersion({
  configId,
  versionId,
  version,
}: {
  configId: string;
  versionId: string;
  version: number;
}) {
  const [state, submit] = useActionState(restoreKioskVersion, {});

  return (
    <form action={submit} className="space-y-2">
      <input type="hidden" name="configId" value={configId} />
      <input type="hidden" name="versionId" value={versionId} />
      <Answer state={state} confirmLabel="Återställ ändå" />
      {!state.warnings && (
        <Button type="submit" tone="secondary">
          Återställ version {version}
        </Button>
      )}
    </form>
  );
}

/** Ett val ur listan och Spara, för kunden eller en skärm. */
function ChooseForm({
  action,
  hidden,
  options,
  current,
  emptyLabel,
}: {
  action: (state: ConfigFormState, formData: FormData) => Promise<ConfigFormState>;
  hidden: Record<string, string>;
  options: { id: string; name: string }[];
  current: string | null;
  emptyLabel: string;
}): ReactNode {
  const [state, submit] = useActionState(action, {});

  return (
    <form action={submit} className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Select name="configId" defaultValue={current ?? ""} className="w-auto min-w-48">
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </Select>
      <Pending label="Spara" pending="Sparar…" />
      {state.error && <span className="text-[13px] text-red-700">{state.error}</span>}
      {state.ok && <span className="text-[13px] text-tick-deep">{state.ok}</span>}
    </form>
  );
}

export function CompanyConfigChooser(props: {
  companyId: string;
  options: { id: string; name: string }[];
  current: string | null;
  defaultName: string | null;
}) {
  return (
    <ChooseForm
      action={chooseCompanyConfig}
      hidden={{ companyId: props.companyId }}
      options={props.options}
      current={props.current}
      emptyLabel={props.defaultName ? `Standard (${props.defaultName})` : "Standard"}
    />
  );
}

export function DeviceConfigChooser(props: {
  companyId: string;
  deviceId: string;
  options: { id: string; name: string }[];
  current: string | null;
}) {
  return (
    <ChooseForm
      action={chooseDeviceConfig}
      hidden={{ companyId: props.companyId, deviceId: props.deviceId }}
      options={props.options}
      current={props.current}
      emptyLabel="Kundens"
    />
  );
}
