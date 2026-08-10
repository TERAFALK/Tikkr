import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { anonymizeEmployee, saveSettings } from "./actions";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/London",
  "UTC",
];

export default async function SettingsPage() {
  const { db, companyId } = await requireAdmin();

  const [company, employees] = await Promise.all([
    unsafeGlobalPrisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, autoCloseAt: true, timezone: true },
    }),
    db.employee.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!company) return null;

  return (
    <>
      <PageHeader
        title="Inställningar"
        description="Gäller hela företaget."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-1 text-lg font-semibold">Företag och tider</h2>
          <p className="mb-5 text-sm text-slate-500">
            Klockslaget styr när glömda stämplingar stängs automatiskt.
          </p>

          <form action={saveSettings} className="space-y-4">
            <Field label="Företagsnamn">
              <Input name="name" defaultValue={company.name} required />
            </Field>

            <Field
              label="Stäng glömda stämplingar klockan"
              hint="Skrivs som HH:MM. Har någon inte stämplat ut vid den här tiden stängs posten och flaggas för granskning — den försvinner alltså inte, men gissas."
            >
              <Input
                name="autoCloseAt"
                defaultValue={company.autoCloseAt}
                placeholder="18:00"
                pattern="[0-9]{1,2}:[0-9]{2}"
                required
              />
            </Field>

            <Field
              label="Tidszon"
              hint="Avgör vad klockslaget ovan betyder. Utan rätt tidszon glider tiden en timme vid sommar- och vintertid."
            >
              <Select name="timezone" defaultValue={company.timezone}>
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>

            <Button type="submit">Spara</Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 text-lg font-semibold">Radera personuppgifter</h2>
          <p className="mb-5 text-sm text-slate-500">
            GDPR ger en anställd rätt att bli glömd.
          </p>

          <Alert tone="info">
            Personen tas bort som namn, men den registrerade tiden finns kvar.
            Anledningen är att tiden är underlag för fakturor, som enligt
            bokföringslagen måste sparas i sju år. Efter anonymisering går
            tiden att fakturera men inte längre att koppla till en namngiven
            person.
            <strong className="mt-2 block">Detta går inte att ångra.</strong>
          </Alert>

          <form action={anonymizeEmployee} className="mt-5 space-y-4">
            <Field label="Välj anställd">
              <Select name="employeeId" required defaultValue="">
                <option value="" disabled>
                  Välj…
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Button type="submit" tone="danger">
              Anonymisera
            </Button>
          </form>

          <p className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-500">
            Behöver du lämna ut all tid för en person — också en rättighet
            enligt GDPR — filtrerar du på personen i rapporterna och
            exporterar till Excel.
          </p>
          <ButtonLink href="/admin/rapporter" tone="secondary" className="mt-3">
            Till rapporter
          </ButtonLink>
        </Card>
      </div>
    </>
  );
}
