"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { EmployeeState } from "@/app/admin/(panel)/anstallda/actions";
import {
  Alert,
  Button,
  dialogBody,
  dialogEdge,
  dialogSurface,
  Field,
  Input,
} from "@/components/ui";
import EmployeeAvatar from "@/components/ui/EmployeeAvatar";
import ScheduleDays, {
  type ScheduleDayValue,
} from "@/components/admin/ScheduleDays";

/**
 * RUTAN DÄR EN ANSTÄLLD LÄGGS UPP ELLER ÄNDRAS.
 *
 * Namn, anställningsnummer och bild i ETT formulär. Bilden låg tidigare i en
 * egen ruta, vilket gjorde att man fick öppna två ställen för att lägga upp en
 * person ordentligt — och det andra stället var lätt att aldrig hitta.
 *
 * ARBETSTIDER FINNS HÄR NUMERA (tillagt 2026-09-29), för den som inte går på
 * företagets vanliga schema. De ligger bakom en kryssruta och inte framme:
 * de flesta går på standardtiderna, och sju dagsrader i varje ruta skulle
 * göra det vanliga fallet långsammare för att det ovanliga finns.
 *
 * Utan kryss skickas inga dagsfält alls, och servern läser det som att
 * personen ska gå på företagets standard igen. Det är samma sak som att
 * kryssa ur: formuläret säger vad som gäller, inte vad som ändrats.
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
  scheduleDays,
  payroll = false,
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
    costRateOre: number | null;
    hasPhoto: boolean;
    /** true när en kod för flexsaldot redan är satt. Koden går inte att läsa. */
    hasFlexCode: boolean;
  };
  /**
   * Personens egna arbetstider, eller null när hen går på företagets schema.
   * Utelämnad helt när företaget inte har lönemodulen, och då visas avsnittet
   * inte alls.
   */
  scheduleDays?: ScheduleDayValue[] | null;
  /**
   * true när företaget har löneunderlaget.
   *
   * Styr BÅDA de lönerelaterade fälten i rutan: koden för flexsaldot och de
   * egna arbetstiderna. Utan modulen finns ingetdera, och serveråtgärden
   * frågar själv om modulen innan den skriver något av dem.
   */
  payroll?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, submit] = useActionState<EmployeeState, FormData>(action, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [ownHours, setOwnHours] = useState(Boolean(scheduleDays?.length));

  function open() {
    setPreview(null);
    setRemovePhoto(false);
    setOwnHours(Boolean(scheduleDays?.length));
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

      {/* Bred nog för arbetstiderna: en dagrad är två klockslagsfält bredvid
          varandra, och de ska inte behöva radbrytas. */}
      <dialog
        ref={dialog}
        className={`w-[min(42rem,calc(100vw-2rem))] ${dialogSurface}`}
      >
        <div className={`${dialogEdge} border-b border-neutral-200 px-5 py-4`}>
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
              {description}
            </p>
          )}
        </div>

        <form action={submit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${dialogBody} space-y-4 px-5 py-5`}>
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
              hint="Valfritt"
            >
              <Input
                name="employeeNumber"
                defaultValue={employee?.employeeNumber ?? ""}
                placeholder="1042"
              />
            </Field>

            <Field
              label="Timkostnad (kr/tim)"
              hint="Valfritt. Läggs till arbetsmomentets kostnad"
            >
              <Input
                name="costRate"
                inputMode="decimal"
                placeholder="350"
                defaultValue={
                  employee?.costRateOre == null
                    ? ""
                    : String(employee.costRateOre / 100).replace(".", ",")
                }
              />
            </Field>

            {/* KODEN FÖR FLEXSALDOT.
                
                Hör till löneunderlaget och visas bara för den som har det.
                Fältet är tomt varje gång rutan öppnas: en sparad kod går inte
                att läsa tillbaka, bara att ersätta. */}
            {payroll && (
              <div className="border-t border-neutral-200 pt-4">
                <Field
                  label="Kod för flexsaldo"
                  hint={
                    employee?.hasFlexCode
                      ? "En kod är satt. Skriv en ny för att ersätta den"
                      : "4 till 8 siffror. Tomt betyder ingen kod"
                  }
                >
                  <Input
                    name="flexCode"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={employee?.hasFlexCode ? "••••" : "1234"}
                  />
                </Field>

                {employee?.hasFlexCode && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      name="removeFlexCode"
                      className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
                    />
                    Ta bort koden
                  </label>
                )}
              </div>
            )}

            {payroll && (
              <div className="border-t border-neutral-200 pt-4">
                <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={ownHours}
                    onChange={(event) => setOwnHours(event.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>
                    <span className="block font-medium text-neutral-900">
                      Egna arbetstider
                    </span>
                    <span className="block text-neutral-500">
                      Utan kryss gäller företagets schema
                    </span>
                  </span>
                </label>

                {ownHours && (
                  <div className="mt-3">
                    <ScheduleDays initial={scheduleDays ?? []} compact />
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className={`${dialogEdge} flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-3`}
          >
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
