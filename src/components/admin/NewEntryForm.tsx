"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  addEntry,
  type EntryFormState,
} from "@/app/admin/(panel)/stamplingar/actions";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
} from "@/components/ui";

interface Option {
  id: string;
  label: string;
}

/**
 * Lägger in en stämpling som saknas.
 *
 * Behövs när någon glömt stämpla IN — då finns ingen post alls att rätta i
 * granskningsvyn, och timmarna går annars inte att fakturera.
 *
 * Felmeddelanden visas här istället för att posten tyst inte skapas. Krockar
 * tiden med ett annat pass är det något administratören behöver veta och
 * agera på, inte något som ska försvinna.
 */
export default function NewEntryForm({
  employees,
  orders,
  moments,
}: {
  employees: Option[];
  orders: Option[];
  moments: Option[];
}) {
  const [state, action] = useActionState<EntryFormState, FormData>(addEntry, {});

  return (
    <Card className="mb-6">
      <CardHeader
        title="Lägg till stämpling"
        description="För tid som aldrig blev stämplad. Posten märks som manuell."
      />

      <form action={action} className="space-y-4 p-5">
        {state.error && <Alert>{state.error}</Alert>}
        {state.ok && <Alert tone="info">{state.ok}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Anställd">
            <Select name="employeeId" required defaultValue="">
              <option value="" disabled>
                Välj…
              </option>
              {employees.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Order">
            <Select name="orderId" required defaultValue="">
              <option value="" disabled>
                Välj…
              </option>
              {orders.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Arbetsmoment">
            <Select name="momentId" required defaultValue="">
              <option value="" disabled>
                Välj…
              </option>
              {moments.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Instämplad">
            <Input type="datetime-local" name="clockInAt" required />
          </Field>

          <Field label="Utstämplad">
            <Input type="datetime-local" name="clockOutAt" required />
          </Field>

          <div className="flex items-end">
            <SubmitButton />
          </div>
        </div>
      </form>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Lägger till…" : "Lägg till"}
    </Button>
  );
}
