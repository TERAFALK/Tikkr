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
 * Grundflödet är fyra vyer: namn → in/ut → order → moment. Runt det ligger
 * sidospår för den som hellre slår in ordernumret, lägger upp ett snabbjobb
 * eller stämplar improduktiv tid. Ett tryck i taget, ingen PIN, ingen
 * bekräftelseruta.
 *
 * INGEN VY LÄNGS VÄGEN ÄNDRAR NÅGOT. Byt jobb stämplar inte ut förrän det nya
 * startat, och ett snabbjobb skapar ingen order förrän arbetsmomentet valts.
 * Den som ångrar sig och backar ur ska aldrig lämna något efter sig — varken
 * en utstämplad person utan nytt jobb eller en order ingen stämplat på.
 *
 * Tre saker styr utformningen:
 *
 * 1. Det ska kännas omedelbart. Skärmen uppdaterar sig själv i samma sekund
 *    som någon trycker och skickar till servern i bakgrunden. Att stå och
 *    vänta på ett svar med handskar på i ett verkstadsbuller är inte ett
 *    alternativ.
 *
 * 2. Nästa person ska mötas av rätt vy. Skärmen går därför tillbaka till
 *    namnlistan av sig själv efter en stund, så att ingen råkar stämpla i
 *    någon annans halvfärdiga val.
 *
 * 3. Det vanligaste ska vara kortast. Nästan varje instämpling gäller samma
 *    jobb som förra gången — efter en fikarast, eller nästa morgon. Den som
 *    stämplat ut möts därför av en färdig "Fortsätt"-knapp i stället för att
 *    behöva leta upp samma order och samma moment igen. Två tryck i stället
 *    för tre, och listorna finns kvar för den som faktiskt ska byta.
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

/**
 * En kund ur registret, som skärmen får välja mellan.
 *
 * Id och namn, inget mer. Skärmen skickar id:t vidare och visar namnet — org.nr
 * och adress hör hemma på kontoret, inte på en knapp i verkstaden.
 */
export interface KioskCustomer {
  id: string;
  name: string;
}

interface Moment {
  id: string;
  name: string;
}

/**
 * Vilket jobb en stämpling gäller.
 *
 * En diskriminerad union: antingen order plus arbetsmoment, eller ett
 * improduktivt moment. Aldrig något däremellan, och aldrig fyra valfria fält
 * där man får gissa vilka som är ifyllda.
 *
 * Exporterad eftersom både src/app/kiosk/page.tsx och kioskens state-route
 * bygger den här formen. Skärmen och servern ska inte kunna glida isär.
 */
export type KioskJobChoice =
  | {
      kind: "ORDER";
      order: { id: string; orderNumber: string };
      moment: { id: string; name: string };
    }
  | { kind: "INDIRECT"; indirectMoment: { id: string; name: string } };

export interface KioskActiveJob {
  /**
   * När stämplingen började, som ISO-tid.
   *
   * VISAS INTE just nu. Skärmen hade en tickande tidräknare som räknade upp
   * härifrån; den togs bort på kundens begäran, eftersom order och moment är
   * det man behöver läsa på håll och tiden trängde undan dem.
   *
   * Fältet står kvar med flit. Det är serverns svar på "sedan när", det kostar
   * ingenting — tiden ligger redan på raden — och det är fältet att använda om
   * ett starttid-klockslag efterfrågas. Hur länge ett jobb pågått finns i
   * panelen och i rapporterna.
   */
  since: string;
  /** "2601 · Svetsning" eller "Städning". Färdig för skärmen. */
  label: string;
  choice: KioskJobChoice;
}

export interface KioskRecentJob {
  label: string;
  choice: KioskJobChoice;
}

type ActiveJob = KioskActiveJob;

/**
 * Nyckeln som skiljer en persons parallella jobb åt.
 *
 * Arbetsmomentet för ordertid — momentet är maskinen, och en maskin kör ett
 * jobb i taget. Det improduktiva momentet för resten: man städar inte två
 * gånger samtidigt.
 */
function jobKey(choice: KioskJobChoice): string {
  return choice.kind === "ORDER" ? choice.moment.id : choice.indirectMoment.id;
}

/**
 * FÄRGEN SOM SÄGER VAD SOM PÅGÅR.
 *
 * Grönt: det löper fakturerbar tid. Gult: allt som pågår är improduktivt —
 * städning, möte, underhåll — och ingenting av det når ett fakturaunderlag.
 *
 * Skillnaden ska gå att läsa tvärs över en verkstad, precis som skillnaden
 * mellan instämplad och utstämplad. Den som ser ett gult kort vet att personen
 * är på plats men inte på ett jobb som betalas.
 */
const JOB_TONE = {
  order: "border-emerald-600 bg-emerald-600 active:bg-emerald-700",
  indirect: "border-amber-500 bg-amber-500 active:bg-amber-600",
} as const;

/**
 * True när ALLT som pågår är improduktivt.
 *
 * Kör någon både en maskin och något improduktivt är kortet grönt. Frågan
 * gulmarkeringen besvarar är "går det tid som inte faktureras", och svaret är
 * då att det också går tid som gör det — vilket är det viktigare beskedet.
 */
function onlyIndirect(jobs: ActiveJob[]): boolean {
  return (
    jobs.length > 0 && jobs.every((job) => job.choice.kind === "INDIRECT")
  );
}

/** Fälten som pekar ut jobbet vid en utstämpling. */
function outFields(choice: KioskJobChoice) {
  return choice.kind === "ORDER"
    ? { momentId: choice.moment.id }
    : { indirectMomentId: choice.indirectMoment.id };
}

/** Fälten som skapar jobbet vid en instämpling. */
function inFields(choice: KioskJobChoice) {
  return choice.kind === "ORDER"
    ? { orderId: choice.order.id, momentId: choice.moment.id }
    : { indirectMomentId: choice.indirectMoment.id };
}

/** Kort text för kvittenser och köetiketter. */
function jobLabel(choice: KioskJobChoice): string {
  return choice.kind === "ORDER"
    ? `${choice.order.orderNumber} · ${choice.moment.name}`
    : choice.indirectMoment.name;
}

