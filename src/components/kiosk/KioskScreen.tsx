"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enqueue, flush, pending, type QueuedPunch } from "@/lib/offline-queue";
import CompanyBadge from "@/components/ui/CompanyBadge";
import { LogoMark } from "@/components/ui/Logo";
import NoticeBanner from "@/components/ui/NoticeBanner";
import EmployeeAvatar from "@/components/ui/EmployeeAvatar";
import KioskSettings from "./KioskSettings";

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
  /** true när ett porträtt finns uppladdat. Bilden hämtas via sin adress. */
  hasPhoto: boolean;
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

/** Driftmeddelande från plattformen. Kortad form — bannern behöver inte datum. */
export interface KioskNotice {
  id: string;
  kind: "MAINTENANCE" | "INCIDENT" | "INFO";
  title: string;
  body: string;
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
  /** true om företaget laddat upp en egen logotyp. */
  hasLogo: boolean;
  /** Driftmeddelanden märkta för stämplingsskärmarna. */
  notices: KioskNotice[];
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

/**
 * Hur ofta skärmen frågar servern vem som är instämplad.
 *
 * Fem sekunder är kort nog för att två skärmar ska kännas som en, och långt
 * nog för att inte märkas: svaret innehåller bara de som arbetar just nu.
 */
const SYNC_MS = 5_000;

/** Hur ofta listorna med anställda, ordrar och moment hämtas om. */
const LIST_REFRESH_MS = 5 * 60_000;

export default function KioskScreen({
  companyName,
  deviceName,
  employees,
  orders,
  moments,
  activeByEmployee,
  subscriptionWarning,
  hasLogo,
  notices,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>({ name: "employees" });
  // Kvittensen behåller sin text även när den tonas ut. Nollställdes texten
  // samtidigt skulle rutan bli tom mitt i övergången, vilket ser ut som ett
  // fel snarare än ett avslut.
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptVisible, setReceiptVisible] = useState(false);
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
    if (!receiptVisible) return;
    const timer = setTimeout(() => setReceiptVisible(false), RECEIPT_MS);
    return () => clearTimeout(timer);
  }, [receiptVisible, receipt]);

  const [waiting, setWaiting] = useState(0);

  // Tidpunkten då servern senast svarade. Visas i kugghjulet — en skärm som
  // tappat nätet ser annars likadan ut som en som fungerar.
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  /**
   * Om kön ska SYNAS, vilket inte är samma sak som att den har innehåll.
   *
   * Varje tryck läggs först i kön och skickas sedan, så waiting går upp till
   * ett och tillbaka till noll på några hundradelar. Bannern hann blinka förbi
   * vid varje stämpling och såg ut som ett fel.
   *
   * Den visas därför först när något faktiskt fastnat — ett par sekunder utan
   * att kön tömts. Då är den ett besked värt att läsa i stället för ett
   * flimmer man lär sig ignorera.
   */
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (waiting === 0) {
      setStuck(false);
      return;
    }

    // Redan synlig: starta inte om fördröjningen bara för att ännu ett tryck
    // lagts till en kö som redan står stilla.
    if (stuck) return;

    const timer = setTimeout(() => setStuck(true), 2000);
    return () => clearTimeout(timer);
  }, [waiting, stuck]);

  // Samma värde som waiting, läsbart utan att göra om funktionen varje gång det
  // ändras. Synkningen behöver veta om kön är tom, men ska inte startas om var
  // gång ett tryck läggs till.
  const waitingRef = useRef(0);
  useEffect(() => {
    waitingRef.current = waiting;
  }, [waiting]);

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

  /**
   * Hämtar vem som är instämplad, från servern.
   *
   * Skärmarna delar läge: stämplar någon in vid porten ska den som står vid
   * monteringen se det inom några sekunder, och kunna stämpla ut personen
   * därifrån.
   *
   * Serverns bild tillämpas INTE när det ligger tryck kvar i kön. Då är den
   * lokala bilden nyare — trycket har hänt men ännu inte nått fram — och att
   * skriva över den skulle få namnet att blinka tillbaka till sitt gamla läge
   * framför den som just tryckt.
   */
  const syncActive = useCallback(async () => {
    if (waitingRef.current > 0) return;

    try {
      const response = await fetch("/api/kiosk/state", { cache: "no-store" });
      if (!response.ok) return;

      const data = (await response.json()) as {
        active: Record<string, ActiveJob>;
      };

      setActive(data.active);
      setLastSyncedAt(new Date());
    } catch {
      // Nätet är nere. Skärmen fortsätter visa det den vet, och kön tar hand
      // om det som trycks under tiden.
    }
  }, []);

  // Hämtar med jämna mellanrum, och direkt när skärmen väcks eller nätet
  // kommer tillbaka. Fem sekunder är kort nog för att kännas samtidigt och
  // långt nog för att inte märkas på servern.
  useEffect(() => {
    void syncActive();

    const timer = setInterval(() => void syncActive(), SYNC_MS);
    const onWake = () => void syncActive();

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [syncActive]);

  // Listorna med anställda, ordrar och moment ändras sällan. De hämtas därför
  // med en betydligt lugnare takt, genom att sidan laddas om i bakgrunden.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), LIST_REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

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
      setReceipt(`${employee.name}: ${order.orderNumber}, ${moment.name}`);
      setReceiptVisible(true);
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
      setReceipt(`${employee.name} utstämplad`);
      setReceiptVisible(true);
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
        showQueue={stuck}
        hasLogo={hasLogo}
        lastSyncedAt={lastSyncedAt}
        onBack={goHome}
      />

      {/* Ligger överst och går inte att stänga. Den ska ses av någon som
          nämner den för chefen — meningen är inte att störa den som stämplar,
          därför tar den ingen plats från knapparna. */}
      {subscriptionWarning && (
        <div className="flex items-center gap-3 bg-amber-500 px-6 py-3 text-white">
          <span className="text-lg font-semibold">{subscriptionWarning}</span>
          <span className="text-sm opacity-90">
            Stämplingen fungerar som vanligt. Informera närmaste chef.
          </span>
        </div>
      )}

      {/* Driftmeddelanden ligger under prenumerationsvarningen men över
          kvittensen. Den som stämplar ska se att något är på gång utan att
          det tar plats från knapparna. */}
      <NoticeBanner notices={notices} size="kiosk" />

      <ToastArea>
        {receipt && (
          <Toast tone="ok" visible={receiptVisible}>
            {receipt}
          </Toast>
        )}

        {error && (
          <Toast tone="error" visible onDismiss={() => setError(null)}>
            {error}
          </Toast>
        )}
      </ToastArea>

      {/* Nyckeln byter när vyn byter, vilket startar om övergången. Utan den
          skulle innehållet bytas ut utan att något syntes hända. */}
      <div key={view.name} className="animate-view flex-1 p-4 sm:p-6 lg:p-8">
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
            title={`${view.employee.name}: välj order`}
            empty="Inga öppna ordrar. Kontakta administratören."
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
            title={`Order ${view.order.orderNumber}: välj arbetsmoment`}
            empty="Inga arbetsmoment upplagda. Kontakta administratören."
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
  showQueue,
  hasLogo,
  lastSyncedAt,
  onBack,
}: {
  companyName: string;
  deviceName: string;
  view: View;
  waiting: number;
  /** true först när kön stått stilla en stund. Se stuck i KioskScreen. */
  showQueue: boolean;
  hasLogo: boolean;
  lastSyncedAt: Date | null;
  onBack: () => void;
}) {
  // Samma företagsmärke som i adminpanelen, så att det syns att det hänger
  // ihop. Steget visas bara mitt i ett val — på startsidan finns inget steg.
  const step =
    view.name === "order"
      ? { current: 2, label: "Välj order" }
      : view.name === "moment"
        ? { current: 3, label: "Välj arbetsmoment" }
        : null;

  return (
    // Fast höjd. Avbryt-knappen är högre än resten av innehållet, och utan en
    // reserverad höjd växte rubriken när knappen dök upp — hela skärmen hoppade
    // nedåt mitt i ett val.
    <header className="flex min-h-[88px] items-center gap-4 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
      <CompanyBadge companyName={companyName} hasLogo={hasLogo} size={40} />

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

      <div className="relative ml-auto flex items-center gap-3">
        {/* Syns bara när kön faktiskt fastnat, inte under de hundradelar ett
            tryck är på väg iväg. En ständig statusikon skulle dessutom bara bli
            tapet som ingen läser. */}
        {showQueue && waiting > 0 && (
          <span className="rounded-lg bg-amber-50 px-3 py-2 text-center text-[13px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            {waiting} väntar
            <span className="block text-xs font-normal">
              skickas när anslutningen återupprättas
            </span>
          </span>
        )}

        {/* Knappen finns alltid, men är osynlig när den inte behövs. Att ta
            bort den ur layouten skulle ändra rubrikens höjd varje gång man
            väljer ett namn. */}
        <button
          onClick={onBack}
          tabIndex={view.name === "employees" ? -1 : 0}
          aria-hidden={view.name === "employees"}
          className={`kiosk-press shrink-0 rounded-xl border border-neutral-200 bg-white px-6 py-4 text-lg font-semibold text-neutral-600 ${
            view.name === "employees" ? "invisible" : ""
          }`}
        >
          Avbryt
        </button>

        {/* Tikkr-märket, nedtonat. Skärmen hänger på kundens vägg och är
            deras — men märket ska gå att se från andra sidan verkstaden. */}
        {view.name === "employees" && (
          <div className="absolute right-3 flex items-center gap-3 sm:right-4">
            {/* Ordmärket får vika på en liten skärm. Kugghjulet får det inte —
                det är enda vägen ut ur ett låst kiosk-läge. */}
            <span className="hidden items-center gap-2 opacity-55 sm:flex">
              <LogoMark size={24} />
              <span className="text-[13px] font-semibold text-neutral-500">
                Tikkr
              </span>
            </span>

            {/* Kugghjulet sitter längst ut, dämpat. Den som letar efter det
                hittar det; den som stämplar rör det aldrig. */}
            <KioskSettings
              deviceName={deviceName}
              companyName={companyName}
              waiting={waiting}
              lastSyncedAt={lastSyncedAt}
            />
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * Kvittensen och felmeddelandet.
 *
 * SVÄVAR ÖVER innehållet i stället för att ligga i flödet. Låg de i flödet
 * knuffades knappraden nedåt när de dök upp och hoppade tillbaka när de
 * försvann — mitt framför den som just tryckt, och med risk att nästa tryck
 * hamnar på fel knapp.
 *
 * De tonas dessutom in och ut. Ett element som bara försvinner uppfattas som
 * ett fel i skärmen; ett som glider undan uppfattas som att något blev klart.
 */
function ToastArea({ children }: { children: React.ReactNode }) {
  return (
    <div
      // aria-live gör att en skärmläsare läser upp kvittensen när den kommer.
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-40 flex flex-col items-center gap-2 px-4"
    >
      {children}
    </div>
  );
}

function Toast({
  tone,
  visible,
  children,
  onDismiss,
}: {
  tone: "ok" | "error";
  visible: boolean;
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const styles =
    tone === "ok" ? "bg-emerald-600 text-white" : "bg-amber-500 text-white";

  return (
    <div
      className={`pointer-events-auto flex max-w-2xl items-center gap-4 rounded-xl px-6 py-3.5 text-base font-semibold shadow-lg transition-all duration-300 ease-out motion-reduce:transition-none ${styles} ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
      }`}
    >
      <span>{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-lg bg-black/15 px-5 py-2.5 text-base"
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
    return <Empty>Inga anställda upplagda. Kontakta administratören.</Empty>;
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
            className={`kiosk-press flex min-h-36 flex-col justify-between rounded-xl border p-5 text-left ${
              job
                ? "border-emerald-600 bg-emerald-600 active:bg-emerald-700"
                : "border-neutral-200 bg-white active:bg-neutral-50"
            }`}
          >
            <span className="flex items-center gap-3">
              {/* Porträttet gör att ögat hittar rätt knapp på formen i stället
                  för att läsa alla namn. Skillnaden märks mest för den som är
                  ny, och för den som har bråttom. */}
              <EmployeeAvatar
                employeeId={employee.id}
                name={employee.name}
                hasPhoto={employee.hasPhoto}
                size={52}
                onDark={Boolean(job)}
              />
              <span
                className={`min-w-0 text-xl font-semibold leading-tight sm:text-2xl ${
                  job ? "text-white" : "text-neutral-900"
                }`}
              >
                {employee.name}
              </span>
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
          className="kiosk-press min-h-32 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700"
        >
          Stämpla ut
        </button>
        <button
          onClick={onSwitch}
          className="kiosk-press min-h-32 rounded-xl border border-neutral-200 bg-white p-6 text-2xl font-semibold text-neutral-900 active:bg-neutral-50"
        >
          Byt jobb
          <span className="mt-1.5 block text-base font-normal text-neutral-500">
            Nuvarande jobb stämplas ut automatiskt
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
              className="kiosk-press flex min-h-32 flex-col justify-center rounded-xl border border-neutral-200 bg-white p-5 text-left active:bg-neutral-50"
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
