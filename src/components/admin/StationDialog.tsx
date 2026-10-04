"use client";

import ActionDialog from "@/components/ui/ActionDialog";
import ScheduleDays, { type ScheduleDayValue } from "./ScheduleDays";
import { Field, Input, Select } from "@/components/ui";
import type { StationState } from "@/app/admin/(panel)/planering/actions";

/**
 * RUTAN DÄR EN STATION LÄGGS UPP ELLER ÄNDRAS.
 *
 * Namn, arbetsmoment och öppettider. Öppettiderna är samma rutnät som
 * företagets schema och en anställds egna tider använder — se ScheduleDays,
 * och lib/weekly-hours.ts som läser fälten.
 *
 * ActionDialog och inte FormDialog, eftersom sparandet kan misslyckas på ett
 * sätt administratören kan rätta: namnet är taget, eller stationen har
 * planerad tid och kan därför inte byta arbetsmoment. I FormDialog hade rutan
 * redan stängt när det svaret kom.
 */

export default function StationDialog({
  trigger,
  triggerTone = "secondary",
  title,
  submitLabel,
  action,
  stationId,
  name,
  momentId,
  moments,
  days,
  lockedMoment = false,
}: {
  trigger: string;
  triggerTone?: "primary" | "secondary" | "ghost";
  title: string;
  submitLabel: string;
  action: (
    previous: StationState,
    formData: FormData
  ) => Promise<StationState>;
  stationId?: string;
  name?: string;
  momentId?: string;
  moments: { id: string; name: string; active: boolean }[];
  days: ScheduleDayValue[];
  /**
   * Spärrar momentvalet. Sätts när stationen har planerad tid: ett byte skulle
   * tyst flytta varje ruta till en annan beräkningsrad. Servern vägrar ändå —
   * grinden ligger i planning.ts — men ett spärrat fält med en förklaring är
   * bättre än ett fel efter ett tryck.
   */
  lockedMoment?: boolean;
}) {
  return (
    <ActionDialog
      trigger={trigger}
      triggerTone={triggerTone}
      title={title}
      action={action}
      initial={{} as StationState}
      submitLabel={submitLabel}
    >
      {stationId && <input type="hidden" name="stationId" value={stationId} />}

      <Field label="Namn">
        <Input
          name="name"
          defaultValue={name}
          placeholder="Fräs 1"
          required
          autoFocus
        />
      </Field>

      <Field
        label="Arbetsmoment"
        hint={
          lockedMoment
            ? "Stationen har planerad tid. Stäng den och lägg upp en ny för ett annat moment"
            : undefined
        }
      >
        <Select
          name="momentId"
          defaultValue={momentId ?? ""}
          required
          disabled={lockedMoment}
        >
          <option value="" disabled>
            Välj moment
          </option>
          {moments.map((moment) => (
            <option key={moment.id} value={moment.id}>
              {moment.name}
              {moment.active ? "" : " (avaktiverat)"}
            </option>
          ))}
        </Select>
      </Field>

      {/* Ett spärrat fält skickas inte med formuläret. Värdet måste därför
          följa med ändå, annars läser servern ett tomt moment och vägrar
          spara ett namnbyte. */}
      {lockedMoment && momentId && (
        <input type="hidden" name="momentId" value={momentId} />
      )}

      <div>
        <p className="mb-2 text-[13px] font-medium text-neutral-700">
          Öppettider
        </p>
        <ScheduleDays initial={days} compact totalLabel="Öppet per vecka" />
      </div>
    </ActionDialog>
  );
}