/**
 * Det senast avslutade jobbet, per anställd.
 *
 * Finns för att en fikarast inte ska kosta tre tryck. Den som stämplat ut och
 * kommer tillbaka möts av samma jobb som en färdig knapp — och samma sak gäller
 * nästa morgon, eftersom det är precis samma fall.
 *
 * Bara jobb som fortfarande GÅR att stämpla på hamnar här; se filtreringen i
 * src/app/kiosk/page.tsx.
 */
type RecentJob = KioskRecentJob;

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
  /** Städning, möte, underhåll. Tid som aldrig når ett fakturaunderlag. */
  indirectMoments: Moment[];
  /**
   * Pågående jobb per anställd. En LISTA: en operatör kan köra två maskiner
   * samtidigt, och skärmen måste visa båda. Senast påbörjad först.
   */
  activeByEmployee: Record<string, ActiveJob[]>;
  /** Senast avslutade jobb per anställd. Underlaget för "Fortsätt". */
  recentByEmployee: Record<string, RecentJob>;
  /** Kunderna ur registret. Underlaget för snabbjobbets kundval. */
  customers: KioskCustomer[];
  /** Frukost, lunch, fika. Tom lista döljer rastknappen helt. */
  breakTypes: KioskBreakType[];
  /** Vilka som är på rast just nu. */
  breaksByEmployee: Record<string, KioskBreak>;
  /** Text om prenumerationen, eller null. Stoppar aldrig stämplingen. */
  subscriptionWarning: string | null;
  /** true om företaget laddat upp en egen logotyp. */
  hasLogo: boolean;
  /** Driftmeddelanden märkta för stämplingsskärmarna. */
  notices: KioskNotice[];
}

/** En rast som går att välja på skärmen. */
export interface KioskBreakType {
  id: string;
  name: string;
}

/** Den pågående rasten för en person. */
export interface KioskBreak {
  since: string;
  name: string;
}

type View =
  | { name: "employees" }
  | { name: "action"; employee: Employee }
  | { name: "break"; employee: Employee }
  | { name: "order"; employee: Employee }
  | { name: "orderNumber"; employee: Employee }
  | { name: "quickCustomer"; employee: Employee; orderNumber: string }
  | {
      name: "quickMoment";
      employee: Employee;
      orderNumber: string;
      customer: KioskCustomer | null;
    }
  | { name: "moment"; employee: Employee; order: Order }
  | { name: "indirect"; employee: Employee };

