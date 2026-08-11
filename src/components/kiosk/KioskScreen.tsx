"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { enqueue, flush, pending, type QueuedPunch } from "@/lib/offline-queue";

/**
 * KIOSKSKÄRMEN.
 *
 * Fyra vyer: namn → in/ut → order → moment. Ett tryck i taget, ingen PIN,
 * ingen bekräftelseruta.
 *
 * Två saker styr utformningen:
 *
 * 1. Det ska kännas omedelbart. Skärmen uppdaterar sig själv i samma sekund
 *    som någon trycker och skickar till servern i bakgrunden. Att stå och
 *    vänta på ett svar med handskar på i ett verkstadsbuller är inte ett
 *    alternativ.
 *
 * 2. Nästa person ska mötas av rätt vy. Skärmen går därför tillbaka till
 *    namnlistan av sig själv efter en stund, så att ingen råkar stämpla i
 *    någon annans halvfärdiga val.
 */

interface Employee {
  id: string;
  name: string;
}

interface Order {
  id: string;
  orderNumber: string;
  customerName: string | null;
}

interface Moment {
  id: string;
  name: string;
}

interface ActiveJob {
  since: string;
  orderNumber: string;
  momentName: string;
}

interface Props {
  companyName: string;
  deviceName: string;
  employees: Employee[];
  orders: Order[];
  moments: Moment[];
  activeByEmployee: Record<string, ActiveJob>;
  /** Text om prenumerationen, eller null. Stoppar aldrig stämplingen. */
  subscriptionWarning: string | null;
}

type View =
  | { name: "employees" }
  | { name: "action"; employee: Employee }
  | { name: "order"; employee: Employee }
  | { name: "moment"; employee: Employee; order: Order };

/**
 * Ett unikt id för varje tryck, så att en omsändning inte blir en dubblett.
 *
 * crypto.randomUUID finns bara på HTTPS och localhost. Testas skärmen över
 * vanlig http mot serverns IP saknas den, och då kraschar sidan vid första
 * trycket. Reserven är inte kryptografiskt perfekt, men id:t behöver bara vara
 * unikt — det är ingen hemlighet.
 */
function newPunchId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Hur länge en kvittens visas innan skärmen går tillbaka till namnlistan. */
const RECEIPT_MS = 2200;

/** Hur länge ett halvfärdigt val får stå innan skärmen återgår av sig själv. */
const IDLE_MS = 45_000;

