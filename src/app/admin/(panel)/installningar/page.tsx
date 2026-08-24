import { requireAdmin } from "@/lib/admin-session";
import { unsafeGlobalPrisma } from "@/lib/db";
import LogoUpload from "@/components/admin/LogoUpload";
import { Button, ButtonLink, Card, CardHeader, Field, Input } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { saveCompany } from "./actions";

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
          description="Företagsnamnet visas på stämplingsskärmarna och i exporterade underlag."
        />
        <form action={saveCompany} className="max-w-md space-y-4 p-5">
          <Field label="Företagsnamn">
            <Input name="name" defaultValue={company.name} required />
          </Field>
          <Button type="submit">Spara</Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Märke"
          description="Kvadratisk bild som visas i panelen och på stämplingsskärmen. Bilden fyller hela ytan."
        />
        <LogoUpload
          variant="square"
          hasLogo={Boolean(company.logoSquareMimeType)}
          updatedAt={company.logoUpdatedAt?.getTime().toString() ?? null}
        />
      </Card>

      <Card>
        <CardHeader
          title="Logotyp för utskrifter"
          description="Placeras överst på underlag som skickas till era kunder. En bred bild med företagsnamnet rekommenderas."
        />
        <LogoUpload
          variant="wide"
          hasLogo={Boolean(company.logoWideMimeType)}
          updatedAt={company.logoUpdatedAt?.getTime().toString() ?? null}
        />
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}
