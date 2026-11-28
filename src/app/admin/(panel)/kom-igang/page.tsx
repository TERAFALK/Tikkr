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
  ButtonLink,
  Card,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";
import SearchSelect from "@/components/admin/SearchSelect";
import { customerOptions } from "@/lib/customers";
import { checkoutHrefFor } from "@/lib/shop/cart";
import { addEmployees, addMoments, addOrder } from "./actions";
import AddForm from "./AddForm";

export const metadata = { title: "Kom igång · Tikkr" };

export const dynamic = "force-dynamic";

/**
 * KOM IGÅNG.
 *
 * Fyra steg som KRÄVS för att kunna stämpla, och därefter det som gör
 * underlagen kompletta. Guiden ligger inte kvar i menyn när den är klar; den
 * nås från Inställningar, under Om arbetsytan.
 *
 * ETT KORT OCH EN VÄG (ändrat 2026-11-27, produktägarens val). Guiden var fyra
 * lösa kort med formulär över hela bredden och en egen lista under, och den
 * hängde inte ihop. Nu står stegen i rad med en linje mellan, som tidslinjen
 * under Nyheter:
 *
 * - Bara steget man står på är öppet. Ett klart steg visar det upplagda på en
 *   rad, och formuläret ligger under rubriken, ett tryck bort. Ett kommande
 *   steg går också att öppna, för den som vill ta dem i en annan ordning.
 * - Formulären har en läsbar bredd, inte panelens.
 * - Det rekommenderade står längst ned i samma kort, som en lista med en rad
 *   per steg, under tillvalet det hör till.
 *
 * Stegens rubriker och beskrivningar står i lib/onboarding.ts och inte här.
 * Det är en `<details>` per steg och ingen JavaScript: guiden fungerar även om
 * något i panelen inte laddas.
 */
