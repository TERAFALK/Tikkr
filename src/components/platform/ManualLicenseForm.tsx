"use client";

import {
  changeLicenseCount,
  type LicenseFormState,
} from "@/app/plattform/kunder/[companyId]/actions";
import ActionDialog from "@/components/ui/ActionDialog";
import { Field, Input } from "@/components/ui";

/**
 * Antal licenser för en fakturakund.
 *
 * Ett lägre antal än de upplagda skärmarna är tillåtet. Vi stänger ingen skärm
 * av oss själva, och vilken som ska bort är kundens beslut — se licenses.ts.
 */
export default function ManualLicenseForm({
  companyId,
  current,
  used,
}: {
  companyId: string;
  current: number;
  used: number;
}) {
  return (
    <ActionDialog<LicenseFormState>
      trigger="Ändra antal"
      title="Ändra antal licenser"
      description={`${used} av ${current} används. Ett lägre antal stänger ingen skärm.`}
      action={changeLicenseCount}
      initial={{}}
      submitLabel="Spara"
    >
      <input type="hidden" name="companyId" value={companyId} />

      <div className="w-28">
        <Field label="Antal">
          <Input
            type="number"
            name="licenses"
            min={1}
            max={100}
            defaultValue={current}
            required
          />
        </Field>
      </div>

      <Field label="Anledning" hint="Sparas i åtgärdsloggen">
        <Input
          name="reason"
          placeholder="Fakturakund, avtalat tre skärmar"
          required
        />
      </Field>
    </ActionDialog>
  );
}
