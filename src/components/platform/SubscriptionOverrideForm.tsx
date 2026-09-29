"use client";

import {
  changeSubscription,
  type SubscriptionFormState,
} from "@/app/plattform/kunder/[companyId]/actions";
import ActionDialog from "@/components/ui/ActionDialog";
import { Field, Input, Select } from "@/components/ui";

/**
 * Manuell ändring av prenumerationsstatus.
 *
 * Avsedd för företag som betalar mot faktura eller har en förlängd
 * provperiod. Företag med en prenumeration hos Stripe styrs därifrån, och då
 * ritas knappen inte alls — statusen står ändå på kortet.
 *
 * Ligger i en ruta och inte utfällt på sidan. Ett formulär som alltid syns
 * läses som något man förväntas fylla i, och kundsidan hade fem sådana ovanpå
 * varandra.
 */
export default function SubscriptionOverrideForm({
  companyId,
  currentStatus,
}: {
  companyId: string;
  currentStatus: string;
}) {
  return (
    <ActionDialog<SubscriptionFormState>
      trigger="Ändra status"
      title="Ändra prenumerationsstatus"
      action={changeSubscription}
      initial={{}}
      submitLabel="Spara"
    >
      <input type="hidden" name="companyId" value={companyId} />

      <Field label="Status">
        <Select name="status" defaultValue={currentStatus}>
          <option value="TRIALING">Provperiod</option>
          <option value="ACTIVE">Aktiv</option>
          <option value="PAST_DUE">Obetald</option>
          <option value="CANCELED">Avslutad</option>
        </Select>
      </Field>

      <Field label="Anledning" hint="Sparas i åtgärdsloggen">
        <Input
          name="reason"
          placeholder="Fakturakund, avtal till och med 2026-12-31"
          required
        />
      </Field>
    </ActionDialog>
  );
}
