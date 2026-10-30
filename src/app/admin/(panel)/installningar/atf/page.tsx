import { requireAdmin } from "@/lib/admin-session";
import { requireModule } from "@/lib/company-modules";
import { unsafeGlobalPrisma } from "@/lib/db";
import SaveForm from "@/components/admin/SaveForm";
import {
  Card,
  CardHeader,
  Field,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { COLLECTIVE_AGREEMENTS, findAgreement } from "@/lib/collective-agreements";
import { saveAtfAgreement } from "./actions";

export const metadata = { title: "Arbetstidsförkortning · Tikkr" };

/**
 * ARBETSTIDSFÖRKORTNING (tillagt 2026-10-13).
 *
 * Kollektivavtalet som ATF-underlaget räknas efter. Underlaget visas på
 * tidrapporten och månadsutskriften för en hel kalendermånad; Tikkr håller
 * inget saldo. Se src/lib/atf.ts.
 *
 * Avtalens värden står i en tabell under valet. Det är de talen räkningen
 * använder, och den som stämmer av mot avtalet ska inte behöva leta i koden.
 */

export const dynamic = "force-dynamic";

export default async function AtfSettingsPage() {
  const session = await requireAdmin();
  await requireModule(session, "PAYROLL");

  const company = await unsafeGlobalPrisma.company.findUnique({
    where: { id: session.companyId },
    select: { atfAgreement: true },
  });

  const agreement = findAgreement(company?.atfAgreement);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Arbetstidsförkortning" help="tidrapport" />

        <SaveForm action={saveAtfAgreement}>
          <Field
            label="Kollektivavtal"
            hint="Arbetstidsformen sätts per anställd under Anställda"
          >
            <Select name="atfAgreement" defaultValue={agreement?.key ?? ""}>
              <option value="">Ingen ATF</option>
              {COLLECTIVE_AGREEMENTS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
        </SaveForm>

        {agreement && (
          <div className="border-t border-neutral-200">
            <Table>
              <thead>
                <tr>
                  <Th>Arbetstidsform</Th>
                  <Th numeric>Minuter per vecka</Th>
                  <Th numeric>Heltid, timmar per vecka</Th>
                </tr>
              </thead>
              <tbody>
                {agreement.forms.map((form) => (
                  <Tr key={form.key}>
                    <Td>{form.label}</Td>
                    <Td numeric>{form.minutesPerWeek}</Td>
                    <Td numeric>{form.fullTimeHoursPerWeek}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-500">
              {agreement.source}, {agreement.validFrom} – {agreement.validTo}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
