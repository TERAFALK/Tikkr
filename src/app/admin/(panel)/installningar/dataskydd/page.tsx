import Link from "next/link";
import { isOwner, requireAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import SaveForm from "@/components/admin/SaveForm";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { anonymizeEmployee } from "../actions";

export const metadata = { title: "Dataskydd · Tikkr" };

export const dynamic = "force-dynamic";

export default async function DataProtectionPage() {
  const session = await requireAdmin();
  const { db, companyId } = session;
  // Anonymiseringen gör bara ägaren, se isOwner. Övriga ser varningen men
  // inte formuläret.
  const owner = isOwner(session);

  // VAD SOM SPARAS BEROR PÅ TILLVALET, och texten nedan måste säga rätt sak.
  // Med löneunderlaget registreras frånvaro med orsak, vilket kan vara en
  // uppgift om hälsa. Utan det finns ingen sådan uppgift i systemet alls.
  const payroll = await hasModule(companyId, "PAYROLL");
  // Planeringens pass bär en person. Texten nämner dem bara när de kan finnas,
  // av samma skäl som löneunderlagets rader ovan.
  const planning = await hasModule(companyId, "PLANNING");

  const employees = await db.employee.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, active: true },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Lämna ut en persons uppgifter"
          help="gdpr"
          description="Allt som registrerats om en anställd."
        />
        {/* Ett vanligt formulär med GET, utan skript: valet hamnar i
            adressen och rutten svarar med en fil. Se person-export.ts. */}
        <form
          action="/api/admin/export/person"
          method="get"
          className="max-w-md space-y-4 p-5"
        >
          <Field label="Anställd">
            <Select name="employeeId" required defaultValue="">
              <option value="" disabled>
                Välj person…
              </option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" tone="secondary">
            Ta ut registerutdrag
          </Button>
        </form>
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
            Tiden är fakturaunderlag och måste sparas i sju år enligt
            bokföringslagen. Efteråt går den att fakturera men inte att koppla
            till en namngiven person.
            <span className="mt-1.5 block">Detta går inte att ångra.</span>
          </Alert>

          {owner ? (
          <SaveForm
            action={anonymizeEmployee}
            submitLabel="Anonymisera personen"
            pendingLabel="Anonymiserar…"
            tone="danger"
            className="max-w-md space-y-4"
          >
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
          </SaveForm>
          ) : (
            <p className="text-[13px] text-neutral-600">
              Anonymiseringen görs av arbetsytans ägare.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Sparade uppgifter" />
        <div className="space-y-2 p-5 text-[13px] leading-relaxed text-neutral-600">
          <p>
            Per stämpling sparas tidpunkt, order, arbetsmoment, skärm och
            IP-adress.
          </p>
          {payroll ? (
            <>
              <p>
                Med löneunderlaget registreras även arbetstidsschema, raster
                och frånvaro med orsak.
              </p>
              <p>
                Frånvaro med orsak kan vara en uppgift om hälsa eller familj.
                Den registreras bara i panelen, aldrig på stämplingsskärmen,
                och varje post bär vem som skrev in den.
              </p>
              <p>Inga belopp, lönearter eller löneavdrag registreras.</p>
            </>
          ) : (
            <p>
              Ingen löneinformation, frånvaro eller sjukdom registreras.
            </p>
          )}
          {planning && (
            <p>
              Med planeringen registreras planerade pass per anställd, med
              order, arbetsmoment och tid, och anställdas egna arbetstider.
            </p>
          )}
          <p>
            Ert företag är personuppgiftsansvarigt och TERAFALK AB är
            personuppgiftsbiträde. Villkoren för det står i{" "}
            <Link
              href="/personuppgiftsbitradesavtal"
              className="font-medium text-link hover:underline"
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
