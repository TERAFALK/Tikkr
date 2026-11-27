import Link from "next/link";
import { requireAdmin } from "@/lib/admin-session";
import { hasModule } from "@/lib/company-modules";
import { unsafeGlobalPrisma } from "@/lib/db";
import {
  getOnboardingState,
  SUGGESTED_MOMENTS,
  type OnboardingGroup,
  type OnboardingStep,
} from "@/lib/onboarding";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  Textarea,
} from "@/components/ui";
import SearchSelect from "@/components/admin/SearchSelect";
import { customerOptions } from "@/lib/customers";
import { checkoutHrefFor } from "@/lib/shop/cart";
import { addEmployees, addMoments, addOrder } from "./actions";

export const metadata = { title: "Kom igång · Tikkr" };

export const dynamic = "force-dynamic";

/**
 * KOM IGÅNG.
 *
 * Fyra steg som KRÄVS för att kunna stämpla, och därefter det som gör
 * underlagen kompletta. Guiden ligger inte kvar i menyn när den är klar; den
 * nås från Inställningar, under Om arbetsytan.
 *
 * ETT KLART STEG FÄLLS IHOP (ändrat 2026-11-27). Den som kom tillbaka mötte
 * fyra formulär och fick leta efter det som återstod. Nu står det upplagda
 * och Hantera, och formuläret ligger ett tryck bort under Lägg till fler.
 *
 * DE REKOMMENDERADE STEGEN STÅR PER TILLVAL, och bara för den som har det. Se
 * lib/onboarding.ts. Stegens rubriker och beskrivningar står där och inte här,
 * så att guiden och översikten aldrig säger olika saker om samma steg.
 */
export default async function OnboardingPage() {
  const session = await requireAdmin();
  const { db, companyName, companyId } = session;

  const [payroll, planning, company] = await Promise.all([
    hasModule(companyId, "PAYROLL"),
    hasModule(companyId, "PLANNING"),
    unsafeGlobalPrisma.company.findUnique({
      where: { id: companyId },
      select: { planningMode: true, atfAgreement: true },
    }),
  ]);

  const state = await getOnboardingState(db, {
    extras: true,
    payroll,
    planning,
    planningMode: company?.planningMode,
    atfAgreement: company?.atfAgreement,
  });

  const [employees, moments, orders, customerList] = await Promise.all([
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
      // Utan statusfilter, som steget självt. En kund som levererat allt de
      // har ska inte se steget stå som ogjort igen. Se lib/onboarding.ts.
      orderBy: { orderNumber: "asc" },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        customer: { select: { name: true } },
      },
    }),
    customerOptions(db),
  ]);

  const alreadySuggested = new Set(moments.map((moment) => moment.name));
  const suggestions = SUGGESTED_MOMENTS.filter(
    (name) => !alreadySuggested.has(name)
  );
  const [employeeStep, momentStep, orderStep, deviceStep] = state.steps;

  return (
    <>
      {/* Sa "Fyra steg återstår" oavsett hur många som gjorts. Siffran räknas
          nu fram, och den som gjort tre av fyra ska se att det är ett kvar. */}
      <PageHeader
        title={state.ready ? "Klart att använda" : "Kom igång"}
        help="kom-igang"
        description={
          state.ready
            ? `${companyName} är redo att registrera tid.`
            : `${state.total - state.completed} av ${state.total} steg återstår för ${companyName}.`
        }
        action={
          state.ready ? (
            <ButtonLink href="/admin">Till översikten</ButtonLink>
          ) : undefined
        }
      />

      <Progress state={state} />

      <div className="space-y-4">
        <StepCard
          number={1}
          step={employeeStep}
          summary={
            employees.length > 0 && (
              <ChipList
                label={`${employees.length} upplagda`}
                items={employees.map((employee) => employee.name)}
                href="/admin/anstallda"
              />
            )
          }
        >
          <form action={addEmployees} className="space-y-3">
            <Field label="Namn" hint="Ett namn per rad">
              <Textarea
                name="names"
                rows={5}
                placeholder={"Anna Andersson\nBjörn Bergqvist\nCarina Cederlund"}
              />
            </Field>
            <Button type="submit">Lägg till</Button>
          </form>
        </StepCard>

        <StepCard
          number={2}
          step={momentStep}
          summary={
            moments.length > 0 && (
              <ChipList
                label={`${moments.length} upplagda`}
                items={moments.map((moment) => moment.name)}
                href="/admin/installningar/arbetsmoment"
              />
            )
          }
        >
          <form action={addMoments} className="space-y-4">
            {suggestions.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] font-medium text-neutral-700">
                  Vanliga arbetsmoment
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((name) => (
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
            )}

            <Field label="Egna arbetsmoment" hint="Ett per rad">
              <Textarea
                name="names"
                rows={3}
                placeholder={"Kantpressning\nBlästring"}
              />
            </Field>

            <Button type="submit">Lägg till</Button>
          </form>
        </StepCard>

        <StepCard
          number={3}
          step={orderStep}
          summary={
            orders.length > 0 && (
              <ChipList
                label={`${orders.length} upplagda`}
                items={orders.map((order) =>
                  order.customer
                    ? `${order.orderNumber} · ${order.customer.name}`
                    : order.orderNumber
                )}
                href="/admin/ordrar"
              />
            )
          }
        >
          <form action={addOrder} className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Field label="Ordernummer">
                <Input name="orderNumber" placeholder="2601" required />
              </Field>
            </div>
            <div className="min-w-56 flex-1">
              <Field label="Kund" hint="Valfritt">
                <SearchSelect
                  name="customerId"
                  variant="search"
                  options={customerList}
                  emptyLabel="Ingen kund"
                  placeholder="Sök kund…"
                />
              </Field>
            </div>
            <Button type="submit">Lägg till</Button>
          </form>
        </StepCard>

        <StepCard
          number={4}
          step={deviceStep}
          summary={
            deviceStep.done && (
              <Link
                href="/admin/installningar/skarmar"
                className="text-[13px] font-medium text-link hover:underline"
              >
                Hantera skärmar
              </Link>
            )
          }
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ButtonLink href="/admin/installningar/skarmar">Ny skärm</ButtonLink>
            {/* Den som saknar en pekskärm frågar sig det här, i det här steget.
                Se CLAUDE.md § 3.4. */}
            <Link
              href={checkoutHrefFor("stamplingsskarm")}
              className="text-[13px] font-medium text-link hover:underline"
            >
              Beställ en stämplingsskärm
            </Link>
          </div>
        </StepCard>
      </div>

      {state.ready && (
        <Card className="mt-6 border-emerald-200 bg-emerald-50/60 p-5">
          <p className="text-sm font-medium text-emerald-900">
            Allt som krävs är på plats
          </p>
          <p className="mt-1 text-[13px] text-emerald-800">
            Guiden döljs i menyn. Den nås från Inställningar.
          </p>
        </Card>
      )}

      {/* DÄREFTER. Inte steg i samma mening: man kan stämpla utan dem, men
          fakturaunderlaget och tidrapporten blir sämre. Därför egna grupper
          under de fyra, utan siffra i mätaren. */}
      {GROUPS.map(({ group, label }) => {
        const steps = state.extras.filter((step) => step.group === group);
        if (steps.length === 0) return null;

        return (
          <section key={group} className="mt-8">
            <SectionTitle>{label}</SectionTitle>
            <Card>
              <ul className="divide-y divide-neutral-100">
                {steps.map((step) => (
                  <ExtraRow key={step.key} step={step} />
                ))}
              </ul>
            </Card>
          </section>
        );
      })}
    </>
  );
}

