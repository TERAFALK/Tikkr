"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import ScheduleDays, { type ScheduleDayValue } from "./ScheduleDays";
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  dialogBody,
  dialogEdge,
  dialogSurface,
} from "@/components/ui";
import type { StationState } from "@/app/admin/(panel)/planering/actions";

/**
 * EN STATIONS ALLA ÅTGÄRDER, SAMLADE.
 *
 * Raden hade fem knappar bredvid varandra: Upp, Ner, Ändra, Stäng och Ta bort.
 * Var och en var en egen ruta med en egen trigger, och tillsammans blev de en
 * vägg som radbröts olika beroende på hur långt stationsnamnet var. Den
 * viktigaste uppgiften på raden — vilka tider stationen går — drunknade i dem.
 *
 * Nu äger den här komponenten hela raden:
 *
 *   Pilarna är små ikoner, inte knappar med ord, och VISAS BARA när momentet
 *   har mer än en station. En ensam fräs går inte att ordna mot något, och två
 *   grå pilar som aldrig kan tryckas såg mest ut som ett fel i tabellen.
 *   Ändra öppnar rutan med namn, moment och tider.
 *   TA BORT LIGGER I ÄNDRA-RUTAN, längst ned till vänster, där en farlig
 *   åtgärd hör hemma. Samma plats som i rutan för ett planerat jobb.
 *   Stäng och Öppna står kvar på raden, eftersom det är ett läge man byter
 *   ofta och inte något man letar efter.
 *
 * ── VARFÖR EN EGEN KOMPONENT OCH INTE ActionDialog ───────────────────────
 *
 * Ta bort behöver en egen bekräftelse, och den kan inte ligga inuti ändra-
 * rutan: ActionDialog renderar ett <form>, och ett formulär inuti ett annat
 * formulär är ogiltig HTML som webbläsaren tolkar hur den vill. Rutorna måste
 * alltså vara syskon, och då måste något äga dem båda.
 */

export interface StationRow {
  id: string;
  name: string;
  momentId: string;
  active: boolean;
  upcomingBlocks: number;
  days: ScheduleDayValue[];
}