export default function KioskScreen({
  companyName,
  deviceName,
  employees,
  orders,
  moments,
  activeByEmployee,
  subscriptionWarning,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>({ name: "employees" });
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Optimistisk bild av vem som är instämplad. Uppdateras direkt vid tryck och
  // ersätts av serverns bild när sidan hämtats om.
  const [active, setActive] = useState(activeByEmployee);
  useEffect(() => setActive(activeByEmployee), [activeByEmployee]);

  const goHome = useCallback(() => {
    setView({ name: "employees" });
    setError(null);
  }, []);

  // Skärmen återgår själv om någon lämnar den mitt i ett val.
  useEffect(() => {
    if (view.name === "employees") return;
    const timer = setTimeout(goHome, IDLE_MS);
    return () => clearTimeout(timer);
  }, [view, goHome]);

  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => setReceipt(null), RECEIPT_MS);
    return () => clearTimeout(timer);
  }, [receipt]);

  const [waiting, setWaiting] = useState(0);

  /**
   * Tömmer kön och rapporterar läget.
   *
   * Anropas efter varje tryck, när nätet kommer tillbaka, och med jämna
   * mellanrum — en skärm som stått offline en natt ska hämta ikapp av sig själv
   * på morgonen utan att någon rör den.
   */
  const drain = useCallback(async () => {
    const result = await flush();
    setWaiting(result.waiting);

    if (result.rejected.length > 0) {
      const first = result.rejected[0];
      setError(
        `${first.punch.label}: ${first.reason}` +
          (result.rejected.length > 1
            ? ` (och ${result.rejected.length - 1} till)`
            : "")
      );
    }

    // Hämtar serverns bild, så att optimistiska gissningar rättas.
    if (result.sent > 0) router.refresh();
  }, [router]);

  /**
   * Registrerar ett tryck.
   *
   * Trycket sparas alltid i kön först och skickas sedan. Skulle skärmen dö
   * mitt i anropet ligger det kvar och skickas nästa gång.
   */
  const send = useCallback(
    async (punch: Omit<QueuedPunch, "clientPunchId" | "at">) => {
      await enqueue({
        ...punch,
        clientPunchId: newPunchId(),
        at: new Date().toISOString(),
      });

      setWaiting((count) => count + 1);
      await drain();
    },
    [drain]
  );

  // Låter skärmen laddas om utan nät. Kräver HTTPS — över vanlig http händer
  // ingenting här, och kön fungerar ändå så länge sidan inte laddas om.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ingen åtgärd: utan service worker fungerar allt utom omladdning
        // under nätavbrott.
      });
    }
  }, []);

  // Töm kön när nätet kommer tillbaka, och regelbundet som skyddsnät.
  useEffect(() => {
    void pending().then((queue) => setWaiting(queue.length));
    void drain();

    const onOnline = () => void drain();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => void drain(), 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [drain]);

  const punchIn = useCallback(
    (employee: Employee, order: Order, moment: Moment) => {
      setActive((current) => ({
        ...current,
        [employee.id]: {
          since: new Date().toISOString(),
          orderNumber: order.orderNumber,
          momentName: moment.name,
        },
      }));
      setReceipt(`${employee.name} — ${order.orderNumber}, ${moment.name}`);
      goHome();
      void send({
        action: "in",
        employeeId: employee.id,
        orderId: order.id,
        momentId: moment.id,
        label: `${employee.name}, order ${order.orderNumber}`,
      });
    },
    [goHome, send]
  );

  const punchOut = useCallback(
    (employee: Employee) => {
      setActive((current) => {
        const next = { ...current };
        delete next[employee.id];
        return next;
      });
      setReceipt(`${employee.name} — utstämplad`);
      goHome();
      void send({
        action: "out",
        employeeId: employee.id,
        label: `${employee.name}, utstämpling`,
      });
    },
    [goHome, send]
  );

  return (
    <main className="kiosk-surface flex min-h-screen flex-col bg-neutral-50">
      <Header
        companyName={companyName}
        deviceName={deviceName}
        view={view}
        waiting={waiting}
        onBack={goHome}
      />

      {/* Ligger överst och går inte att stänga. Den ska ses av någon som
          nämner den för chefen — meningen är inte att störa den som stämplar,
          därför tar den ingen plats från knapparna. */}
      {subscriptionWarning && (
        <div className="flex items-center gap-3 bg-amber-500 px-6 py-3 text-white">
          <span className="text-lg font-semibold">{subscriptionWarning}</span>
          <span className="text-sm opacity-90">
            Stämplingen fungerar som vanligt — visa det här för din chef.
          </span>
        </div>
      )}

      {receipt && <Banner tone="ok">{receipt}</Banner>}
      {error && (
        <Banner tone="error" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      )}

      <div className="flex-1 p-4 sm:p-6 lg:p-8">
        {view.name === "employees" && (
          <EmployeeGrid
            employees={employees}
            active={active}
            onPick={(employee) =>
              setView(
                active[employee.id]
                  ? { name: "action", employee }
                  : { name: "order", employee }
              )
            }
          />
        )}

        {view.name === "action" && (
          <ActionChoice
            employee={view.employee}
            job={active[view.employee.id]}
            onClockOut={() => punchOut(view.employee)}
            onSwitch={() => setView({ name: "order", employee: view.employee })}
          />
        )}

        {view.name === "order" && (
          <Chooser
            title={`${view.employee.name} — välj order`}
            empty="Inga öppna ordrar. Be administratören lägga upp en."
            items={orders.map((order) => ({
              key: order.id,
              primary: order.orderNumber,
              secondary: order.customerName ?? undefined,
              onPick: () =>
                setView({ name: "moment", employee: view.employee, order }),
            }))}
          />
        )}

        {view.name === "moment" && (
          <Chooser
            title={`Order ${view.order.orderNumber} — välj arbetsmoment`}
            empty="Inga arbetsmoment upplagda."
            items={moments.map((moment) => ({
              key: moment.id,
              primary: moment.name,
              onPick: () => punchIn(view.employee, view.order, moment),
            }))}
          />
        )}
      </div>
    </main>
  );
}

function Header({
  companyName,
  deviceName,
  view,
  waiting,
  onBack,
}: {
  companyName: string;
  deviceName: string;
  view: View;
  waiting: number;
  onBack: () => void;
}) {
  // Samma företagsmärke som i adminpanelen, så att det syns att det hänger
  // ihop. Steget visas bara mitt i ett val — på startsidan finns inget steg.
  const initial = companyName.trim().charAt(0).toUpperCase() || "T";

  const step =
    view.name === "order"
      ? { current: 2, label: "Välj order" }
      : view.name === "moment"
        ? { current: 3, label: "Välj arbetsmoment" }
        : null;

  return (
    <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white">
        {initial}
      </span>

      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-neutral-900">
          {companyName}
        </p>
        <p className="truncate text-[13px] text-neutral-400">{deviceName}</p>
      </div>

      {step && (
        <span className="hidden items-center gap-2 text-[13px] font-medium text-neutral-500 sm:flex">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
            {step.current}
          </span>
          {step.label}
        </span>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Syns bara när något faktiskt väntar. En ständig statusikon skulle
            bara bli tapet som ingen läser. */}
        {waiting > 0 && (
          <span className="rounded-lg bg-amber-50 px-3 py-2 text-center text-[13px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            {waiting} väntar
            <span className="block text-xs font-normal">skickas när nätet är tillbaka</span>
          </span>
        )}

        {view.name !== "employees" && (
          <button
            onClick={onBack}
            className="shrink-0 rounded-xl border border-neutral-200 bg-white px-6 py-4 text-lg font-semibold text-neutral-600 transition-colors active:bg-neutral-50"
          >
            Avbryt
          </button>
        )}
      </div>
    </header>
  );
}

function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: "ok" | "error";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const styles =
    tone === "ok"
      ? "bg-emerald-600 text-white"
      : "bg-amber-500 text-white";

  return (
    <div
      className={`flex items-center justify-between gap-4 px-6 py-3.5 text-base font-semibold ${styles}`}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="rounded-lg bg-black/15 px-5 py-2.5 text-base"
        >
          Stäng
        </button>
      )}
    </div>
  );
}