const GROUPS: { group: OnboardingGroup; label: string }[] = [
  { group: "base", label: "Därefter" },
  { group: "payroll", label: "Löneunderlag" },
  { group: "planning", label: "Planering" },
];

/**
 * Ett rekommenderat steg.
 *
 * Länk och inte formulär. De här stegen görs på sina egna sidor, där det
 * finns fler fält än guiden rimligen kan rymma, och att bygga en genväg hit
 * vore ett andra ställe som lägger upp samma sak.
 *
 * Bara det klara märks. Ett "Ej gjort" på varje rad ropade på en kund som
 * kanske aldrig vill ha ett kundregister, och stegen är rekommendationer.
 */
function ExtraRow({ step }: { step: OnboardingStep }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
          {step.title}
          {step.done && <Badge tone="active">Klart</Badge>}
        </p>
        <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-neutral-600">
          {step.description}
        </p>
      </div>

      <ButtonLink href={step.href} tone="secondary">
        {step.action ?? "Öppna"}
      </ButtonLink>
    </li>
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
      <span className="text-[13px] font-medium tabular-nums text-neutral-600">
        {state.completed} av {state.total}
      </span>
    </div>
  );
}

/**
 * Ett av de fyra stegen. Ogjort visar formuläret. Klart visar det som är
 * upplagt, och formuläret står kvar under Lägg till fler: en kund som anställt
 * en till ska inte behöva leta upp en annan sida för att göra det härifrån.
 */
function StepCard({
  number,
  step,
  summary,
  children,
}: {
  number: number;
  step: OnboardingStep;
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={`${number}. ${step.title}`}
        description={step.description}
        action={
          step.done ? (
            <Badge tone="active">Klart</Badge>
          ) : (
            <Badge tone="muted">Ej gjort</Badge>
          )
        }
      />

      {step.done ? (
        <div className="space-y-3 px-5 py-4">
          {summary}
          {/* Steg 4 läggs upp på sin egen sida och har inget att fälla ut. */}
          {step.key !== "device" && (
            <details className="group">
              <summary className="cursor-pointer list-none text-[13px] font-medium text-link hover:underline [&::-webkit-details-marker]:hidden">
                Lägg till fler
              </summary>
              <div className="mt-3">{children}</div>
            </details>
          )}
        </div>
      ) : (
        <div className="space-y-4 p-5">
          {children}
          {summary}
        </div>
      )}
    </Card>
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
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 12).map((item) => (
          <span
            key={item}
            className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700"
          >
            {item}
          </span>
        ))}
        {items.length > 12 && (
          <span className="px-2 py-1 text-xs text-neutral-600">
            och {items.length - 12} till
          </span>
        )}
      </div>
      <Link
        href={href}
        className="mt-2 inline-block text-[13px] font-medium text-link hover:underline"
      >
        Hantera
      </Link>
    </div>
  );
}
