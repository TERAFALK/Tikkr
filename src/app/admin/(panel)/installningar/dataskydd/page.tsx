import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { anonymizeEmployee } from "../actions";

export const dynamic = "force-dynamic";

export default async function DataProtectionPage() {
  const { db } = await requireAdmin();

  const employees = await db.employee.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, active: true },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Lämna ut en persons uppgifter"
          description="Allt som registrerats om en anställd."
        />
        <div className="space-y-4 p-5 text-[13px] text-neutral-600">
          <p>
            Filtrera på personen i rapporterna och exportera till Excel. Filen
            innehåller varje stämpling med tidpunkt, order och arbetsmoment.
          </p>
          <ButtonLink href="/admin/rapporter" tone="secondary">
            Till rapporter
          </ButtonLink>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Radera personuppgifter"
          description="Namn och nummer ersätts. Tiden står kvar."
        />

        <div className="space-y-5 p-5">
          <Alert tone="warning">
            <strong className="block">
              Personen tas bort som namn. Den registrerade tiden finns kvar.
            </strong>
            Tiden är underlag för fakturor, och fakturaunderlag måste enligt
            bokföringslagen sparas i sju år. De två kraven krockar, och
            anonymisering är det som uppfyller båda: tiden går att fakturera men
            går inte längre att koppla till en namngiven person.
            <span className="mt-1.5 block">Detta går inte att ångra.</span>
          </Alert>

          <form action={anonymizeEmployee} className="max-w-md space-y-4">
            <Field label="Anställd">
              <Select name="employeeId" required defaultValue="">
                <option value="" disabled>
                  Välj person…
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                    {employee.active ? "" : " (avaktiverad)"}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Skriv ANONYMISERA för att bekräfta"
              hint="Kan inte ångras"
            >
              <Input name="confirm" placeholder="ANONYMISERA" required />
            </Field>

            <Button type="submit" tone="danger">
              Anonymisera personen
            </Button>
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sparade uppgifter" />
        <div className="space-y-2 p-5 text-[13px] leading-relaxed text-neutral-600">
          <p>
            Per stämpling sparas tidpunkt, order, arbetsmoment, skärm och
            IP-adress.
          </p>
          <p>
            Ingen löneinformation, frånvaro eller sjukdom registreras.
          </p>
          <p>
            Ert företag är personuppgiftsansvarigt och TERAFALK AB är
            personuppgiftsbiträde. Villkoren för det står i{" "}
            <Link
              href="/personuppgiftsbitradesavtal"
              className="font-medium text-blue-600 hover:underline"
            >
              personuppgiftsbiträdesavtalet
            </Link>
            , tillsammans med vilka underleverantörer som anlitas och vilka
            säkerhetsåtgärder som är vidtagna.
          </p>
        </div>
      </Card>
    </div>
  );
}
