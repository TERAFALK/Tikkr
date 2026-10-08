import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import LogoUpload from "@/components/admin/LogoUpload";
import MarkupForm from "@/components/admin/MarkupForm";
import SaveForm from "@/components/admin/SaveForm";
import { ButtonLink, Card, CardHeader, Field, Input } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { saveCompany, saveMarkup } from "./actions";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const { companyId, db } = await requireAdmin();

  const [company, employees, orders, devices] = await Promise.all([
    unsafeGlobalPrisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        createdAt: true,
        subscriptionStatus: true,
        markupPercent: true,
        logoSquareMimeType: true,
        logoWideMimeType: true,
        logoUpdatedAt: true,
      },
    }),
    db.employee.count({ where: { active: true } }),
    db.order.count({ where: { status: "OPEN" } }),
    db.kioskDevice.count({ where: { tokenHash: { not: null } } }),
  ]);

  if (!company) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Företagsuppgifter"
        />
        <SaveForm action={saveCompany}>
          <Field label="Företagsnamn">
            <Input name="name" defaultValue={company.name} required />
          </Field>
        </SaveForm>
      </Card>

      <Card>
        <CardHeader
          title="Kalkyl"
          description="Påslag från kostnad till pris. Timkostnad sätts per arbetsmoment."
        />
        <MarkupForm action={saveMarkup} markupPercent={company.markupPercent} />
      </Card>

      {/* EN RUTA FÖR BÅDA BILDERNA, i två spalter. De låg i två rutor med en
          rubrik var, och varje ruta rymde ett filfält. Det blev två skärmhöjder
          för två bilder man byter en gång, och de hör ihop: samma logotyp i två
          format. */}
      <Card>
        <CardHeader title="Logotyper" />
        <div className="grid divide-y divide-neutral-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div>
            <LogoTitle
              title="Märke"
              hint="Kvadratisk. Panel och stämplingsskärm."
            />
            <LogoUpload
              variant="square"
              hasLogo={Boolean(company.logoSquareMimeType)}
              updatedAt={company.logoUpdatedAt?.getTime().toString() ?? null}
            />
          </div>
          <div>
            <LogoTitle
              title="Utskrifter"
              hint="Bred. Överst på kundernas underlag."
            />
            <LogoUpload
              variant="wide"
              hasLogo={Boolean(company.logoWideMimeType)}
              updatedAt={company.logoUpdatedAt?.getTime().toString() ?? null}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Om arbetsytan"
          action={
            <ButtonLink href="/admin/kom-igang" tone="secondary">
              Kom igång-guiden
            </ButtonLink>
          }
        />
        <dl className="divide-y divide-neutral-100 text-[13px]">
          <Row label="Upplagt" value={formatDate(company.createdAt)} />
          <Row label="Aktiva anställda" value={String(employees)} />
          <Row label="Öppna ordrar" value={String(orders)} />
          <Row label="Kopplade skärmar" value={String(devices)} />
          <Row
            label="Prenumeration"
            value={
              company.subscriptionStatus === "ACTIVE"
                ? "Aktiv"
                : company.subscriptionStatus === "TRIALING"
                  ? "Provperiod"
                  : "Vilande"
            }
          />
        </dl>
      </Card>
    </div>
  );
}

function LogoTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="px-5 pt-4">
      <h3 className="text-[13px] font-medium text-neutral-900">{title}</h3>
      <p className="mt-0.5 text-[13px] text-neutral-500">{hint}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}