export default function StationRowActions({
  station,
  moments,
  first,
  last,
  alone,
  saveAction,
  toggleAction,
  deleteAction,
  moveAction,
}: {
  station: StationRow;
  moments: { id: string; name: string; active: boolean }[];
  /** Först respektive sist INOM sitt arbetsmoment. Styr pilarna. */
  first: boolean;
  last: boolean;
  /** Ensam på sitt arbetsmoment. Då finns ingen ordning att ändra. */
  alone: boolean;
  saveAction: (
    previous: StationState,
    formData: FormData
  ) => Promise<StationState>;
  toggleAction: (
    previous: StationState,
    formData: FormData
  ) => Promise<StationState>;
  deleteAction: (
    previous: StationState,
    formData: FormData
  ) => Promise<StationState>;
  moveAction: (
    previous: StationState,
    formData: FormData
  ) => Promise<StationState>;
}) {
  const edit = useRef<HTMLDialogElement>(null);
  const confirm = useRef<HTMLDialogElement>(null);

  const [saveState, save] = useActionState<StationState, FormData>(
    saveAction,
    {}
  );
  const [removeState, remove] = useActionState<StationState, FormData>(
    deleteAction,
    {}
  );
  const [toggleState, toggle] = useActionState<StationState, FormData>(
    toggleAction,
    {}
  );
  const [moveState, move] = useActionState<StationState, FormData>(
    moveAction,
    {}
  );

  // Stängs bara när det gick igenom. Ett upptaget namn ska stå kvar med sitt
  // felmeddelande, inte försvinna och lämna kvar det man skrivit.
  useEffect(() => {
    if (saveState.ok) edit.current?.close();
  }, [saveState.ok]);

  useEffect(() => {
    if (removeState.ok) {
      confirm.current?.close();
      edit.current?.close();
    }
  }, [removeState.ok]);

  const locked = station.upcomingBlocks > 0;
  const error = toggleState.error ?? moveState.error;

  return (
    <div className="flex items-center justify-end gap-1">
      {error && (
        <span className="mr-2 max-w-64 text-right text-xs text-red-600">
          {error}
        </span>
      )}

      {/* Pilarna flyttar stationen inom sitt arbetsmoment. Grupperna står i
          bokstavsordning, så en station som flyttades förbi gruppens kant hade
          hamnat tillbaka där den stod. */}
      {!alone && (
        <form action={move} className="mr-1 flex flex-col">
          <input type="hidden" name="stationId" value={station.id} />
          <Arrow name="up" disabled={first} label="Flytta upp" />
          <Arrow name="down" disabled={last} label="Flytta ner" />
        </form>
      )}

      <Button type="button" tone="ghost" onClick={() => edit.current?.showModal()}>
        Ändra
      </Button>

      <form action={toggle}>
        <input type="hidden" name="stationId" value={station.id} />
        <input type="hidden" name="active" value={String(station.active)} />
        <ToggleButton open={station.active} />
      </form>

      {/* --- Ändra ------------------------------------------------------- */}
      <dialog
        ref={edit}
        className={`w-[min(42rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">
            {station.name}
          </h2>
        </div>

        <form action={save} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="stationId" value={station.id} />

          <div className={`${dialogBody} space-y-4 px-5 py-5`}>
            {saveState.error && <Alert>{saveState.error}</Alert>}

            <Field label="Namn">
              <Input name="name" defaultValue={station.name} required />
            </Field>

            <Field
              label="Arbetsmoment"
              hint={
                locked
                  ? "Stationen har planerad tid. Ta bort den och lägg upp en ny för ett annat moment"
                  : undefined
              }
            >
              <Select
                name="momentId"
                defaultValue={station.momentId}
                required
                disabled={locked}
              >
                {moments.map((moment) => (
                  <option key={moment.id} value={moment.id}>
                    {moment.name}
                    {moment.active ? "" : " (avaktiverat)"}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Ett spärrat fält skickas inte med formuläret. Värdet måste
                följa med ändå, annars läser servern ett tomt moment och
                vägrar spara ett namnbyte. */}
            {locked && (
              <input type="hidden" name="momentId" value={station.momentId} />
            )}

            <div>
              <p className="mb-2 text-[13px] font-medium text-neutral-700">
                Öppettider
              </p>
              <ScheduleDays
                initial={station.days}
                compact
                totalLabel="Öppet per vecka"
              />
            </div>
          </div>

          <div
            className={`${dialogEdge} flex items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
          >
            {/* TA BORT LIGGER HÄR, längst ned till vänster. En farlig åtgärd
                hör inte på raden bredvid de vanliga — där trycks den av
                misstag. Samma plats som i rutan för ett planerat jobb. */}
            <Button
              type="button"
              tone="danger"
              onClick={() => confirm.current?.showModal()}
            >
              Ta bort
            </Button>

            <div className="flex gap-2">
              <Button
                type="button"
                tone="secondary"
                onClick={() => edit.current?.close()}
              >
                Avbryt
              </Button>
              <SaveButton />
            </div>
          </div>
        </form>
      </dialog>

      {/* --- Ta bort ----------------------------------------------------- */}
      <dialog
        ref={confirm}
        className={`w-[min(28rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className="border-b border-neutral-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            Ta bort {station.name}
          </h2>
        </div>

        <form action={remove}>
          <input type="hidden" name="stationId" value={station.id} />

          <div className="space-y-3 px-5 py-5">
            {removeState.error && <Alert>{removeState.error}</Alert>}

            <p className="text-[13px] leading-relaxed text-neutral-600">
              {locked
                ? `Stationen och ${station.upcomingBlocks} planerade jobb tas bort. Jobbens tid går tillbaka till Oplacerat och kan placeras om.`
                : "Stationen tas bort. Vill du bara pausa den, stäng den i stället."}
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
            <Button
              type="button"
              tone="secondary"
              onClick={() => confirm.current?.close()}
            >
              Avbryt
            </Button>
            <RemoveButton />
          </div>
        </form>
      </dialog>
    </div>
  );
}

/** En av pilarna som flyttar stationen. Ikon och inte ord, för att spara bredd. */
function Arrow({
  name,
  disabled,
  label,
}: {
  name: "up" | "down";
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      name="direction"
      value={name}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded px-1.5 text-[11px] leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900 disabled:text-neutral-200 disabled:hover:bg-transparent disabled:hover:text-neutral-200"
    >
      {name === "up" ? "▲" : "▼"}
    </button>
  );
}

function ToggleButton({ open }: { open: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="secondary" disabled={pending}>
      {open ? "Stäng" : "Öppna"}
    </Button>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : "Spara"}
    </Button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" tone="danger" disabled={pending}>
      {pending ? "Tar bort…" : "Ta bort"}
    </Button>
  );
}
