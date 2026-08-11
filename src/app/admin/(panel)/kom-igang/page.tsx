import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { getOnboardingState, SUGGESTED_MOMENTS } from "@/lib/onboarding";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { addEmployees, addMoments, addOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { db, companyName } = await requireAdmin();
  const state = await getOnboardingState(db);

  const [employees, moments, orders] = await Promise.all([
    db.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.workMoment.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.order.findMany({
      where: { status: "OPEN" },
      orderBy: { orderNumber: "asc" },
      select: { id: true, orderNumber: true, customerName: true },
    }),
  ]);

  const alreadySuggested = new Set(moments.map((moment) => moment.name));

  return (
    <>
      <PageHeader
        title={state.ready ? "Klart att använda" : "Kom igång"}
        description={
          state.ready
            ? `${companyName} har allt som behövs. Skärmen är redo att stämpla på.`
            : `Fyra steg innan ${companyName} kan börja stämpla. Tar några minuter.`
        }
        action={
          state.ready ? (
            <ButtonLink href="/admin">Till översikten</ButtonLink>
          ) : undefined
        }
      />

      <Progress state={state} />

      {/* Steg 1 — anställda */}
      <StepCard
        number={1}
        title="Lägg upp anställda"
        description="Namnen blir knappar på stämplingsskärmen. Skriv dem som folk känner igen dem, inte som de står i personalsystemet."
        done={state.steps[0].done}
      >
        <form action={addEmployees} className="space-y-3">
          <Field
            label="Ett namn per rad"
            hint="Klistra gärna in en lista du redan har. Dubbletter hoppas över."
          >
            <textarea
              name="names"
              rows={5}
              placeholder={"Anna Andersson\nBjörn Bergqvist\nCarina Cederlund"}
              className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </Field>
          <Button type="submit">Lägg till</Button>
        </form>

        {employees.length > 0 && (
          <ChipList
            label={`${employees.length} upplagda`}
            items={employees.map((employee) => employee.name)}
            href="/admin/anstallda"
          />
        )}
      </StepCard>

      {/* Steg 2 — arbetsmoment */}
      <StepCard
        number={2}
        title="Lägg upp arbetsmoment"
        description="Vad tiden läggs på. Håll listan kort — många moment gör skärmen svårare att använda och rapporterna svårare att läsa."
        done={state.steps[1].done}
      >
        <form action={addMoments} className="space-y-4">
          <div>
            <p className="mb-2 text-[13px] font-medium text-neutral-700">
              Vanliga moment — kryssa i det som passar
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_MOMENTS.filter(
                (name) => !alreadySuggested.has(name)
              ).map((name) => (
                <label
                  key={name}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[13px] hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    name="suggested"
                    value={name}
                    className="h-3.5 w-3.5 rounded border-neutral-300 text-blue-600 focus:ring-blue-600"
                  />
                  {name}
                </label>
              ))}
            </div>
          </div>

          <Field label="Egna moment, ett per rad">
            <textarea
              name="names"
              rows={3}
              placeholder={"Kantpressning\nBlästring"}
              className="block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
          </Field>

          <Button type="submit">Lägg till</Button>
        </form>

        {moments.length > 0 && (
          <ChipList
            label={`${moments.length} upplagda`}
            items={moments.map((moment) => moment.name)}
            href="/admin/moment"
          />
        )}
      </StepCard>

      {/* Steg 3 — order */}
      <StepCard
        number={3}
        title="Lägg upp minst en order"
        description="All tid hör till en kundorder som ska faktureras. Utan en öppen order går det inte att stämpla in."
        done={state.steps[2].done}
      >
        <form action={addOrder} className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Field label="Ordernummer">
              <Input name="orderNumber" placeholder="2601" required />
            </Field>
          </div>
          <div className="min-w-56 flex-1">
            <Field label="Kund" hint="Valfritt">
              <Input name="customerName" placeholder="Volvo Lastvagnar" />
            </Field>
          </div>
          <Button type="submit">Lägg till</Button>
        </form>

        {orders.length > 0 && (
          <ChipList
            label={`${orders.length} öppna`}
            items={orders.map((order) =>
              order.customerName
                ? `${order.orderNumber} · ${order.customerName}`
                : order.orderNumber
            )}
            href="/admin/ordrar"
          />
        )}
      </StepCard>

      {/* Steg 4 — skärm */}
      <StepCard
        number={4}
        title="Koppla en stämplingsskärm"
        description="Skapa skärmen och öppna dess kopplingslänk en gång på surfplattan eller datorn som ska stå i verkstaden. Sedan behöver ingen logga in där igen."
        done={state.steps[3].done}
        last
      >
        <ButtonLink href="/admin/skarmar">
          {state.steps[3].done ? "Hantera skärmar" : "Skapa skärm"}
        </ButtonLink>
      </StepCard>

      {state.ready && (
        <Card className="mt-6 border-emerald-200 bg-emerald-50/60 p-5">
          <p className="text-sm font-medium text-emerald-900">
            Allt är på plats
          </p>
          <p className="mt-1 text-[13px] text-emerald-800">
            Stämplingsskärmen fungerar. Guiden försvinner nu ur menyn, men
            sidan finns kvar på sin adress och är länkad från Inställningar.
          </p>
        </Card>
      )}
    </>
  );
}

function Progress({
  state,
}: {
  state: { completed: number; total: number; ready: boolean };
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
        <div
          className={`h-full rounded-full transition-all ${
            state.ready ? "bg-emerald-500" : "bg-blue-600"
          }`}
          style={{ width: `${(state.completed / state.total) * 100}%` }}
        />
      </div>
      <span className="text-[13px] font-medium tabular-nums text-neutral-500">
        {state.completed} av {state.total}
      </span>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
  done,
  children,
  last,
}: {
  number: number;
  title: string;
  description: string;
  done: boolean;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "mb-4"}>
      <Card>
        <CardHeader
          title={`${number}. ${title}`}
          description={description}
          action={
            done ? (
              <Badge tone="active">Klart</Badge>
            ) : (
              <Badge tone="muted">Ej gjort</Badge>
            )
          }
        />
        <div className="space-y-4 p-5">{children}</div>
      </Card>
    </div>
  );
}

function ChipList({
  label,
  items,
  href,
}: {
  label: string;
  items: string[];
  href: string;
}) {
  return (
    <div className="border-t border-neutral-100 pt-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 12).map((item) => (
          <span
            key={item}
            className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-600"
          >
            {item}
          </span>
        ))}
        {items.length > 12 && (
          <span className="px-2 py-1 text-xs text-neutral-400">
            och {items.length - 12} till
          </span>
        )}
      </div>
      <Link
        href={href}
        className="mt-2 inline-block text-[13px] font-medium text-blue-600"
      >
        Hantera
      </Link>
    </div>
  );
}
