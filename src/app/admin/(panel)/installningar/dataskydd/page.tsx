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
          description="GDPR ger en anställd rätt att få ut all registrerad information om sig själv."
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
          description="GDPR ger en anställd rätt att bli glömd."
        />

        <div className="space-y-5 p-5">
          <Alert tone="warning">
            <strong className="block">
              Personen tas bort som namn — den registrerade tiden finns kvar.
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
              hint="Bekräftelse krävs eftersom åtgärden inte kan ångras."
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
        <CardHeader title="Vad Tikkr sparar" />
        <div className="space-y-2 p-5 text-[13px] leading-relaxed text-neutral-600">
          <p>
            Om varje stämpling sparas tidpunkt, vilken order och vilket
            arbetsmoment, vilken skärm trycket gjordes på och från vilken
            IP-adress. Det sista finns för att en felaktig stämpling ska gå att
            reda ut i efterhand.
          </p>
          <p>
            Tikkr registrerar ingen löneinformation, frånvaro eller sjukdom. Systemet avser tidsunderlag för fakturering av kundordrar.
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
