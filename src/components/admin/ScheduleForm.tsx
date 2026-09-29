"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ScheduleFormState } from "@/app/admin/(panel)/installningar/schema/actions";
import { Alert, Button, Card, CardHeader } from "@/components/ui";
import { SavedNote } from "@/components/admin/SaveForm";
import ScheduleDays, {
  type ScheduleDayValue,
} from "@/components/admin/ScheduleDays";

/**
 * FÖRETAGETS VECKOSCHEMA.
 *
 * Schemat ger den PLANERADE tiden, och det är den siffran flexsaldot mäts mot.
 *
 * Fälten ligger i ScheduleDays, som också står i rutan där en enskild anställd
 * får egna tider. Den som ändrar ett fältnamn ändrar det på ett ställe, och
 * servern läser båda formulären med samma kod.
 */

export type { ScheduleDayValue };

export default function ScheduleForm({
  action,
  initial,
}: {
  action: (
    previous: ScheduleFormState,
    formData: FormData
  ) => Promise<ScheduleFormState>;
  initial: ScheduleDayValue[];
}) {
  const [state, submit] = useActionState<ScheduleFormState, FormData>(
    action,
    {}
  );

  return (
    <form action={submit}>
      <Card>
        <CardHeader title="Veckoschema" />

        <div className="space-y-3 p-5">
          {state.error && <Alert>{state.error}</Alert>}
          <ScheduleDays initial={initial} />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
          {state.savedAt && <SavedNote>Sparat</SavedNote>}
          <SaveButton />
        </div>
      </Card>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sparar…" : "Spara schema"}
    </Button>
  );
}