export default async function OnboardingPage() {
  const session = await requireAdmin();
  const { db, companyId } = session;

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

  const [employees, moments, orders, devices, customerList] =
    await Promise.all([
      db.employee.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { name: true },
      }),
      db.workMoment.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { name: true },
      }),
      db.order.findMany({
        // Utan statusfilter, som steget självt. En kund som levererat allt de
        // har ska inte se steget stå som ogjort igen. Se lib/onboarding.ts.
        orderBy: { orderNumber: "asc" },
        take: 50,
        select: { orderNumber: true, customer: { select: { name: true } } },
      }),
      db.kioskDevice.findMany({
        orderBy: { name: "asc" },
        select: { name: true },
      }),
      customerOptions(db),
    ]);

  const alreadyAdded = new Set(moments.map((moment) => moment.name));
  const suggestions = SUGGESTED_MOMENTS.filter((name) => !alreadyAdded.has(name));

  // Steget man står på: det första som inte är gjort.
  const current = state.steps.find((step) => !step.done)?.key;
  const [employeeStep, momentStep, orderStep, deviceStep] = state.steps;

  return (
    <>
      {/* Ingen beskrivning under rubriken. Den sa "2 av 4 steg återstår",
          och mätaren i kortet säger samma sak en rad längre ned. */}
      <PageHeader
        title={state.ready ? "Klart att använda" : "Kom igång"}
        help="kom-igang"
        action={
          state.ready ? (
            <ButtonLink href="/admin">Till översikten</ButtonLink>
          ) : undefined
        }
      />

      <Card>
        <div className="border-b border-neutral-200 px-6 py-4">
          <div className="mb-2 flex items-baseline justify-between gap-4 text-[13px]">
            <span className="whitespace-nowrap font-medium tabular-nums text-neutral-900">
              {state.completed} av {state.total} klara
            </span>
            <span className="hidden text-neutral-600 sm:inline">
              {state.ready
                ? "Stämplingsskärmen kan användas"
                : "Sedan kan stämplingsskärmen användas"}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-neutral-200">
            <div
              className={`h-full rounded-full transition-all ${
                state.ready ? "bg-tick-deep" : "bg-fjord"
              }`}
              style={{ width: `${(state.completed / state.total) * 100}%` }}
            />
          </div>
        </div>

        <ol className="px-6 pt-5">
          <Step
            number={1}
            step={employeeStep}
            open={current === employeeStep.key}
            summary={
              <Chips
                items={employees.map((employee) => employee.name)}
                href="/admin/anstallda"
              />
            }
          >
            <AddForm action={addEmployees} className="space-y-3">
              <Field label="Namn" hint="Ett namn per rad">
                <Textarea
                  name="names"
                  rows={4}
                  placeholder={"Anna Andersson\nBjörn Bergqvist\nCarina Cederlund"}
                />
              </Field>
            </AddForm>
          </Step>

          <Step
            number={2}
            step={momentStep}
            open={current === momentStep.key}
            summary={
              <Chips
                items={moments.map((moment) => moment.name)}
                href="/admin/installningar/arbetsmoment"
              />
            }
          >
            <AddForm action={addMoments} className="space-y-4">
              {suggestions.length > 0 && (
                <fieldset>
                  <legend className="mb-2 text-[13px] font-medium text-neutral-700">
                    Vanliga arbetsmoment
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((name) => (
                      <label
                        key={name}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-[13px] text-neutral-800 hover:bg-neutral-50 has-[:checked]:border-fjord has-[:checked]:bg-sno"
                      >
                        <input
                          type="checkbox"
                          name="suggested"
                          value={name}
                          className="h-3.5 w-3.5 rounded border-neutral-400 text-fjord focus:ring-fjord"
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <Field label="Egna arbetsmoment" hint="Ett per rad">
                <Textarea
                  name="names"
                  rows={2}
                  placeholder={"Kantpressning\nBlästring"}
                />
              </Field>
            </AddForm>
          </Step>

          <Step
            number={3}
            step={orderStep}
            open={current === orderStep.key}
            summary={
              <Chips
                items={orders.map((order) =>
                  order.customer
                    ? `${order.orderNumber} · ${order.customer.name}`
                    : order.orderNumber
                )}
                href="/admin/ordrar"
              />
            }
          >
            {/* RADEN STOD SNETT (rättat 2026-11-27). Kundfältet hade Valfritt
                som hjälptext under sig och ordernumret ingen, och då hamnade
                etiketterna på olika höjd. Nu står valfritt i etiketten, och
                fälten och knappen ligger på samma linje. */}
            <AddForm
              action={addOrder}
              className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-end"
            >
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-neutral-700">
                  Ordernummer
                </span>
                <Input name="orderNumber" placeholder="2601" required />
              </label>
              <div>
                <span className="mb-1 block text-[13px] font-medium text-neutral-700">
                  Kund{" "}
                  <span className="font-normal text-neutral-600">valfritt</span>
                </span>
                <SearchSelect
                  name="customerId"
                  variant="search"
                  options={customerList}
                  emptyLabel="Ingen kund"
                  placeholder="Sök kund…"
                />
              </div>
            </AddForm>
          </Step>

          <Step
            number={4}
            step={deviceStep}
            open={current === deviceStep.key}
            summary={
              <Chips
                items={devices.map((device) => device.name)}
                href="/admin/installningar/skarmar"
              />
            }
            last
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <ButtonLink href="/admin/installningar/skarmar">Ny skärm</ButtonLink>
              {/* Den som saknar en pekskärm frågar sig det här, i det här
                  steget. Se CLAUDE.md § 3.4. */}
              <Link
                href={checkoutHrefFor("stamplingsskarm")}
                className="text-[13px] font-medium text-link hover:underline"
              >
                Beställ en stämplingsskärm
              </Link>
            </div>
          </Step>
        </ol>

        {/* DET REKOMMENDERADE, i samma kort. Inte steg i samma mening: man kan
            stämpla utan dem, men fakturaunderlaget och tidrapporten blir
            sämre. Därför en lista under linjen, utan siffra i mätaren. */}
        <div className="space-y-5 border-t border-neutral-200 px-6 py-5">
          {GROUPS.map(({ group, label }) => {
            const steps = state.extras.filter((step) => step.group === group);
            if (steps.length === 0) return null;

            return (
              <section key={group}>
                <h2 className="mb-1.5 text-[13px] font-semibold text-neutral-900">
                  {label}
                </h2>
                <ul className="grid gap-x-6 sm:grid-cols-2">
                  {steps.map((step) => (
                    <ExtraRow key={step.key} step={step} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </Card>
    </>
  );
}

const GROUPS: { group: OnboardingGroup; label: string }[] = [
  { group: "base", label: "För kompletta underlag" },
  { group: "payroll", label: "Löneunderlag" },
  { group: "planning", label: "Planering" },
];

/**
 * Ett av de fyra stegen, på linjen.
 *
 * Rubriken öppnar och stänger steget. Ett klart steg visar det upplagda under
 * rubriken och "Lägg till fler" i den, ett kommande steg bara sin rubrik.
 */
function Step({
  number,
  step,
  open,
  summary,
  last = false,
  children,
}: {
  number: number;
  step: OnboardingStep;
  open: boolean;
  summary: React.ReactNode;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4">
      <div className="flex flex-col items-center">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            step.done
              ? "bg-tick-deep text-white"
              : open
                ? "bg-fjord text-white"
                : "border border-neutral-400 bg-white text-neutral-600"
          }`}
        >
          {step.done ? <CheckMark /> : number}
          {step.done && <span className="sr-only">Klart</span>}
        </span>
        {!last && <span aria-hidden="true" className="w-px flex-1 bg-neutral-200" />}
      </div>

      <details open={open} className="group min-w-0 pb-6">
        {/* Det upplagda står i rubrikraden och inte under den. Allt utom
            summary döljs när en details är stängd, och ett klart steg är
            stängt. */}
        <summary className="block cursor-pointer list-none pt-1 [&::-webkit-details-marker]:hidden">
          <span className="flex items-baseline justify-between gap-4">
            <span
              className={`text-sm font-semibold ${
                step.done || open ? "text-neutral-900" : "text-neutral-600"
              }`}
            >
              {step.title}
            </span>
            {step.done && (
              <span className="shrink-0 text-[13px] font-medium text-link group-open:hidden">
                Lägg till fler
              </span>
            )}
          </span>
          {step.done && <span className="mt-2 block">{summary}</span>}
        </summary>

        <div className="mt-3 max-w-xl space-y-4">
          <p className="text-[13px] leading-relaxed text-neutral-600">
            {step.description}
          </p>
          {children}
        </div>
      </details>
    </li>
  );
}

/** Det upplagda på en rad: de första namnen, antalet resten, och Hantera. */
function Chips({ items, href }: { items: string[]; href: string }) {
  if (items.length === 0) return null;

  const shown = items.slice(0, 6);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((item) => (
        <span
          key={item}
          className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
        >
          {item}
        </span>
      ))}
      {items.length > shown.length && (
        <span className="px-1 text-xs text-neutral-600">
          +{items.length - shown.length}
        </span>
      )}
      <Link
        href={href}
        className="ml-1 text-[13px] font-medium text-link hover:underline"
      >
        Hantera
      </Link>
    </div>
  );
}

/**
 * Ett rekommenderat steg: en rad som leder till sidan där det görs.
 *
 * Länk och inte formulär. De här stegen görs på sina egna sidor, där det
 * finns fler fält än guiden rimligen kan rymma. Namnet säger tillräckligt,
 * och hjälpcentret resten. Beskrivningen stod en kort tid som verktygstips,
 * men då läste en skärmläsare den i stället för namnet.
 */
function ExtraRow({ step }: { step: OnboardingStep }) {
  return (
    <li>
      <Link
        href={step.href}
        className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] hover:bg-neutral-50"
      >
        {step.done ? (
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-tick-deep text-white">
            <CheckMark small />
            <span className="sr-only">Klart:</span>
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full border border-neutral-400"
          />
        )}
        <span
          className={`min-w-0 flex-1 ${
            step.done ? "text-neutral-600" : "font-medium text-neutral-900"
          }`}
        >
          {step.title}
        </span>
        <Chevron />
      </Link>
    </li>
  );
}

function CheckMark({ small = false }: { small?: boolean }) {
  const size = small ? 10 : 14;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-neutral-400"
    >
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  );
}
