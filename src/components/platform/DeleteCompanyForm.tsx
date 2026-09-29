"use client";

import {
  removeCompany,
  type DeleteCompanyState,
} from "@/app/plattform/kunder/[companyId]/actions";
import ActionDialog from "@/components/ui/ActionDialog";
import { Alert, Field, Input } from "@/components/ui";

/**
 * RADERING AV ETT KUNDFÖRETAG.
 *
 * Ligger i en ruta bakom en knapp, längst ned och avskild från allt annat. Den
 * ska gå att hitta av den som söker den och aldrig råkas ut för av den som
 * skummar sidan.
 *
 * Företagsnamnet måste skrivas för hand. En kryssruta klickas bort utan att
 * läsas; ett namn tvingar ögat att stanna vid vilket företag det gäller.
 */
export default function DeleteCompanyForm({
  companyId,
  companyName,
  managedByStripe,
}: {
  companyId: string;
  companyName: string;
  managedByStripe: boolean;
}) {
  return (
    <ActionDialog<DeleteCompanyState>
      trigger="Radera företaget"
      triggerTone="danger"
      title={`Radera ${companyName}`}
      action={removeCompany}
      initial={{}}
      submitLabel="Radera permanent"
      submitTone="danger"
      pendingLabel="Raderar…"
      disabled={managedByStripe}
    >
      <input type="hidden" name="companyId" value={companyId} />

      {managedByStripe ? (
        <Alert tone="warning">
          Företaget har en aktiv prenumeration hos Stripe. Avsluta den där
          först, annars fortsätter faktureringen mot en kund som inte längre
          finns.
        </Alert>
      ) : (
        <Alert tone="warning">
          Anställda, ordrar, arbetsmoment, stämplingar, administratörer och
          skärmar raderas. Åtgärden går inte att ångra. Enda återläsningen är
          nattens säkerhetskopia.
        </Alert>
      )}

      <Field label={`Skriv ${companyName} för att bekräfta`}>
        <Input name="confirmName" autoComplete="off" required />
      </Field>

      <Field label="Anledning" hint="Sparas i åtgärdsloggen">
        <Input
          name="reason"
          placeholder="Avslutat kundförhållande, begärd radering"
          required
        />
      </Field>
    </ActionDialog>
  );
}