/** Hur många siffror ett ordernummer får vara innan knappsatsen slutar ta emot. */
const MAX_ORDER_DIGITS = 10;

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
  indirectMoments,
  activeByEmployee,
  recentByEmployee,
  customers,
  breakTypes,
  breaksByEmployee,
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

  // Vilka som är på rast. Samma optimistiska mönster som stämplingarna: sätts
  // direkt vid trycket och ersätts av serverns bild vid nästa hämtning.
  const [breaks, setBreaks] = useState(breaksByEmployee);
  useEffect(() => setBreaks(breaksByEmployee), [breaksByEmployee]);

  // Flexsaldot efter dagens sista utstämpling. Visas en kort stund som kvitto.
  const [flexMinutes, setFlexMinutes] = useState<number | null>(null);

  // Senaste jobb hämtas bara vid omladdning av sidan, inte i femsekunders-
  // pollningen. Det ändras ju först när någon stämplar ut, och den skärm som
  // gjorde det uppdaterar sin egen bild direkt nedan. Att en annan skärm visar
  // ett något äldre "Senast" i några minuter gör ingen skada — trycker man på
  // det ändå kontrollerar servern ordern på vanligt sätt. Svaret från
  // /api/kiosk/state ska förbli så litet som det är.
  const [recent, setRecent] = useState(recentByEmployee);
  useEffect(() => setRecent(recentByEmployee), [recentByEmployee]);

  /**
   * Jobbet man håller på att byta FRÅN, medan man väljer det nya.
   *
   * Utstämplingen sker först när det nya jobbet startats — se punchIn. Skedde
   * den redan vid trycket på "Byt jobb" blev den som ångrade sig utstämplad
   * utan att ha börjat något nytt, och den timmen är borta.
   */
  const [replacing, setReplacing] = useState<ActiveJob | null>(null);

  const goHome = useCallback(() => {
    setView({ name: "employees" });
    setError(null);
    // Avbrutet byte. Ingenting har hänt, och ingenting ska hända.
    setReplacing(null);
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

    // Flexsaldot efter dagens sista utstämpling. Kommer med svaret på trycket
    // och visas som ett eget kvitto — tid, aldrig kronor.
    if (result.flexMinutes) setFlexMinutes(result.flexMinutes.minutes);

    // Hämtar serverns bild, så att optimistiska gissningar rättas.
    if (result.sent > 0) router.refresh();
  }, [router]);

  // Saldot står kvar några sekunder och försvinner sedan av sig själv. Ingen
  // ska behöva trycka bort det, och nästa person vid skärmen ska inte se
  // föregående persons siffra.
  useEffect(() => {
    if (flexMinutes === null) return;

    const timer = setTimeout(() => setFlexMinutes(null), 6000);
    return () => clearTimeout(timer);
  }, [flexMinutes]);

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
        active: Record<string, ActiveJob[]>;
        breaks?: Record<string, KioskBreak>;
      };

      setActive(data.active);
      setBreaks(data.breaks ?? {});
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

  // Tar emot det minsta som behövs i stället för hela Order/Moment. Både
  // listornas poster och ett sparat "senast"-jobb passar då in utan att något
  // måste hittas på för fält som inte används här.
  /**
   * true medan en order håller på att skapas.
   *
   * En ref och inte ett tillstånd. Två tryck i snabb följd hinner båda läsa
   * samma gamla värde innan React renderat om, och då skapas två ordrar — ett
   * påhittat SNABB-nummer räknas upp för varje anrop, så dubbletten får ett
   * eget nummer och fångas inte av serverns dubblettskydd.
   */
  const creatingOrder = useRef(false);

  /**
   * Skapar en order på plats och ger tillbaka den.
   *
   * Anropas FÖRST när ett arbetsmoment valts, alltså i samma ögonblick som
   * jobbet startar. Skapades ordern redan vid kundvalet blev den kvar i
   * systemet för den som ångrade sig — en order utan tid på sig, som kontoret
   * måste reda ut. Samma sak som gällde "Byt jobb": sidoeffekten hör hemma
   * vid det tryck som är ett åtagande, inte vid ett steg på vägen.
   *
   * Till skillnad från en stämpling går det INTE att köa. Tiden måste peka på
   * en order som finns, och ett id kan skärmen inte hitta på. Därför väntar
   * den på svaret, och säger rakt ut när nätet saknas i stället för att låtsas
   * att det gick.
   */
  const createQuickOrder = useCallback(
    async (
      orderNumber: string,
      customer: KioskCustomer | null
    ): Promise<Order | null> => {
      creatingOrder.current = true;

      try {
        const response = await fetch("/api/kiosk/quick-order", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderNumber, customerId: customer?.id }),
          signal: AbortSignal.timeout(8000),
        });

        const data = (await response.json()) as {
          order?: Order;
          error?: string;
        };

        if (!response.ok || !data.order) {
          setError(data.error ?? "Ordern kunde inte skapas.");
          return null;
        }

        // Listorna hämtas om i bakgrunden så den nya ordern finns där nästa
        // gång någon letar. Vi väntar inte på svaret — stämplingen ska igång.
        router.refresh();
        return data.order;
      } catch {
        setError(
          "Ingen kontakt med servern. En ny order kräver uppkoppling."
        );
        return null;
      } finally {
        creatingOrder.current = false;
      }
    },
    [router]
  );

  const punchIn = useCallback(
    (employee: Employee, choice: KioskJobChoice) => {
      const key = jobKey(choice);
      const label = jobLabel(choice);

      // Byter man från ett annat jobb stämplas det ut NU, när det nya
      // faktiskt börjat. Är det samma jobb sköter servern stängningen.
      const left =
        replacing && jobKey(replacing.choice) !== key ? replacing : null;
      // Ett jobb på samma moment ersätts — maskinen kan bara köra ett i taget,
      // och servern stänger det gamla. Jobb på andra moment står kvar.
      setActive((current) => {
        const leftKey = left ? jobKey(left.choice) : null;

        const others = (current[employee.id] ?? []).filter(
          (entry) =>
            jobKey(entry.choice) !== key && jobKey(entry.choice) !== leftKey
        );

        return {
          ...current,
          [employee.id]: [
            { since: new Date().toISOString(), label, choice },
            ...others,
          ],
        };
      });
      if (left) {
        // Jobbet man lämnade blir förslaget nästa gång hen kommer fram.
        setRecent((current) => ({
          ...current,
          [employee.id]: { label: left.label, choice: left.choice },
        }));
      }

      // Att börja jobba avslutar rasten, både här och på servern.
      setBreaks((current) => {
        const next = { ...current };
        delete next[employee.id];
        return next;
      });

      setReceipt(`${employee.name}: ${label}`);
      setReceiptVisible(true);
      goHome();

      if (left) {
        void send({
          action: "out",
          employeeId: employee.id,
          ...outFields(left.choice),
          label: `${employee.name}, utstämpling från ${left.label}`,
        });
      }

      void send({
        action: "in",
        employeeId: employee.id,
        ...inFields(choice),
        label: `${employee.name}, ${label}`,
      });
    },
    [goHome, replacing, send]
  );

  /**
   * Stämplar ut från ETT jobb.
   *
   * Jobbet skickas med i stället för att slås upp: personen kan ha flera
   * igång, och skärmen vet vilket knappen satt på. Momentet följer med till
   * servern — utan det måste den välja åt oss, och då flaggas posten.
   */
  const punchOut = useCallback(
    (employee: Employee, job: ActiveJob) => {
      // Jobbet hen lämnar blir förslaget nästa gång hen kommer fram.
      setRecent((current) => ({
        ...current,
        [employee.id]: { label: job.label, choice: job.choice },
      }));

      // Bara det här jobbet tas bort. Att radera personens nyckel hade fått
      // skärmen att visa någon som utstämplad medan maskin två räknar vidare.
      setActive((current) => {
        const rest = (current[employee.id] ?? []).filter(
          (entry) => jobKey(entry.choice) !== jobKey(job.choice)
        );

        const next = { ...current };
        if (rest.length > 0) next[employee.id] = rest;
        else delete next[employee.id];
        return next;
      });

      setReceipt(`${employee.name} utstämplad från ${job.label}`);
      setReceiptVisible(true);

      goHome();

      void send({
        action: "out",
        employeeId: employee.id,
        ...outFields(job.choice),
        label: `${employee.name}, utstämpling`,
      });
    },
    [goHome, send]
  );

  /**
   * Stämplar ut från allt personen har igång.
   *
   * Finns för dagens slut. Den som kört två maskiner ska inte behöva två tryck
   * för att gå hem — och ett glömt andra jobb räknas upp hela natten.
   */
  const punchOutAll = useCallback(
    (employee: Employee, jobs: ActiveJob[]) => {
      const last = jobs[0];

      if (last) {
        setRecent((current) => ({
          ...current,
          [employee.id]: { label: last.label, choice: last.choice },
        }));
      }

      setActive((current) => {
        const next = { ...current };
        delete next[employee.id];
        return next;
      });

      setReceipt(
        jobs.length > 1
          ? `${employee.name} utstämplad från ${jobs.length} jobb`
          : `${employee.name} utstämplad`
      );
      setReceiptVisible(true);
      goHome();

      void send({
        action: "out-all",
        employeeId: employee.id,
        label: `${employee.name}, utstämpling från allt`,
      });
    },
    [goHome, send]
  );

  /**
   * Börjar en rast.
   *
   * Trycket stänger ALLA pågående jobb — en lunch är inte arbete, och den som
   * kör två maskiner lämnar båda när hen går och äter. Servern gör samma sak,
   * se src/lib/breaks.ts; det som sker här är bara att skärmen visar det
   * direkt i stället för att vänta på svaret.
   */
  const punchBreak = useCallback(
    (employee: Employee, breakType: KioskBreakType) => {
      const jobs = active[employee.id] ?? [];
      const last = jobs[0];

      if (last) {
        // Jobbet blir förslaget när personen kommer tillbaka från rasten.
        setRecent((current) => ({
          ...current,
          [employee.id]: { label: last.label, choice: last.choice },
        }));
      }

      setActive((current) => {
        const next = { ...current };
        delete next[employee.id];
        return next;
      });

      setBreaks((current) => ({
        ...current,
        [employee.id]: { since: new Date().toISOString(), name: breakType.name },
      }));

      setReceipt(`${employee.name}: ${breakType.name}`);
      setReceiptVisible(true);
      goHome();

      void send({
        action: "break",
        employeeId: employee.id,
        breakTypeId: breakType.id,
        label: `${employee.name}, ${breakType.name}`,
      });
    },
    [active, goHome, send]
  );

  /**
   * Avslutar rasten utan att börja på något.
   *
   * Den som trycker "Fortsätt" på ett jobb behöver inte den här vägen —
   * instämplingen avslutar rasten av sig själv på servern. Knappen finns för
   * den som kommer tillbaka men ska göra något annat först.
   */
  const punchBreakEnd = useCallback(
    (employee: Employee) => {
      setBreaks((current) => {
        const next = { ...current };
        delete next[employee.id];
        return next;
      });

      setReceipt(`${employee.name}: rasten slut`);
      setReceiptVisible(true);
      goHome();

      void send({
        action: "break-end",
        employeeId: employee.id,
        label: `${employee.name}, rasten slut`,
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

        {/* Flexsaldot efter dagens sista utstämpling.
            TID, aldrig kronor: kiosken visar inga belopp, och vad en person
            kostar företaget hör inte på en skärm i verkstaden. Ett saldo är
            personens egen arbetstid och är något annat. */}
        {flexMinutes !== null && (
          <Toast tone="ok" visible>
            Flexsaldo {formatFlex(flexMinutes)}
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
            recent={recent}
            onPick={(employee) =>
              setView(
                active[employee.id]?.length || recent[employee.id]
                  ? { name: "action", employee }
                  : { name: "order", employee }
              )
            }
          />
        )}

        {view.name === "action" && (
          <ActionChoice
            employee={view.employee}
            jobs={active[view.employee.id] ?? []}
            recent={recent[view.employee.id]}
            onBreak={breaks[view.employee.id] ?? null}
            hasBreaks={breakTypes.length > 0}
            onTakeBreak={() =>
              setView({ name: "break", employee: view.employee })
            }
            onEndBreak={() => punchBreakEnd(view.employee)}
            onClockOut={(job) => punchOut(view.employee, job)}
            // Stämplar INTE ut här. Bara ihågkommet vilket jobb som ska
            // lämnas, så att den som ångrar sig står kvar på sitt jobb.
            onSwitchFrom={(job) => {
              setReplacing(job);
              setView({ name: "order", employee: view.employee });
            }}
            onClockOutAll={(jobs) => punchOutAll(view.employee, jobs)}
            onAdd={() => setView({ name: "order", employee: view.employee })}
            onResume={() => {
              const last = recent[view.employee.id];
              if (last) punchIn(view.employee, last.choice);
            }}
          />
        )}

        {view.name === "break" && (
          <Chooser
            title={`${view.employee.name}: rast`}
            empty="Inga raster upplagda. Kontakta kontoret."
            items={breakTypes.map((type) => ({
              key: type.id,
              primary: type.name,
              onPick: () => punchBreak(view.employee, type),
            }))}
          />
        )}

        {view.name === "order" && (
          <Chooser
            title={
              replacing
                ? `${view.employee.name}: byter från ${replacing.label}`
                : `${view.employee.name}: välj order`
            }
            empty="Inga öppna ordrar. Kontakta kontoret."
            action={
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() =>
                    setView({ name: "orderNumber", employee: view.employee })
                  }
                  className="kiosk-press rounded-xl border border-neutral-200 bg-white px-5 py-4 text-base font-semibold text-neutral-900 active:bg-neutral-50 sm:text-lg"
                >
                  Slå in ordernummer
                </button>
                {/* Ligger här och inte bland ordrarna. Improduktiv tid hör
                    inte till någon kund, och den som letar efter sin order
                    ska inte kunna råka trycka på Städning. */}
                {indirectMoments.length > 0 && (
                  <button
                    onClick={() =>
                      setView({ name: "indirect", employee: view.employee })
                    }
                    className="kiosk-press rounded-xl border border-neutral-200 bg-white px-5 py-4 text-base font-semibold text-neutral-600 active:bg-neutral-50 sm:text-lg"
                  >
                    Improduktiv tid
                  </button>
                )}
              </div>
            }
            items={orders.map((order) => ({
              key: order.id,
              primary: order.orderNumber,
              secondary: order.customerName ?? undefined,
              onPick: () =>
                setView({ name: "moment", employee: view.employee, order }),
            }))}
          />
        )}

        {view.name === "orderNumber" && (
          <OrderNumberPad
            employee={view.employee}
            orders={orders}
            onPick={(order) =>
              setView({ name: "moment", employee: view.employee, order })
            }
            onBrowse={() =>
              setView({ name: "order", employee: view.employee })
            }
            onCreate={(orderNumber) =>
              setView({
                name: "quickCustomer",
                employee: view.employee,
                orderNumber,
              })
            }
          />
        )}

        {view.name === "quickCustomer" && (
          <CustomerPicker
            orderNumber={view.orderNumber}
            customers={customers}
            onPick={(customer) =>
              // Ingenting skapas här. Kunden är ett val på vägen, och den som
              // backar ur ska inte lämna en order efter sig.
              setView({
                name: "quickMoment",
                employee: view.employee,
                orderNumber: view.orderNumber,
                customer,
              })
            }
            onBack={() =>
              setView({ name: "orderNumber", employee: view.employee })
            }
          />
        )}

        {view.name === "quickMoment" && (
          <Chooser
            title={`${
              [view.orderNumber, view.customer?.name]
                .filter(Boolean)
                .join(" · ") ||
              "Nytt snabbjobb"
            }: välj arbetsmoment`}
            empty="Inga arbetsmoment upplagda. Kontakta kontoret."
            items={moments.map((moment) => ({
              key: moment.id,
              primary: moment.name,
              onPick: () => {
                // Spärr mot dubbeltryck. Två tryck hade annars gett två
                // ordrar, eftersom ett påhittat SNABB-nummer räknas upp för
                // varje anrop.
                if (creatingOrder.current) return;

                void (async () => {
                  const order = await createQuickOrder(
                    view.orderNumber,
                    view.customer
                  );

                  // Gick det inte står felet i rutan och skärmen väntar kvar.
                  if (!order) return;

                  punchIn(view.employee, {
                    kind: "ORDER",
                    order,
                    moment,
                  });
                })();
              },
            }))}
          />
        )}

        {view.name === "moment" && (
          <Chooser
            title={`Order ${view.order.orderNumber}: välj arbetsmoment`}
            empty="Inga arbetsmoment upplagda. Kontakta kontoret."
            items={moments.map((moment) => ({
              key: moment.id,
              primary: moment.name,
              onPick: () =>
                punchIn(view.employee, {
                  kind: "ORDER",
                  order: view.order,
                  moment,
                }),
            }))}
          />
        )}

        {view.name === "indirect" && (
          <Chooser
            title={`${view.employee.name}: improduktiv tid`}
            empty="Inga improduktiva moment upplagda. Kontakta kontoret."
            items={indirectMoments.map((moment) => ({
              key: moment.id,
              primary: moment.name,
              onPick: () =>
                punchIn(view.employee, {
                  kind: "INDIRECT",
                  indirectMoment: moment,
                }),
            }))}
          />
        )}
      </div>
    </main>
  );
}

/**
 * Var i flödet man är. Uppslag och inte en kedja av frågor: varianterna blir
 * fler efterhand, och en ternär i fyra led går inte att läsa.
 *
 * Ordervalet, knappsatsen och kundvalet är alla steg två — de är tre vägar
 * till samma sak, inte tre steg efter varandra.
 */
const STEPS: Partial<
  Record<View["name"], { current: number; label: string }>
> = {
  order: { current: 2, label: "Välj order" },
  orderNumber: { current: 2, label: "Slå in ordernummer" },
  quickCustomer: { current: 2, label: "Vilken kund?" },
  quickMoment: { current: 3, label: "Välj arbetsmoment" },
  moment: { current: 3, label: "Välj arbetsmoment" },
  indirect: { current: 2, label: "Improduktiv tid" },
  break: { current: 2, label: "Välj rast" },
};

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
  const step = STEPS[view.name] ?? null;

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
  recent,
  onPick,
}: {
  employees: Employee[];
  active: Record<string, ActiveJob[]>;
  recent: Record<string, RecentJob>;
  onPick: (employee: Employee) => void;
}) {
  if (employees.length === 0) {
    return <Empty>Inga anställda upplagda. Kontakta kontoret.</Empty>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {employees.map((employee) => {
        const jobs = active[employee.id] ?? [];
        const job = jobs[0];
        const last = recent[employee.id];

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
                ? onlyIndirect(jobs)
                  ? JOB_TONE.indirect
                  : JOB_TONE.order
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
              /* ORDER OCH MOMENT ÄR DET STORA HÄR, inte hur länge jobbet
                 pågått.
                 
                 Tidräknaren satt först i en bricka överst och jobbet stod i
                 liten grå text under. Fel prioritering: den som går fram till
                 skärmen behöver veta VAD hen är instämplad på — det är svaret
                 som avgör om hen ska trycka. Hur många timmar och minuter det
                 varit står i panelen och i rapporten, för den som behöver det.
                 
                 Med flera jobb räcker inte utrymmet för alla. Då står antalet
                 först, eftersom ett dolt jobb är värre än ett förkortat namn. */
              <span className="mt-3 block">
                {jobs.length > 1 && (
                  <span className="mb-1.5 inline-flex items-center gap-2 rounded-md bg-white/15 px-2.5 py-1 text-sm font-semibold text-white ring-1 ring-inset ring-white/25">
                    <span className="h-2 w-2 rounded-full bg-white" />
                    {jobs.length} jobb igång
                  </span>
                )}
                {jobs.slice(0, 2).map((entry) => (
                  <span
                    key={jobKey(entry.choice)}
                    className="block truncate text-lg font-semibold leading-snug text-white sm:text-xl"
                  >
                    {entry.label}
                  </span>
                ))}
                {jobs.length > 2 && (
                  <span className="mt-1 block text-base text-white/70">
                    och {jobs.length - 2} till
                  </span>
                )}
              </span>
            ) : last ? (
              // Vad som står här är skillnaden mellan tre tryck och ett. Den
              // som ser sitt jobb redan på namnknappen vet att genvägen finns
              // innan hen ens tryckt.
              <span className="mt-3 block truncate text-sm text-neutral-500">
                Senast: {last.label}
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

/**
 * VAD SOM HÄNDER NÄR MAN TRYCKT PÅ SITT NAMN.
 *
 * Skiljer på tre knappar som tidigare var två, eftersom regeln ändrats:
 *
 *  - STÄMPLA UT gäller ETT jobb. Med två maskiner igång måste man kunna
 *    avsluta den ena och låta den andra gå vidare.
 *  - BYT JOBB går till ordervalet och stämplar ut det gamla FÖRST NÄR DET NYA
 *    STARTAT. Förr gjorde servern utstämplingen av sig själv vid nästa
 *    instämpling; nu gör den det bara på samma maskin, så bytet måste sägas
 *    ut. Men det får inte ske vid tryckningen: den som ångrar sig och backar
 *    ur skulle då stå utstämplad utan att ha börjat något nytt.
 *  - LÄGG TILL JOBB går till ordervalet UTAN att stämpla ut. Det är fallet
 *    "jag startar fräsen också".
 *
 * Skillnaden mellan de två sista måste vara omöjlig att missa. Trycker någon
 * fel blir det antingen en order utan tid eller två ordrar som båda faktureras
 * för samma timme.
 */
function ActionChoice({
  employee,
  jobs,
  recent,
  onBreak,
  hasBreaks,
  onTakeBreak,
  onEndBreak,
  onClockOut,
  onSwitchFrom,
  onClockOutAll,
  onAdd,
  onResume,
}: {
  employee: Employee;
  jobs: ActiveJob[];
  recent?: RecentJob;
  /** Den pågående rasten, eller null. */
  onBreak: KioskBreak | null;
  /** false döljer rastknappen — företaget stämplar inte raster. */
  hasBreaks: boolean;
  onTakeBreak: () => void;
  onEndBreak: () => void;
  onClockOut: (job: ActiveJob) => void;
  onSwitchFrom: (job: ActiveJob) => void;
  onClockOutAll: (jobs: ActiveJob[]) => void;
  onAdd: () => void;
  onResume: () => void;
}) {
  const single = jobs.length === 1 ? jobs[0] : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-2xl font-semibold sm:text-3xl">{employee.name}</h2>

        {/* Rasten står överst och med egen färg. Den som kommer tillbaka från
            lunch ska se att skärmen vet om det, annars trycker hen på nytt. */}
        {onBreak && (
          <div className="mt-3">
            <span className="block text-2xl font-semibold leading-snug text-neutral-900 sm:text-3xl">
              {onBreak.name}
            </span>
            <span className="mt-2 inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-1.5 text-[15px] font-semibold text-white">
              <span className="h-2 w-2 rounded-full bg-white" />
              Rast pågår
            </span>
          </div>
        )}

        {single && (
          /* Jobbet står stort och brickan säger bara att det pågår. Ordningen
             är omvänd mot förut, där tiden var det största på raden och order
             och moment stod i liten grå text bredvid. */
          <div className="mt-3">
            <span className="block text-2xl font-semibold leading-snug text-neutral-900 sm:text-3xl">
              {single.label}
            </span>
            <span
              className={`mt-2 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[15px] font-semibold text-white ${
                single.choice.kind === "INDIRECT"
                  ? "bg-amber-500"
                  : "bg-emerald-600"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-white" />
              Pågår
            </span>
          </div>
        )}
      </div>

      {/* Flera jobb får varsin rad med egen utstämplingsknapp. En gemensam
          knapp hade tvingat servern att välja vilket som avsågs, och ett
          godtyckligt val i ett fakturaunderlag är en rad någon måste rätta. */}
      {jobs.length > 1 && (
        <div className="mt-3 space-y-3">
          {jobs.map((job) => (
            <div
              key={jobKey(job.choice)}
              className={`flex items-center gap-3 rounded-xl border p-4 ${
                job.choice.kind === "INDIRECT"
                  ? JOB_TONE.indirect
                  : JOB_TONE.order
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xl font-semibold leading-snug text-white">
                  {job.label}
                </span>
                <span className="mt-1 block text-sm text-white/80">Pågår</span>
              </span>
              <button
                onClick={() => onClockOut(job)}
                className="kiosk-press shrink-0 rounded-xl bg-white px-6 py-4 text-lg font-semibold text-neutral-900 active:bg-neutral-100"
              >
                Stämpla ut
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* PÅ RAST. Då är det bara två vägar vidare: tillbaka till jobbet,
            eller avsluta rasten utan att börja på något. Utstämpling och
            jobbval göms — personen har redan lämnat sina jobb, och att visa
            "Stämpla ut" för någon som inte är instämplad är en fälla. */}
        {onBreak && (
          <>
            {recent ? (
              <button
                onClick={onResume}
                className="kiosk-press min-h-32 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700"
              >
                Fortsätt
                <span className="mt-1.5 block truncate text-base font-normal text-white/80">
                  {recent.label}
                </span>
              </button>
            ) : (
              <button
                onClick={onAdd}
                className="kiosk-press min-h-32 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700"
              >
                Välj jobb
              </button>
            )}
            <button
              onClick={onEndBreak}
              className="kiosk-press min-h-32 rounded-xl border border-neutral-200 bg-white p-6 text-2xl font-semibold text-neutral-900 active:bg-neutral-50"
            >
              Avsluta rasten
              <span className="mt-1.5 block text-base font-normal text-neutral-500">
                Utan att börja på ett jobb
              </span>
            </button>
          </>
        )}

        {/* Ett jobb: samma två knappar som förut, plus vägen till en andra
            maskin. */}
        {!onBreak && single && (
          <>
            <button
              onClick={() => onClockOut(single)}
              className="kiosk-press min-h-32 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700"
            >
              Stämpla ut
            </button>
            <button
              onClick={() => onSwitchFrom(single)}
              className="kiosk-press min-h-32 rounded-xl border border-neutral-200 bg-white p-6 text-2xl font-semibold text-neutral-900 active:bg-neutral-50"
            >
              Byt jobb
              <span className="mt-1.5 block text-base font-normal text-neutral-500">
                Stämplas ut när det nya startar
              </span>
            </button>
            <button
              onClick={onAdd}
              className="kiosk-press min-h-28 rounded-xl border border-neutral-200 bg-white p-6 text-xl font-semibold text-neutral-900 active:bg-neutral-50 sm:col-span-2"
            >
              Lägg till jobb
              <span className="mt-1.5 block text-base font-normal text-neutral-500">
                För dig som kör två maskiner — det pågående fortsätter
              </span>
            </button>
          </>
        )}

        {!onBreak && jobs.length > 1 && (
          <>
            <button
              onClick={onAdd}
              className="kiosk-press min-h-28 rounded-xl border border-neutral-200 bg-white p-6 text-xl font-semibold text-neutral-900 active:bg-neutral-50"
            >
              Lägg till jobb
            </button>
            <button
              onClick={() => onClockOutAll(jobs)}
              className="kiosk-press min-h-28 rounded-xl bg-blue-600 p-6 text-xl font-semibold text-white active:bg-blue-700"
            >
              Stämpla ut allt
              <span className="mt-1.5 block text-base font-normal text-white/80">
                Alla {jobs.length} jobben
              </span>
            </button>
          </>
        )}

        {/* Utstämplad, men med ett jobb att återuppta. Fortsätt ligger på
            samma plats som Stämpla ut gör när man är inne — den handling man
            kom hit för står alltid till vänster, så handen lär sig var den
            ska. */}
        {!onBreak && jobs.length === 0 && recent && (
          <>
            <button
              onClick={onResume}
              className="kiosk-press min-h-32 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700"
            >
              Fortsätt
              <span className="mt-1.5 block truncate text-base font-normal text-white/80">
                {recent.label}
              </span>
            </button>
            <button
              onClick={onAdd}
              className="kiosk-press min-h-32 rounded-xl border border-neutral-200 bg-white p-6 text-2xl font-semibold text-neutral-900 active:bg-neutral-50"
            >
              Välj annat jobb
            </button>
          </>
        )}

        {/* Varken pågående eller senaste jobb. Kan inträffa om ordern hunnit
            stängas medan någon stod kvar i vyn. Skärmen ska leda vidare, inte
            visa en tom ruta man måste backa ur. */}
        {/* RAST. Ligger sist och i en egen ton: den är inte ett jobb, och den
            får inte kunna tryckas av misstag när man siktade på Stämpla ut.
            Trycket stänger alla pågående jobb — en lunch är inte arbete. */}
        {!onBreak && hasBreaks && jobs.length > 0 && (
          <button
            onClick={onTakeBreak}
            className="kiosk-press min-h-28 rounded-xl border border-sky-200 bg-sky-50 p-6 text-xl font-semibold text-sky-900 active:bg-sky-100 sm:col-span-2"
          >
            Rast
            <span className="mt-1.5 block text-base font-normal text-sky-700">
              Stämplar ut från {jobs.length === 1 ? "jobbet" : "alla jobb"}
            </span>
          </button>
        )}

        {!onBreak && jobs.length === 0 && !recent && (
          <button
            onClick={onAdd}
            className="kiosk-press min-h-32 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700 sm:col-span-2"
          >
            Välj jobb
          </button>
        )}
      </div>
    </div>
  );
}

/** Över så här många kunder blir rutnätet ohanterligt och bokstavsraden dyker upp. */
const ALPHABET_THRESHOLD = 12;

/**
 * VILKEN KUND SNABBJOBBET GÄLLER.
 *
 * Kundnamnen finns redan i systemet från tidigare ordrar, så det ska vara ett
 * tryck och inte en inskrivning. Att skriva text på en verkstadsskärm med
 * handskar på är långsamt, och stavningen varierar — "Volvo", "volvo
 * lastvagnar", "VOLVO AB" blir tre kunder i rapporterna.
 *
 * Med många kunder får rutnätet en bokstavsrad ovanför. Bara de bokstäver som
 * faktiskt börjar ett kundnamn visas — en rad med hela alfabetet där mer än
 * hälften inte går att trycka på är mest i vägen.
 */
function CustomerPicker({
  orderNumber,
  customers,
  onPick,
  onBack,
}: {
  orderNumber: string;
  customers: KioskCustomer[];
  onPick: (customer: KioskCustomer | null) => void;
  onBack: () => void;
}) {
  const [letter, setLetter] = useState<string | null>(null);

  const letters = useMemo(() => {
    const found = new Set(
      customers.map((customer) => customer.name.trim().charAt(0).toUpperCase())
    );
    return [...found].sort((a, b) => a.localeCompare(b, "sv"));
  }, [customers]);

  const shown = useMemo(() => {
    if (!letter) return customers;
    return customers.filter(
      (customer) => customer.name.trim().charAt(0).toUpperCase() === letter
    );
  }, [customers, letter]);

  const useAlphabet = customers.length > ALPHABET_THRESHOLD;

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-xl font-semibold text-neutral-900 sm:text-2xl">
        Vilken kund?
      </h2>
      <p className="mb-4 text-base text-neutral-500">
        {orderNumber
          ? `Order ${orderNumber} läggs upp och märks för kontoret.`
          : "Ordern får ett tillfälligt nummer och märks för kontoret."}
      </p>

      {useAlphabet && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={() => setLetter(null)}
            className={`kiosk-press min-h-14 min-w-14 rounded-lg px-4 text-lg font-semibold ${
              letter === null
                ? "bg-neutral-900 text-white"
                : "border border-neutral-200 bg-white text-neutral-900 active:bg-neutral-50"
            }`}
          >
            Alla
          </button>
          {letters.map((option) => (
            <button
              key={option}
              onClick={() => setLetter(option)}
              className={`kiosk-press min-h-14 min-w-14 rounded-lg text-lg font-semibold ${
                letter === option
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-200 bg-white text-neutral-900 active:bg-neutral-50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {shown.map((customer) => (
            <button
              key={customer.id}
              onClick={() => onPick(customer)}
              className="kiosk-press flex min-h-24 items-center rounded-xl border border-neutral-200 bg-white p-5 text-left text-xl font-semibold text-neutral-900 active:bg-neutral-50"
            >
              <span className="line-clamp-2">{customer.name}</span>
            </button>
          ))}
        </div>
      ) : (
        /* Tomt register. Skärmen kan inte lägga upp en kund — det görs på
           kontoret — så det enda ärliga är att säga det och låta "Vet inte"
           vara vägen vidare. Jobbet ska aldrig stoppas av ett saknat namn. */
        <p className="rounded-xl border border-neutral-200 bg-white p-5 text-lg text-neutral-500">
          {letter
            ? "Ingen kund börjar på den bokstaven."
            : "Inga kunder upplagda. Välj ”Vet inte”."}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* Att hoppa över är tillåtet. Ordern flaggas ändå för kontoret,
            och att stå fast vid skärmen för att man inte vet vilken kund det
            är vore att förlora timmen man försökte rädda. */}
        <button
          onClick={() => onPick(null)}
          className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white p-5 text-lg font-semibold text-neutral-500 active:bg-neutral-50"
        >
          Vet inte
        </button>
        <button
          onClick={onBack}
          className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white p-5 text-lg font-semibold text-neutral-900 active:bg-neutral-50"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}

/**
 * ORDERNUMMER PÅ KNAPPSATS.
 *
 * Med hundra öppna ordrar är en lista fel verktyg. Den som har numret på sin
 * ritning ska kunna slå in det direkt.
 *
 * Det bekräftas inte med ett anonymt "enter" utan med en knapp som bär KUNDENS
 * NAMN. Man bekräftar inte ett nummer — man bekräftar vilken kund man arbetar
 * mot, och ett femsiffrigt tal som råkar finnas hos fel kund är inget man
 * upptäcker genom att läsa siffrorna en gång till.
 *
 * Uppslaget sker mot listan skärmen redan har i minnet. Ingen fråga till
 * servern, alltså inget som slutar fungera när nätet gör det — och svaret
 * kommer medan fingret fortfarande är kvar på knappen.
 *
 * Egen knappsats i stället för ett textfält: en verkstadsskärm i kioskläge har
 * sällan något tangentbord att fälla upp, och den som har handskar på sig
 * behöver stora ytor.
 */
function OrderNumberPad({
  employee,
  orders,
  onPick,
  onBrowse,
  onCreate,
}: {
  employee: Employee;
  orders: Order[];
  onPick: (order: Order) => void;
  onBrowse: () => void;
  /** Numret som slagits in, eller tom sträng när inget angetts. */
  onCreate: (orderNumber: string) => void;
}) {
  const [typed, setTyped] = useState("");

  const match = useMemo(
    () => orders.find((order) => order.orderNumber === typed) ?? null,
    [orders, typed]
  );

  function press(digit: string) {
    setTyped((current) =>
      current.length >= MAX_ORDER_DIGITS ? current : current + digit
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-4 text-xl font-semibold text-neutral-900 sm:text-2xl">
        {employee.name}: slå in ordernummer
      </h2>

      {/* Fast höjd på både ruta och besked. Utan den hoppar knappsatsen nedåt
          i samma stund som första siffran trycks in. */}
      <div className="flex h-24 items-center justify-center rounded-xl border-2 border-neutral-200 bg-white">
        <span className="text-4xl font-semibold tabular-nums tracking-[0.2em] text-neutral-900">
          {typed || <span className="text-neutral-300">—</span>}
        </span>
      </div>

      <div className="flex h-12 items-center justify-center">
        {match ? (
          <span className="text-lg font-semibold text-emerald-700">
            {match.customerName ?? "Kund saknas på ordern"}
          </span>
        ) : typed ? (
          <span className="text-lg font-medium text-amber-700">
            Okänt ordernummer
          </span>
        ) : (
          <span className="text-base text-neutral-400">
            Numret står på ritningen eller följesedeln
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            onClick={() => press(digit)}
            className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white text-3xl font-semibold text-neutral-900 active:bg-neutral-50"
          >
            {digit}
          </button>
        ))}

        {/* Ritad pil och inte tecknet ⌫: det saknas i en del fonter och blir
            då en tom fyrkant, vilket är sista knappen man vill gissa sig
            till mitt i en inmatning. */}
        <button
          onClick={() => setTyped((current) => current.slice(0, -1))}
          aria-label="Ta bort sista siffran"
          className="kiosk-press flex min-h-20 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 active:bg-neutral-50"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6H9l-5 6 5 6h11z" />
            <path d="m15 10-4 4m0-4 4 4" />
          </svg>
        </button>
        <button
          onClick={() => press("0")}
          className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white text-3xl font-semibold text-neutral-900 active:bg-neutral-50"
        >
          0
        </button>
        <button
          onClick={() => setTyped("")}
          className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white text-lg font-semibold text-neutral-500 active:bg-neutral-50"
        >
          Rensa
        </button>
      </div>

      {/* Knappen bär kundens namn. Det är hela poängen: den som trycker
          bekräftar vilken kund arbetet ska faktureras, inte en sifferrad. */}
      <button
        onClick={() => match && onPick(match)}
        disabled={!match}
        className="kiosk-press mt-3 min-h-24 w-full rounded-xl bg-blue-600 p-5 text-2xl font-semibold text-white active:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400"
      >
        {!match ? (
          "Slå in ett ordernummer"
        ) : match.customerName ? (
          <>
            {match.customerName}
            <span className="mt-1 block text-base font-normal text-white/80">
              order {match.orderNumber}
            </span>
          </>
        ) : (
          <>
            Order {match.orderNumber}
            <span className="mt-1 block text-base font-normal text-white/80">
              ingen kund angiven
            </span>
          </>
        )}
      </button>

      {/* Vägen ut när numret inte finns upplagt. Arbetet börjar ibland innan
          kontoret hunnit lägga upp ordern, och utan den här knappen stämplar
          folk på fel order eller inte alls — den timmen går inte att
          rekonstruera efteråt. */}
      {!match && (
        <button
          onClick={() => onCreate(typed)}
          className="kiosk-press mt-3 min-h-20 w-full rounded-xl border-2 border-amber-300 bg-amber-50 p-5 text-xl font-semibold text-amber-900 active:bg-amber-100"
        >
          {typed ? `Skapa order ${typed}` : "Snabbjobb utan ordernummer"}
          <span className="mt-1 block text-base font-normal text-amber-800/80">
            Läggs upp direkt och märks för kontoret att komplettera
          </span>
        </button>
      )}

      <button
        onClick={onBrowse}
        className="kiosk-press mt-3 min-h-16 w-full rounded-xl border border-neutral-200 bg-white text-lg font-semibold text-neutral-900 active:bg-neutral-50"
      >
        Visa öppna ordrar i stället
      </button>
    </div>
  );
}

function Chooser({
  title,
  empty,
  items,
  action,
}: {
  title: string;
  empty: string;
  items: {
    key: string;
    primary: string;
    secondary?: string;
    onPick: () => void;
  }[];
  /** Valfri knapp bredvid rubriken, t.ex. vägen till knappsatsen. */
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-neutral-900 sm:text-2xl">
          {title}
        </h2>
        {action}
      </div>

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

/**
 * Flexsaldot som text: "+2:15" eller "−0:45".
 *
 * Tecknet skrivs alltid ut, så att noll inte läses som plus, och timmar och
 * minuter i stället för decimaltimmar — den som ska veta om hen kan gå hem
 * tidigt läser "+2:15" snabbare än "+2,25".
 */
function formatFlex(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return "0:00";

  const sign = rounded > 0 ? "+" : "−";
  const abs = Math.abs(rounded);

  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