function EmployeeGrid({
  employees,
  active,
  onPick,
}: {
  employees: Employee[];
  active: Record<string, ActiveJob>;
  onPick: (employee: Employee) => void;
}) {
  if (employees.length === 0) {
    return <Empty>Inga anställda upplagda. Be administratören lägga till.</Empty>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {employees.map((employee) => {
        const job = active[employee.id];

        return (
          <button
            key={employee.id}
            onClick={() => onPick(employee)}
            // Exakt samma kort som i panelen — samma form, mått, rundning och
            // typografi. Det enda som skiljer är fyllningen.
            //
            // Instämplad fylls helt med systemets gröna. Frågan skärmen finns
            // för att besvara är "är jag inne eller ute?", och det svaret ska
            // gå att läsa tvärs över en verkstad utan att leta efter en
            // detalj. En dämpad markering är snyggare på nära håll och sämre
            // på det avstånd skärmen faktiskt används.
            className={`flex min-h-36 flex-col justify-between rounded-xl border p-5 text-left transition-colors ${
              job
                ? "border-emerald-600 bg-emerald-600 active:bg-emerald-700"
                : "border-neutral-200 bg-white active:bg-neutral-50"
            }`}
          >
            <span
              className={`text-xl font-semibold leading-tight sm:text-2xl ${
                job ? "text-white" : "text-neutral-900"
              }`}
            >
              {employee.name}
            </span>

            {job ? (
              <span className="mt-3 block">
                <span className="inline-flex items-center gap-2 rounded-md bg-white/15 px-2.5 py-1 text-sm font-semibold text-white ring-1 ring-inset ring-white/25">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  <Elapsed since={job.since} />
                </span>
                <span className="mt-1.5 block truncate text-sm text-white/80">
                  {job.orderNumber} · {job.momentName}
                </span>
              </span>
            ) : (
              <span className="mt-3 block text-sm text-neutral-400">
                Ej instämplad
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ActionChoice({
  employee,
  job,
  onClockOut,
  onSwitch,
}: {
  employee: Employee;
  job?: ActiveJob;
  onClockOut: () => void;
  onSwitch: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-2xl font-semibold sm:text-3xl">{employee.name}</h2>

        {job && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[15px] text-neutral-600">
            <span className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 font-semibold text-white">
              <span className="h-2 w-2 rounded-full bg-white" />
              Pågår sedan <Elapsed since={job.since} />
            </span>
            <span>
              {job.orderNumber} · {job.momentName}
            </span>
          </div>
        )}
      </div>

      {/* Samma två knapptyper som i panelen — blå för handlingen man oftast
          är här för, vit med linje för alternativet — bara i kioskstorlek. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <button
          onClick={onClockOut}
          className="min-h-32 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white transition-colors active:bg-blue-700"
        >
          Stämpla ut
        </button>
        <button
          onClick={onSwitch}
          className="min-h-32 rounded-xl border border-neutral-200 bg-white p-6 text-2xl font-semibold text-neutral-900 transition-colors active:bg-neutral-50"
        >
          Byt jobb
          <span className="mt-1.5 block text-base font-normal text-neutral-500">
            Stämplar ut från nuvarande automatiskt
          </span>
        </button>
      </div>
    </div>
  );
}

function Chooser({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: {
    key: string;
    primary: string;
    secondary?: string;
    onPick: () => void;
  }[];
}) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-neutral-900 sm:text-2xl">
        {title}
      </h2>

      {items.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={item.onPick}
              className="flex min-h-32 flex-col justify-center rounded-xl border border-neutral-200 bg-white p-5 text-left transition-colors active:bg-neutral-50"
            >
              <span className="text-2xl font-semibold text-neutral-900">
                {item.primary}
              </span>
              {item.secondary && (
                <span className="mt-1 truncate text-sm text-neutral-500">
                  {item.secondary}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white/50 p-12 text-center text-lg text-neutral-500">
      {children}
    </div>
  );
}

/** Visar hur länge ett jobb pågått, och räknar uppåt medan skärmen står på. */
function Elapsed({ since }: { since: string }) {
  const start = useMemo(() => new Date(since).getTime(), [since]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  const hours = Math.floor(minutes / 60);

  return (
    <span>
      {hours > 0 ? `${hours} tim ${minutes % 60} min` : `${minutes} min`}
    </span>
  );
}
