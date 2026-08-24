"use client";

import { useActionState } from "react";
import {
  changeSubscription,
  type SubscriptionFormState,
} from "@/app/plattform/[companyId]/actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

/**
 * Manuell ändring av prenumerationsstatus i plattformspanelen.
 *
 * Avsedd för företag som betalar mot faktura eller har en förlängd
 * provperiod. Företag med en prenumeration hos Stripe styrs därifrån.
 */
export default function SubscriptionOverrideForm({
  companyId,
  currentStatus,
  managedByStripe,
}: {
  companyId: string;
  currentStatus: string;
  managedByStripe: boolean;
}) {
  const [state, action] = useActionState<SubscriptionFormState, FormData>(
    changeSubscription,
    {}
  );

  if (managedByStripe) {
    return (
      <Alert tone="info">
        Prenumerationen hanteras av Stripe. Ändringar av status, antal licenser
        och betalningsintervall görs i Stripe och uppdateras här automatiskt.
        Manuell ändring är avstängd för att de två inte ska visa olika uppgifter.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="info">{state.ok}</Alert>}

      <input type="hidden" name="companyId" value={companyId} />

      <Field label="Status">
        <Select name="status" defaultValue={currentStatus}>
          <option value="TRIALING">Provperiod</option>
          <option value="ACTIVE">Aktiv</option>
          <option value="PAST_DUE">Obetald</option>
          <option value="CANCELED">Avslutad</option>
        </Select>
      </Field>

      <Field
        label="Anledning"
        hint="Sparas i loggen med ändringen och vem som gjorde den."
      >
        <Input
          name="reason"
          placeholder="Fakturakund, avtal till och med 2026-12-31"
          required
        />
      </Field>

      <Button type="submit">Spara</Button>
    </form>
  );
}
