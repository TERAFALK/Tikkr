"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  enqueue,
  flush,
  loadView,
  pending,
  saveView,
  shouldRestoreAtStart,
  type QueuedPunch,
} from "@/lib/offline-queue";
import {
  applyBrightness,
  hasFully,
  readDeviceInfo,
  restartDevice,
} from "@/lib/fully";
import CompanyBadge from "@/components/ui/CompanyBadge";
import { LogoMark, WordmarkOnly } from "@/components/ui/Logo";
import NoticeBanner from "@/components/ui/NoticeBanner";
import EmployeeAvatar from "@/components/ui/EmployeeAvatar";
import { formatSignedDuration } from "@/lib/format";
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
  /**
   * true när administratören satt en personlig kod för personen.
   *
   * Styr BARA om knappen "Mitt flexsaldo" visas. Koden i sig lämnar aldrig
   * servern, och saldot hämtas av /api/kiosk/flex först när koden stämmer.
   */
  hasFlexCode: boolean;
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

/**
 * Ett jobb den automatiska utstämplingen stängde nyss, medan personen kanske
 * fortfarande arbetade. Se extendAutoClosed i src/lib/clock.ts.
 */
export interface KioskAutoClosedJob extends KioskActiveJob {
  /** Klockslaget det stängdes, som det står på väggen: "18:00". */
  closedAt: string;
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
  // Rast är MÖRK och inte grå eller vit. Under rasten finns ingen öppen
  // stämpling, och kortet såg därför ut precis som för den som gått hem —
  // vilket är fel svar på den enda fråga skärmen finns för att besvara.
  //
  // Tonen är Fjord, varumärkets primärfärg för mörka ytor. Den var tidigare
  // ljusblå, en färg som inte finns i paletten. Fjord säger samma sak: personen
  // är på plats, men ingen tid löper. Fyra tydligt skilda kort, alla ur
  // paletten — vitt hemma, grönt på order, gult improduktivt, Fjord på rast.
  break: "border-blue-600 bg-blue-600 active:bg-blue-700",
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

/**
 * Skärmens bild av läget, så som den sparas medan tryck väntar i kön.
 *
 * Exakt de fyra som följer regeln om kön nedan: medan tryck väntar är den
 * lokala bilden nyare än serverns. Sparades bara en del visade skärmen efter
 * ett avbrott en blandning av två tidpunkter. Se `saveView` i offline-queue.ts.
 */
interface KioskView {
  active: Record<string, ActiveJob[]>;
  breaks: Record<string, KioskBreak>;
  autoClosed: Record<string, KioskAutoClosedJob[]>;
  recent: Record<string, RecentJob>;
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
  /** Städning, möte, underhåll. Tid som aldrig når ett fakturaunderlag. */
  indirectMoments: Moment[];
  /**
   * Pågående jobb per anställd. En LISTA: en operatör kan köra två maskiner
   * samtidigt, och skärmen måste visa båda. Senast påbörjad först.
   */
  activeByEmployee: Record<string, ActiveJob[]>;
  /** Senast avslutade jobb per anställd. Underlaget för "Fortsätt". */
  recentByEmployee: Record<string, RecentJob>;
  /** Jobb som stängts automatiskt de senaste timmarna, per anställd. */
  autoClosedByEmployee: Record<string, KioskAutoClosedJob[]>;
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
  /**
   * true när företaget har löneunderlaget.
   *
   * Utan modulen finns inget flexsaldo att visa, och knappen ritas inte. Att
   * dölja den är kosmetik — rutten bakom svarar 404 oavsett, se
   * src/lib/company-modules.ts.
   */
  payroll: boolean;
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
  | {
      name: "quickCustomer";
      employee: Employee;
      orderNumber: string;
      /**
       * Vyn man kom ifrån, dit Avbryt leder tillbaka.
       *
       * Snabbjobbet nås numera från TVÅ håll: knappen i ordervyn och ett okänt
       * nummer i knappsatsen. Utan det här fältet gick Avbryt alltid till
       * knappsatsen, och den som tryckt Snabbjobb i ordervyn hamnade i en vy
       * hen aldrig varit i.
       */
      from: "order" | "orderNumber";
    }
  | {
      name: "quickMoment";
      employee: Employee;
      orderNumber: string;
      customer: KioskCustomer | null;
      from: "order" | "orderNumber";
    }
  | {
      name: "moment";
      employee: Employee;
      order: Order;
      from: "order" | "orderNumber";
    }
  | { name: "indirect"; employee: Employee; from: "order" | "orderNumber" }
  | { name: "flex"; employee: Employee };

/** Hur många siffror ett ordernummer får vara innan knappsatsen slutar ta emot. */
const MAX_ORDER_DIGITS = 10;

/** Hur lång den personliga koden får vara. Minst fyra siffror krävs. */
const MAX_CODE_DIGITS = 8;

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

/**
 * Hur ofta listorna med anställda, ordrar och moment hämtas om.
 *
 * Var femte minut tidigare, med skälet att listorna ändras sällan. Det stämde
 * inte i praktiken: stänger kontoret en order står den kvar på väggen i upp
 * till fem minuter, och den som trycker på den får ett felmeddelande i stället
 * för att stämpla in. En minut är fortfarande sällan mätt i databasfrågor, och
 * listorna hämtas dessutom om varje gång skärmen återgår till namnrutnätet.
 */
const LIST_REFRESH_MS = 60_000;

/**
 * Hur ofta en skärm vi sålt rapporterar sitt nät till adminpanelen. Tätt nog
 * att uppgiften stämmer när supporten tittar, glest nog att aldrig märkas. En
 * kunds egen dator rapporterar aldrig.
 */
const DEVICE_REPORT_MS = 5 * 60_000;

/**
 * Hur länge skärmen väntar på servern när den startar, innan den lägger
 * tillbaka sin sparade bild. Utan nät svarar frågan direkt med ett fel; tiden
 * gäller bara ett nät som finns men inte når fram.
 */
const START_PROBE_MS = 4_000;

export default function KioskScreen({
  companyName,
  deviceName,
  employees,
  orders,
  moments,
  indirectMoments,
  activeByEmployee,
  autoClosedByEmployee,
  recentByEmployee,
  customers,
  breakTypes,
  breaksByEmployee,
  subscriptionWarning,
  hasLogo,
  notices,
  payroll,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>({ name: "employees" });
  // Kvittensen behåller sin text även när den tonas ut. Nollställdes texten
  // samtidigt skulle rutan bli tom mitt i övergången, vilket ser ut som ett
  // fel snarare än ett avslut.
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * ANTALET TRYCK SOM LIGGER I KÖN, läsbart direkt.
   *
   * Står här uppe och inte nere vid kön, eftersom det är den här siffran som
   * avgör om serverns bild får tillämpas — se de tre effekterna nedan. Den
   * sätts synkront i takt med `waiting`: ett tryck och en inkommande bild kan
   * hamna i samma rendering, och en ref som uppdateras i en effekt hinner då
   * läsas med gammalt värde.
   */
  const waitingRef = useRef(0);

  /**
   * SERVERNS BILD TILLÄMPAS BARA NÄR KÖN ÄR TOM.
   *
   * Ligger det tryck kvar är den lokala bilden NYARE: trycket har hänt men
   * ännu inte nått fram. Att skriva över den då får kortet att hoppa tillbaka
   * till sitt gamla läge framför den som just tryckt.
   *
   * Regeln är samma som i `syncActive` längre ner, och den stod länge bara
   * där. Props är den andra vägen in för samma data — `router.refresh()` byter
   * ut dem — och en regel som gäller på ena vägen men inte den andra är ingen
   * regel.
   *
   * Ingenting går förlorat av att hoppa över: `drain()` hämtar om så fort
   * trycket kommit fram, och `syncActive` går var femte sekund.
   */
  const [active, setActive] = useState(activeByEmployee);
  useEffect(() => {
    if (waitingRef.current > 0) return;
    setActive(activeByEmployee);
  }, [activeByEmployee]);

  // Vilka som är på rast. Samma optimistiska mönster som stämplingarna, och
  // samma regel om kön.
  const [breaks, setBreaks] = useState(breaksByEmployee);
  useEffect(() => {
    if (waitingRef.current > 0) return;
    setBreaks(breaksByEmployee);
  }, [breaksByEmployee]);

  // Automatiskt stängda jobb. Samma regel om kön som listorna ovan.
  const [autoClosed, setAutoClosed] = useState(autoClosedByEmployee);
  useEffect(() => {
    if (waitingRef.current > 0) return;
    setAutoClosed(autoClosedByEmployee);
  }, [autoClosedByEmployee]);

  // Senaste jobb hämtas bara vid omladdning av sidan, inte i femsekunders-
  // pollningen. Det ändras ju först när någon stämplar ut, och den skärm som
  // gjorde det uppdaterar sin egen bild direkt nedan. Att en annan skärm visar
  // ett något äldre "Senast" i några minuter gör ingen skada — trycker man på
  // det ändå kontrollerar servern ordern på vanligt sätt. Svaret från
  // /api/kiosk/state ska förbli så litet som det är.
  const [recent, setRecent] = useState(recentByEmployee);
  useEffect(() => {
    if (waitingRef.current > 0) return;
    setRecent(recentByEmployee);
  }, [recentByEmployee]);

  /**
   * Jobbet någon just lämnade blir "Senast" — men BARA om momentet finns kvar.
   *
   * Avaktiveras ett arbetsmoment medan någon står instämplad på det skulle
   * utstämplingen annars lämna ett förslag som servern vägrar, och ett nedlagt
   * moment vore åter synligt på skärmen trots att det försvunnit ur rutnätet.
   * Servern gör samma kontroll vid omladdningen (se src/app/kiosk/page.tsx) —
   * den här finns för minuterna skärmen räknar själv.
   *
   * Bara momentet prövas, inte ordern: en order som skapats på plats hinner
   * inte alltid in i listan innan utstämplingen, och ett bortfiltrerat förslag
   * på ett jobb som faktiskt går att fortsätta vore ett sämre fel.
   */
  const rememberRecent = useCallback(
    (employeeId: string, job: { label: string; choice: KioskJobChoice }) => {
      const choice = job.choice;

      const stillThere =
        choice.kind === "ORDER"
          ? moments.some((moment) => moment.id === choice.moment.id)
          : indirectMoments.some(
              (moment) => moment.id === choice.indirectMoment.id
            );

      setRecent((current) => {
        const next = { ...current };

        if (stillThere) next[employeeId] = { label: job.label, choice };
        else delete next[employeeId];

        return next;
      });
    },
    [indirectMoments, moments]
  );

  /**
   * Jobbet man håller på att byta FRÅN, medan man väljer det nya.
   *
   * Utstämplingen sker först när det nya jobbet startats — se punchIn. Skedde
   * den redan vid trycket på "Byt jobb" blev den som ångrade sig utstämplad
   * utan att ha börjat något nytt, och den timmen är borta.
   */
  const [replacing, setReplacing] = useState<ActiveJob | null>(null);

  /**
   * TILLBAKA TILL NAMNRUTNÄTET, utan att röra serverns bild.
   *
   * Vägen hem för den som JUST STÄMPLAT. Hämtas sidan om här svarar servern
   * med läget FÖRE stämplingen: trycket ligger i kön och har inte nått fram
   * ännu, eftersom det skickas först efter att vyn bytts. Den bilden skrev
   * över den optimistiska, och kortet hann bli grönt, vitt och grönt igen på
   * en halv sekund. Det blinkandet är det som fick folk att trycka en gång
   * till.
   *
   * Listorna hämtas ändå om: `drain()` gör det så fort trycket kommit fram,
   * och då är svaret riktigt.
   */
  const backToGrid = useCallback(() => {
    setView({ name: "employees" });
    setError(null);
    // Avbrutet byte. Ingenting har hänt, och ingenting ska hända.
    setReplacing(null);
  }, []);

  /**
   * Tillbaka till rutnätet OCH hämta listorna på nytt.
   *
   * Vägen hem när INGENTING har hänt: avbrott och tomgång. Det är den
   * billigaste stunden att hämta på — ingen väntar, och inget val står
   * halvfärdigt. Nästa person ska se de ordrar som är öppna nu, inte de som
   * var öppna när sidan laddades.
   */
  const goHome = useCallback(() => {
    backToGrid();
    router.refresh();
  }, [backToGrid, router]);

  /**
   * TILLBAKA ETT STEG (tillagt 2026-10-30, UX-granskningen).
   *
   * Avbryt går alltid hem till namnen. Valdes fel order fanns ingen annan väg,
   * och felet kostade tre tryck: namnet, numret och ordern igen. I kundvalet
   * stod dessutom två Avbryt med olika betydelse.
   *
   * Null betyder att det inte finns något steg före det här, utom namnen.
   */
  const previousView = useCallback(
    (current: View): View | null => {
      if (current.name === "employees" || current.name === "action") return null;

      const { employee } = current;
      const hasAction = Boolean(
        active[employee.id]?.length ||
          autoClosed[employee.id]?.length ||
          recent[employee.id] ||
          breaks[employee.id]
      );
      const start: View | null = hasAction ? { name: "action", employee } : null;

      switch (current.name) {
        case "orderNumber":
          return start;
        case "order":
          return { name: "orderNumber", employee };
        case "moment":
        case "indirect":
        case "quickCustomer":
          return { name: current.from, employee };
        case "quickMoment":
          return {
            name: "quickCustomer",
            employee,
            orderNumber: current.orderNumber,
            from: current.from,
          };
        case "break":
          return { name: "action", employee };
        case "flex":
          return start ?? { name: "orderNumber", employee };
      }
    },
    [active, autoClosed, breaks, recent]
  );

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

  /**
   * true när skärmen prövat att lägga tillbaka sin sparade bild.
   *
   * Förrän dess sparas ingenting. Skärmen startar på sidans sparade kopia,
   * och utan spärren hade effekten nedan skrivit den över den sparade bilden
   * innan den hunnit läsas — och därmed raderat just det den är till för.
   */
  const [viewReady, setViewReady] = useState(false);

  /** Den bild som senast sparades, som text. Se effekten nedan. */
  const lastSavedView = useRef<string | null>(null);

  /**
   * Sparar bilden varje gång den ändras, och bara då.
   *
   * Serverns bild kommer var femte sekund och är nästan alltid densamma som
   * förra gången. En skrivning till disken varje gång hade slitit på skärmens
   * minne för ingenting, så bilden jämförs först. Den ändras när någon stämplar,
   * här eller på en annan skärm.
   */
  useEffect(() => {
    if (!viewReady) return;

    const view: KioskView = { active, breaks, autoClosed, recent };
    const text = JSON.stringify(view);
    if (text === lastSavedView.current) return;

    lastSavedView.current = text;
    void saveView(view).catch(() => {
      // Bilden är en hjälp, inte ett åtagande; trycken ligger i kön. Nästa
      // ändring försöker igen.
      lastSavedView.current = null;
    });
  }, [viewReady, active, breaks, autoClosed, recent]);

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

  /**
   * Sätter kölängden på båda ställena samtidigt.
   *
   * `waiting` ritar bannern, `waitingRef` avgör om serverns bild får
   * tillämpas. Refen uppdaterades tidigare i en effekt, alltså EFTER
   * renderingen — och en inkommande bild som hamnade i samma rendering som ett
   * tryck läste då den gamla nollan och skrev över stämplingen. Här sätts den
   * synkront, i samma andetag som tillståndet.
   */
  const setQueueLength = useCallback((next: number) => {
    waitingRef.current = next;
    setWaiting(next);
  }, []);

  /**
   * Tömmer kön och rapporterar läget.
   *
   * Anropas efter varje tryck, när nätet kommer tillbaka, och med jämna
   * mellanrum — en skärm som stått offline en natt ska hämta ikapp av sig själv
   * på morgonen utan att någon rör den.
   */
  const drain = useCallback(async () => {
    const result = await flush();
    setQueueLength(result.waiting);

    // Skärmen är inte längre kopplad. Trycken ligger kvar och skickas när den
    // kopplats igen, så det enda som behövs är att någon gör det.
    if (result.unpaired) {
      setError(
        "Skärmen är inte kopplad. Stämplingarna sparas och skickas när den kopplats igen."
      );
    }

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
  }, [router, setQueueLength]);

  /**
   * Registrerar ett tryck.
   *
   * Trycket sparas alltid i kön först och skickas sedan. Skulle skärmen dö
   * mitt i anropet ligger det kvar och skickas nästa gång.
   */
  const send = useCallback(
    async (punch: Omit<QueuedPunch, "clientPunchId" | "at">) => {
      // Kön räknas upp FÖRE skrivningen till IndexedDB, inte efter.
      //
      // Trycket är ett åtagande i samma stund som fingret träffar; skrivningen
      // är bokföring. Räknades det upp efteråt fanns en lucka på några
      // millisekunder där servern fortfarande räknades som sanning, och en
      // hämtning som råkade landa just där skrev över stämplingen.
      //
      // Skulle skrivningen fallera står siffran kvar för hög, och skärmen
      // slutar ta emot serverns bild. Det reder ut sig självt: `drain()` går
      // var trettionde sekund och sätter längden efter vad som faktiskt ligger
      // i kön.
      setQueueLength(waitingRef.current + 1);

      await enqueue({
        ...punch,
        clientPunchId: newPunchId(),
        at: new Date().toISOString(),
      });

      await drain();
    },
    [drain, setQueueLength]
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
    void pending()
      .then(async (queue) => {
        setQueueLength(queue.length);

        // Bilden skärmen har nu är sidans sparade kopia, från senast sidan
        // laddades — kanske i natt. Efter ett avbrott är den sparade bilden
        // ofta bättre. Vilken som gäller avgör shouldRestoreAtStart.
        const saved = await loadView<KioskView>();
        const restore = await shouldRestoreAtStart(saved, queue, () =>
          fetch("/api/kiosk/state", {
            cache: "no-store",
            signal: AbortSignal.timeout(START_PROBE_MS),
          }).then((response) => response.ok)
        );
        if (!restore || !saved) return;

        // Tömdes kön medan bilden lästes gäller serverns bild. Kom nätet
        // tillbaka under frågan rättar nästa hämtning bilden inom fem sekunder.
        if (queue.length > 0 && waitingRef.current === 0) return;

        setActive(saved.view.active);
        setBreaks(saved.view.breaks);
        setAutoClosed(saved.view.autoClosed);
        setRecent(saved.view.recent);
      })
      .catch(() => {
        // En bild som inte går att läsa är ingen anledning att stoppa
        // skärmen. Trycken ligger kvar i kön, och servern rättar bilden när
        // nätet kommer tillbaka.
      })
      .finally(() => setViewReady(true));

    void drain();

    const onOnline = () => void drain();
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => void drain(), 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [drain, setQueueLength]);

  /* ---------------------------------------------------------------------- */
  /* Skärmen som enhet — bara på skärmar vi sålt                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Senast tillämpade ljusstyrka, och senast SEDDA omstartsönskemål.
   *
   * `undefined` betyder "har inte sett något än". Skillnaden mot `null` är
   * avgörande för omstarten: ett önskemål som redan låg där när sidan laddades
   * får ALDRIG verkställas, för då hade varje omstart lett till nästa. Bara en
   * ändring som sker medan skärmen är igång räknas.
   *
   * Tillämpas från syncActive, som hoppar över hämtningen så länge det ligger
   * tryck kvar i kön. En skärm med osynkad arbetstid startar därför aldrig om
   * mitt i — kön överlever visserligen en omstart, men den ska inte behöva
   * bevisa det för att en administratör råkade trycka.
   */
  const brightnessRef = useRef<number | null | undefined>(undefined);
  const restartRef = useRef<string | null | undefined>(undefined);

  const applyDeviceSettings = useCallback(
    (device?: { brightness: number | null; restartRequestedAt: string | null }) => {
      if (!device || !hasFully()) return;

      if (device.brightness !== null && device.brightness !== brightnessRef.current) {
        applyBrightness(device.brightness);
      }
      brightnessRef.current = device.brightness;

      const seen = restartRef.current;
      restartRef.current = device.restartRequestedAt;

      // Första svaret sätter bara utgångsläget. Se kommentaren ovan.
      if (seen !== undefined && device.restartRequestedAt !== seen) {
        restartDevice();
      }
    },
    []
  );

  /**
   * Berättar för servern vad skärmen är.
   *
   * Bara skärmar som kör i kioskappen har något att säga. En kunds egen dator
   * hör aldrig av sig, och syns därför i adminpanelen utan fjärrkontroller —
   * vilket är hela skillnaden mellan de två sorternas skärm.
   *
   * Om och om igen, och inte bara vid laddning: nätet ändras, och en uppgift om
   * wifisignalen som lästes av för en timme sedan säger ingenting om nu. Direkt
   * när nätet kommer tillbaka också, eftersom det är just då frågan ställs.
   */
  useEffect(() => {
    const report = () => {
      const info = readDeviceInfo();
      if (!info) return;

      void fetch("/api/kiosk/device", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(info),
      }).catch(() => {
        // Nätet är nere. Rapporten är inte värd en omsändning — nästa gör om
        // den, och ingen arbetstid hänger på den.
      });
    };

    report();

    const timer = setInterval(report, DEVICE_REPORT_MS);
    window.addEventListener("online", report);

    return () => {
      clearInterval(timer);
      window.removeEventListener("online", report);
    };
  }, []);

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
        device?: {
          brightness: number | null;
          restartRequestedAt: string | null;
        };
      };

      setActive(data.active);
      setBreaks(data.breaks ?? {});
      setLastSyncedAt(new Date());
      applyDeviceSettings(data.device);
    } catch {
      // Nätet är nere. Skärmen fortsätter visa det den vet, och kön tar hand
      // om det som trycks under tiden.
    }
  }, [applyDeviceSettings]);

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
        rememberRecent(employee.id, left);
      }

      // Att börja jobba avslutar rasten, både här och på servern.
      setBreaks((current) => {
        const next = { ...current };
        delete next[employee.id];
        return next;
      });

      setReceipt(`${employee.name}: ${label}`);
      setReceiptVisible(true);
      backToGrid();

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
    [backToGrid, rememberRecent, replacing, send]
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
      rememberRecent(employee.id, job);

      // Ett automatiskt stängt jobb är nu utstämplat på riktigt.
      setAutoClosed((current) => {
        const rest = (current[employee.id] ?? []).filter(
          (entry) => jobKey(entry.choice) !== jobKey(job.choice)
        );

        const next = { ...current };
        if (rest.length > 0) next[employee.id] = rest;
        else delete next[employee.id];
        return next;
      });

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

      backToGrid();

      void send({
        action: "out",
        employeeId: employee.id,
        ...outFields(job.choice),
        label: `${employee.name}, utstämpling`,
      });
    },
    [backToGrid, rememberRecent, send]
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
        rememberRecent(employee.id, last);
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
      backToGrid();

      void send({
        action: "out-all",
        employeeId: employee.id,
        label: `${employee.name}, utstämpling från allt`,
      });
    },
    [backToGrid, rememberRecent, send]
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
        rememberRecent(employee.id, last);
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
      backToGrid();

      void send({
        action: "break",
        employeeId: employee.id,
        breakTypeId: breakType.id,
        label: `${employee.name}, ${breakType.name}`,
      });
    },
    [active, backToGrid, rememberRecent, send]
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
      backToGrid();

      void send({
        action: "break-end",
        employeeId: employee.id,
        label: `${employee.name}, rasten slut`,
      });
    },
    [backToGrid, send]
  );

  return (
    /* h-[100dvh] och inte min-h-screen. Skärmen ska ALDRIG skrollas: den
       används stående i en verkstad, ofta med handskar, och det som ligger
       under kanten finns i praktiken inte. Med min-h-screen växte sidan i
       stället förbi kanten så fort en vy hade många knappar.

       dvh och inte vh, eftersom en surfplatta i webbläsarläge har ett fält
       som kommer och går; vh räknar på det största läget och ger då en sida
       som är några tiotal punkter för hög precis hela tiden. */
    <main className="kiosk-surface flex h-[100dvh] flex-col overflow-hidden bg-neutral-50">
      <Header
        companyName={companyName}
        deviceName={deviceName}
        view={view}
        waiting={waiting}
        showQueue={stuck}
        hasLogo={hasLogo}
        lastSyncedAt={lastSyncedAt}
        onBack={goHome}
        onStepBack={
          previousView(view)
            ? () => {
                const target = previousView(view);
                if (!target) return;

                // Tillbaka vid sitt jobb: bytet är avbrutet, som i Avbryt.
                if (target.name === "action") setReplacing(null);
                setView(target);
              }
            : null
        }
        onFlex={
          // Bara när en namngiven person är vald OCH hen har en kod. På
          // startsidan finns ingen person, och saldoknappen hör till den som
          // tryckt på sitt namn.
          view.name !== "employees" &&
          view.name !== "flex" &&
          payroll &&
          view.employee.hasFlexCode
            ? () => setView({ name: "flex", employee: view.employee })
            : null
        }
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
      {/* min-h-0 är det som får flex-1 att verkligen begränsa höjden. Utan
          den växer barnet till sitt innehåll och skjuter ut underkanten, vilket
          är just det som gjorde att skärmen behövde skrollas.

          overflow-y-auto står kvar som skyddsnät för namnrutnätet: femtio
          anställda ryms inte på någon skärm, och där är skrollning rätt svar.
          Vyerna nedan är däremot byggda för att alltid få plats. */}
      <div
        key={view.name}
        className="kiosk-frame animate-view flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 lg:p-8"
      >
        {view.name === "employees" && (
          <EmployeeGrid
            employees={employees}
            active={active}
            recent={recent}
            breaks={breaks}
            // INSTÄMPLING BÖRJAR PÅ KNAPPSATSEN (ändrat 2026-10-01), precis
            // som jobbytet. Den som ska börja på ett jobb har ordernumret på
            // ritningen framför sig; rutnätet med öppna ordrar ligger kvar ett
            // tryck bort, på "Visa öppna ordrar".
            onPick={(employee) =>
              setView(
                active[employee.id]?.length ||
                autoClosed[employee.id]?.length ||
                recent[employee.id] ||
                breaks[employee.id]
                  ? { name: "action", employee }
                  : { name: "orderNumber", employee }
              )
            }
          />
        )}

        {view.name === "action" && (
          <ActionChoice
            employee={view.employee}
            jobs={active[view.employee.id] ?? []}
            autoClosed={autoClosed[view.employee.id] ?? []}
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
            //
            // GÅR TILL KNAPPSATSEN OCH INTE TILL RUTNÄTET (ändrat
            // 2026-09-29). Den som byter jobb har nästa ritning i handen och
            // numret framför sig. Rutnätet finns kvar ett tryck bort, på
            // "Visa öppna ordrar".
            onSwitchFrom={(job) => {
              setReplacing(job);
              setView({ name: "orderNumber", employee: view.employee });
            }}
            onClockOutAll={(jobs) => punchOutAll(view.employee, jobs)}
            onAdd={() => setView({ name: "orderNumber", employee: view.employee })}
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
              /* flex-wrap: tre knappar plus rubriken ryms inte bredvid
                 varandra på en smal skärm, och utan den trycks de utanför
                 kanten i stället för att hamna på en rad under. */
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  onClick={() =>
                    setView({ name: "orderNumber", employee: view.employee })
                  }
                  className="kiosk-press rounded-xl border border-neutral-200 bg-white px-5 py-4 text-base font-semibold text-neutral-900 active:bg-neutral-50 sm:text-lg"
                >
                  Slå in ordernummer
                </button>

                {/* Vägen till en order som inte finns upplagd än. Låg tidigare
                    i knappsatsen, men hör hemma här bredvid de andra sätten att
                    välja vad man ska jobba på.

                    Amber och inte vit: den som letar efter sin order ska inte
                    råka lägga upp en ny. */}
                <button
                  onClick={() =>
                    setView({
                      name: "quickCustomer",
                      employee: view.employee,
                      // Tomt nummer betyder att ordern får ett tillfälligt.
                      orderNumber: "",
                      from: "order",
                    })
                  }
                  className="kiosk-press rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-base font-semibold text-amber-900 active:bg-amber-100 sm:text-lg"
                >
                  Snabbjobb
                </button>
                {/* Ligger här och inte bland ordrarna. Improduktiv tid hör
                    inte till någon kund, och den som letar efter sin order
                    ska inte kunna råka trycka på Städning. */}
                {indirectMoments.length > 0 && (
                  <button
                    onClick={() =>
                      setView({
                        name: "indirect",
                        employee: view.employee,
                        from: "order",
                      })
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
                setView({
                  name: "moment",
                  employee: view.employee,
                  order,
                  from: "order",
                }),
            }))}
          />
        )}

        {view.name === "orderNumber" && (
          <OrderNumberPad
            employee={view.employee}
            orders={orders}
            switchingFrom={replacing?.label ?? null}
            onPick={(order) =>
              setView({
                name: "moment",
                employee: view.employee,
                order,
                from: "orderNumber",
              })
            }
            onBrowse={() =>
              setView({ name: "order", employee: view.employee })
            }
            onCreate={(orderNumber) =>
              setView({
                name: "quickCustomer",
                employee: view.employee,
                orderNumber,
                from: "orderNumber",
              })
            }
            onQuickJob={() =>
              setView({
                name: "quickCustomer",
                employee: view.employee,
                // Tomt nummer betyder att ordern får ett tillfälligt.
                orderNumber: "",
                from: "orderNumber",
              })
            }
            // Knappsatsen är numera första vyn även vid instämpling, så den
            // som ska registrera improduktiv tid hamnar här först. Vägen dit
            // måste därför finnas både här och i åtgärdsvyn.
            onIndirect={() =>
              setView({
                name: "indirect",
                employee: view.employee,
                from: "orderNumber",
              })
            }
            hasIndirect={indirectMoments.length > 0}
          />
        )}

        {view.name === "flex" && (
          <FlexPad employee={view.employee} onDone={goHome} />
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
                from: view.from,
              })
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
  onStepBack,
  onFlex,
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
  /** Ett steg bakåt. Null när steget före är namnen. */
  onStepBack: (() => void) | null;
  /** Null när saldot inte går att visa. Se KioskScreen. */
  onFlex: (() => void) | null;
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
        <p className="truncate text-[13px] text-neutral-500">{deviceName}</p>
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

        {/* MITT FLEXSALDO, som ett i uppe till höger.

            Låg som en rad i åtgärdsrutnätet, bredvid Stämpla ut och Byt
            jobb, och tog lika mycket plats som de. Men den är inte en
            stämpling: den som står vid skärmen är där för att registrera tid,
            och saldot är något man tittar på när man ändå står där. Ett i
            bredvid Avbryt tar ingen plats från det som är själva jobbet.

            Hela knappen är lika stor som Avbryt trots att tecknet är litet.
            Skärmen trycks på med en arbetshandske. */}
        {onFlex && (
          <button
            onClick={onFlex}
            aria-label="Mitt flexsaldo"
            title="Mitt flexsaldo"
            className="kiosk-press flex shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-4 text-neutral-500 active:bg-neutral-50"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" />
              <path d="M12 7.75h.01" />
            </svg>
          </button>
        )}

        {onStepBack && (
          <button
            onClick={onStepBack}
            className="kiosk-press shrink-0 rounded-xl border border-neutral-200 bg-white px-6 py-4 text-lg font-semibold text-neutral-900 active:bg-neutral-50"
          >
            Tillbaka
          </button>
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
            <span className="hidden items-center gap-2 text-neutral-500 opacity-55 sm:flex">
              <LogoMark size={24} />
              <WordmarkOnly height={11} tone="current" />
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
  breaks,
  onPick,
}: {
  employees: Employee[];
  active: Record<string, ActiveJob[]>;
  recent: Record<string, RecentJob>;
  breaks: Record<string, KioskBreak>;
  onPick: (employee: Employee) => void;
}) {
  const [letter, setLetter] = useState<string | null>(null);

  // Nästa person ska mötas av alla namn, inte av en bokstav någon lämnat kvar.
  useEffect(() => {
    if (!letter) return;
    const timer = setTimeout(() => setLetter(null), IDLE_MS);
    return () => clearTimeout(timer);
  }, [letter]);

  const showLetters = employees.length > EMPLOYEE_LETTERS_FROM;
  const letters = useMemo(
    () => firstLetters(employees.map((employee) => employee.name)),
    [employees]
  );
  const shown = letter
    ? employees.filter((employee) => firstLetter(employee.name) === letter)
    : employees;

  if (employees.length === 0) {
    return <Empty>Inga anställda upplagda. Kontakta kontoret.</Empty>;
  }

  return (
    <>
      {showLetters && (
        <LetterBar letters={letters} letter={letter} onPick={setLetter} />
      )}

      {/* Fler kolumner på en stor skärm. Fyra lät 23,6 tum rymma sexton namn,
          och resten låg under kanten. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5 min-[112.5rem]:grid-cols-6">
      {shown.map((employee) => {
        const jobs = active[employee.id] ?? [];
        const job = jobs[0];
        const last = recent[employee.id];
        const onBreak = breaks[employee.id];

        // Fylld knapp betyder "du är här": arbetar eller på rast. Vit betyder
        // utstämplad.
        const filled = Boolean(job) || Boolean(onBreak);

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
                : onBreak
                  ? JOB_TONE.break
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
                onDark={filled}
              />
              <span
                className={`min-w-0 text-xl font-semibold leading-tight sm:text-2xl ${
                  filled ? "text-white" : "text-neutral-900"
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
            ) : onBreak ? (
              /* VILKEN rast, inte bara att det är rast. Den som ser "Lunch"
                 tvärs över verkstaden vet om personen är tillbaka om tio
                 minuter eller om fyrtio. */
              <span className="mt-3 block">
                <span className="inline-flex items-center gap-2 rounded-md bg-white/15 px-2.5 py-1 text-sm font-semibold text-white ring-1 ring-inset ring-white/25">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  Rast
                </span>
                <span className="mt-1.5 block truncate text-lg font-semibold leading-snug text-white sm:text-xl">
                  {onBreak.name}
                </span>
              </span>
            ) : last ? (
              // Vad som står här är skillnaden mellan tre tryck och ett. Den
              // som ser sitt jobb redan på namnknappen vet att genvägen finns
              // innan hen ens tryckt.
              <span className="mt-3 block truncate text-sm text-neutral-500">
                Senast: {last.label}
              </span>
            ) : (
              <span className="mt-3 block text-sm text-neutral-500">
                Ej instämplad
              </span>
            )}
          </button>
        );
      })}
      </div>
    </>
  );
}

/** Över så här många anställda ryms inte namnen, och bokstavsraden dyker upp. */
const EMPLOYEE_LETTERS_FROM = 24;

function firstLetter(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/** Bokstäverna som faktiskt börjar ett namn, i svensk ordning. */
function firstLetters(names: string[]): string[] {
  return [...new Set(names.map(firstLetter))].sort((a, b) =>
    a.localeCompare(b, "sv")
  );
}

/**
 * Bokstavsraden över namn- och kundvalet.
 *
 * Bara bokstäver som faktiskt börjar ett namn visas. En rad med hela alfabetet
 * där mer än hälften inte går att trycka på är mest i vägen.
 */
function LetterBar({
  letters,
  letter,
  onPick,
}: {
  letters: string[];
  letter: string | null;
  onPick: (letter: string | null) => void;
}) {
  const on = "bg-neutral-900 text-white";
  const off =
    "border border-neutral-200 bg-white text-neutral-900 active:bg-neutral-50";

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <button
        onClick={() => onPick(null)}
        className={`kiosk-press min-h-14 min-w-14 rounded-lg px-4 text-lg font-semibold ${
          letter === null ? on : off
        }`}
      >
        Alla
      </button>
      {letters.map((option) => (
        <button
          key={option}
          onClick={() => onPick(option)}
          className={`kiosk-press min-h-14 min-w-14 rounded-lg text-lg font-semibold ${
            letter === option ? on : off
          }`}
        >
          {option}
        </button>
      ))}
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
  autoClosed,
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
  /** Jobb den automatiska utstämplingen stängt nyss. */
  autoClosed: KioskAutoClosedJob[];
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
  /** false döljer knappen: företaget saknar modulen, eller personen en kod. */
}) {
  const single = jobs.length === 1 ? jobs[0] : null;

  return (
    /* Kortet överst tar den plats det behöver; knapparna delar på resten.
       Måtten är alltså inte fasta längre — en liten skärm får lite lägre
       knappar i stället för en sida man måste skrolla. */
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
      <div className="shrink-0 rounded-xl border border-neutral-200 bg-white p-4 sm:p-6">
        <h2 className="text-2xl font-semibold sm:text-3xl">{employee.name}</h2>

        {/* Rasten står överst och med egen färg. Den som kommer tillbaka från
            lunch ska se att skärmen vet om det, annars trycker hen på nytt. */}
        {onBreak && (
          <div className="mt-3">
            <span className="block text-2xl font-semibold leading-snug text-neutral-900 sm:text-3xl">
              {onBreak.name}
            </span>
            <span className="mt-2 inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-[15px] font-semibold text-white">
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

      {/* AUTOMATISKT UTSTÄMPLAD, MEN KANSKE KVAR. Den som jobbade över
          klockslaget ser här att skärmen stängde jobbet, och stämplar ut när
          hen faktiskt går. Servern förlänger då passet och flaggar det. */}
      {!onBreak && autoClosed.length > 0 && (
        <div className="mt-3 space-y-3">
          {autoClosed.map((job) => (
            <div
              key={jobKey(job.choice)}
              className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xl font-semibold leading-snug text-neutral-900">
                  {job.label}
                </span>
                <span className="mt-1 block text-sm text-amber-900">
                  Utstämplad automatiskt {job.closedAt}
                </span>
              </span>
              <button
                onClick={() => onClockOut(job)}
                className="kiosk-press shrink-0 rounded-xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white active:bg-blue-700"
              >
                Stämpla ut nu
              </button>
            </div>
          ))}
        </div>
      )}

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

      {/* KNAPPARNA HAR ETT TAK (ändrat 2026-09-29).

          auto-rows-fr lät raderna dela på all plats som blev över. På en
          surfplatta blev det lagom; på en stor skärm blev två knappar två
          fält som tog halva bilden var, för ingenting. En knapp ska vara stor
          nog för en hand med handskar, inte så stor som ytan råkar tillåta.

          minmax behåller den nedre gränsen som löste skrollningen och lägger
          till en övre. content-start samlar raderna upptill i stället för att
          sprida ut dem när taket slagit i. */}
      <div className="mt-3 grid min-h-0 flex-1 auto-rows-[minmax(5rem,9rem)] content-start gap-3 sm:grid-cols-2">
        {/* PÅ RAST. Då är det bara två vägar vidare: tillbaka till jobbet,
            eller avsluta rasten utan att börja på något. Utstämpling och
            jobbval göms — personen har redan lämnat sina jobb, och att visa
            "Stämpla ut" för någon som inte är instämplad är en fälla. */}
        {onBreak && (
          <>
            {recent ? (
              <button
                onClick={onResume}
                className="kiosk-press min-h-20 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700"
              >
                Fortsätt
                <span className="mt-1.5 block truncate text-base font-normal text-white/80">
                  {recent.label}
                </span>
              </button>
            ) : (
              <button
                onClick={onAdd}
                className="kiosk-press min-h-20 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700"
              >
                Välj jobb
              </button>
            )}
            <button
              onClick={onEndBreak}
              className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white p-6 text-2xl font-semibold text-neutral-900 active:bg-neutral-50"
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
              className="kiosk-press min-h-20 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700"
            >
              Stämpla ut
            </button>
            <button
              onClick={() => onSwitchFrom(single)}
              className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white p-6 text-2xl font-semibold text-neutral-900 active:bg-neutral-50"
            >
              Byt jobb
              <span className="mt-1.5 block text-base font-normal text-neutral-500">
                Stämplas ut när det nya startar
              </span>
            </button>
            <button
              onClick={onAdd}
              className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white p-6 text-xl font-semibold text-neutral-900 active:bg-neutral-50 sm:col-span-2"
            >
              Lägg till jobb
              <span className="mt-1.5 block text-base font-normal text-neutral-500">
                Det pågående jobbet fortsätter
              </span>
            </button>
          </>
        )}

        {!onBreak && jobs.length > 1 && (
          <>
            <button
              onClick={onAdd}
              className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white p-6 text-xl font-semibold text-neutral-900 active:bg-neutral-50"
            >
              Lägg till jobb
            </button>
            <button
              onClick={() => onClockOutAll(jobs)}
              className="kiosk-press min-h-20 rounded-xl bg-blue-600 p-6 text-xl font-semibold text-white active:bg-blue-700"
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
              className="kiosk-press min-h-20 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700"
            >
              Fortsätt
              <span className="mt-1.5 block truncate text-base font-normal text-white/80">
                {recent.label}
              </span>
            </button>
            <button
              onClick={onAdd}
              className="kiosk-press min-h-20 rounded-xl border border-neutral-200 bg-white p-6 text-2xl font-semibold text-neutral-900 active:bg-neutral-50"
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
            className="kiosk-press min-h-20 rounded-xl border border-blue-300 bg-blue-100 p-6 text-xl font-semibold text-blue-900 active:bg-blue-200 sm:col-span-2"
          >
            Rast
            <span className="mt-1.5 block text-base font-normal text-blue-700">
              Stämplar ut från {jobs.length === 1 ? "jobbet" : "alla jobb"}
            </span>
          </button>
        )}

        {!onBreak && jobs.length === 0 && !recent && (
          <button
            onClick={onAdd}
            className="kiosk-press min-h-20 rounded-xl bg-blue-600 p-6 text-2xl font-semibold text-white active:bg-blue-700 sm:col-span-2"
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
}: {
  orderNumber: string;
  customers: KioskCustomer[];
  onPick: (customer: KioskCustomer | null) => void;
}) {
  const [letter, setLetter] = useState<string | null>(null);

  const letters = useMemo(
    () => firstLetters(customers.map((customer) => customer.name)),
    [customers]
  );

  const shown = useMemo(() => {
    if (!letter) return customers;
    return customers.filter((customer) => firstLetter(customer.name) === letter);
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
        <LetterBar letters={letters} letter={letter} onPick={setLetter} />
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

      <div className="mt-3">
        {/* Att hoppa över är tillåtet. Ordern flaggas ändå för kontoret,
            och att stå fast vid skärmen för att man inte vet vilken kund det
            är vore att förlora timmen man försökte rädda. */}
        <button
          onClick={() => onPick(null)}
          className="kiosk-press min-h-20 w-full rounded-xl border border-neutral-200 bg-white p-5 text-lg font-semibold text-neutral-500 active:bg-neutral-50"
        >
          Vet inte
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
  switchingFrom,
  onPick,
  onBrowse,
  onCreate,
  onQuickJob,
  onIndirect,
  hasIndirect,
}: {
  employee: Employee;
  orders: Order[];
  /** Jobbet man byter från, eller null. Visas så att bytet syns hela vägen. */
  switchingFrom: string | null;
  onPick: (order: Order) => void;
  onBrowse: () => void;
  /** Numret som slagits in, eller tom sträng när inget angetts. */
  onCreate: (orderNumber: string) => void;
  /** Snabbjobb utan nummer. Ordern får ett tillfälligt. */
  onQuickJob: () => void;
  /** false döljer knappen: företaget saknar modulen, eller personen en kod. */
  /** Städning, möte, underhåll. Tid som aldrig når ett fakturaunderlag. */
  onIndirect: () => void;
  /** false döljer knappen: företaget har inga improduktiva moment upplagda. */
  hasIndirect: boolean;
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
    /* Den högsta vyn i kiosken, och den som gjorde att skärmen måste skrollas:
       displayen, tolv siffertangenter och tre knappar under dem summerade till
       mer än en surfplattas höjd. Nu delar knappsatsen och knapparna på den
       plats som blir över, i stället för att var och en kräva sitt mått.

       På en bred skärm står knappsatsen i mitten och vägarna vidare i en
       kolumn på var sida, från displayen ner till bekräftelseknappen: det som
       gäller ordrar till vänster, improduktiv tid till höger. Under
       knappsatsen fick de bara den höjd som blev över och var de minsta
       tryckytorna på skärmen, fast Improduktiv tid trycks varje dag.

       VARJE del har en uttrycklig plats i rutnätet. Utan den lägger
       webbläsaren delarna i första lediga ruta, och displayen hamnade en
       gång i en sidokolumn.

       Sidokolumnerna krymper före knappsatsen: på 1024 px ryms inte tre
       kolumner i full bredd. Högerkolumnen står kvar tom utan improduktiva
       moment, så att knappsatsen fortfarande står i mitten. */
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col lg:grid lg:max-w-none lg:grid-cols-[minmax(0,14rem)_minmax(0,36rem)_minmax(0,14rem)] lg:grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] lg:justify-center lg:gap-x-6">
      {/* Vid byte står det man lämnar i rubriken. Knappsatsen ser likadan ut
          i båda fallen, och den som tryckt fel ska se det innan numret är
          inslaget. */}
      <h2 className="kiosk-frame-title mb-2 shrink-0 lg:col-start-2 lg:row-start-1 text-xl font-semibold text-neutral-900 sm:mb-4 sm:text-2xl">
        {switchingFrom
          ? `${employee.name}: byter från ${switchingFrom}`
          : `${employee.name}: slå in ordernummer`}
      </h2>

      {/* Fast höjd på både ruta och besked. Utan den hoppar knappsatsen nedåt
          i samma stund som första siffran trycks in. */}
      <div className="kiosk-frame-display flex h-16 lg:col-start-2 lg:row-start-2 shrink-0 items-center justify-center rounded-xl border-2 border-neutral-200 bg-white sm:h-24">
        <span className="text-4xl font-semibold tabular-nums tracking-[0.2em] text-neutral-900">
          {typed || <span className="text-neutral-300">—</span>}
        </span>
      </div>

      {/* Tom när inget slagits in, men raden står kvar och behåller sin höjd.
          Utan den hoppar knappsatsen uppåt i samma stund som första siffran
          trycks in och beskedet dyker upp. */}
      <div className="kiosk-frame-hint flex h-9 lg:col-start-2 lg:row-start-3 shrink-0 items-center justify-center sm:h-12">
        {match ? (
          <span className="text-lg font-semibold text-emerald-700">
            {match.customerName ?? "Kund saknas på ordern"}
          </span>
        ) : typed ? (
          <span className="text-lg font-medium text-amber-700">
            Okänt ordernummer
          </span>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-3 lg:col-start-2 lg:row-start-4 gap-2 sm:gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            onClick={() => press(digit)}
            className="kiosk-press min-h-12 rounded-xl border border-neutral-200 bg-white text-3xl font-semibold text-neutral-900 active:bg-neutral-50"
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
          className="kiosk-press flex min-h-12 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 active:bg-neutral-50"
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
          className="kiosk-press min-h-12 rounded-xl border border-neutral-200 bg-white text-3xl font-semibold text-neutral-900 active:bg-neutral-50"
        >
          0
        </button>
        <button
          onClick={() => setTyped("")}
          className="kiosk-press min-h-12 rounded-xl border border-neutral-200 bg-white text-lg font-semibold text-neutral-500 active:bg-neutral-50"
        >
          Rensa
        </button>
      </div>

      {/* EN KNAPP MED TRE LÄGEN.
          
          Tom  → släckt, det finns inget att bekräfta.
          Känt → kundens namn. Den som trycker bekräftar vilken kund arbetet
                 ska faktureras, inte en sifferrad.
          Okänt → skapar ordern med det inslagna numret.
          
          Det tredje läget satt tidigare i en egen gul knapp under den här.
          Vägen måste finnas: arbetet börjar ibland innan kontoret hunnit lägga
          upp ordern, och utan den stämplar folk på fel order eller inte alls —
          den timmen går inte att rekonstruera efteråt. Men den behöver ingen
          egen knapp, för när numret är okänt står den här ändå släckt och
          oanvänd.
          
          Färgen byter till amber i det läget. Att välja en befintlig order och
          att lägga upp en ny är olika saker, och skillnaden ska synas innan
          man trycker — en order som skapas av misstag blir en rad kontoret
          får rätta.

          Höjden är fast och rymmer två rader. Tom har knappen en rad och med
          ett nummer två, och utan fast höjd hoppade knappsatsen ovanför den
          vid första siffran. */}
      <button
        onClick={() => (match ? onPick(match) : typed && onCreate(typed))}
        disabled={!match && !typed}
        className={`kiosk-frame-cta kiosk-press mt-2 lg:col-start-2 lg:row-start-5 h-[5.5rem] w-full shrink-0 rounded-xl px-4 py-3.5 text-2xl font-semibold disabled:bg-neutral-200 disabled:text-neutral-400 ${
          match
            ? "bg-blue-600 text-white active:bg-blue-700"
            : "bg-amber-500 text-white active:bg-amber-600"
        }`}
      >
        {!match && !typed ? (
          "Slå in ett ordernummer"
        ) : !match ? (
          <>
            Skapa order {typed}
            <span className="mt-1 block text-base font-normal text-white/80">
              märks för kontoret
            </span>
          </>
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

      {/* Vägarna vidare under knappsatsen.
          
          Knappsatsen är första vyn sedan 2026-10-01, och allt som tidigare
          låg i rutnätet med öppna ordrar måste därför gå att nå härifrån.
          Improduktiv tid är det som annars hamnat längst bort, och den
          registreras varje dag.

          Under lg är de en rad under knappsatsen, och grupperna nedan finns
          inte (`contents`). Från lg är raden borta och grupperna är var sin
          sidokolumn. */}
      <div className="mt-2 flex shrink-0 flex-wrap gap-2 lg:contents">
        <div className="contents lg:col-start-1 lg:row-start-2 lg:row-end-6 lg:flex lg:flex-col lg:gap-3">
          <button
            onClick={onBrowse}
            className="kiosk-press min-h-11 flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-lg font-semibold text-neutral-900 active:bg-neutral-50 lg:text-2xl"
          >
            Visa öppna ordrar
          </button>

          {/* SNABBJOBB, också härifrån.
            
              Vägen fanns: slår man in ett nummer som inte finns blir den stora
              knappen "Skapa order NNN". Men den som INTE har ett nummer — en
              akut reparation som kontoret får lägga upp efteråt — såg ingen väg
              alls, och knappsatsen är numera första vyn även vid jobbyte.
            
              Samma amber som i ordervyn. Att lägga upp en ny order är något
              annat än att välja en befintlig, och skillnaden ska synas innan
              man trycker. */}
          <button
            onClick={onQuickJob}
            className="kiosk-press min-h-11 rounded-xl border border-amber-300 bg-amber-50 px-5 py-2.5 text-lg font-semibold text-amber-900 active:bg-amber-100 lg:flex-1 lg:text-2xl"
          >
            Snabbjobb
          </button>
        </div>

        <div className="contents lg:col-start-3 lg:row-start-2 lg:row-end-6 lg:flex lg:flex-col">
          {hasIndirect && (
            <button
              onClick={onIndirect}
              className="kiosk-press min-h-11 rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-lg font-semibold text-neutral-600 active:bg-neutral-50 lg:flex-1 lg:text-2xl"
            >
              Improduktiv tid
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * MITT FLEXSALDO.
 *
 * Den anställde anger sin personliga kod och ser sitt saldo. Koden sätts av
 * administratören under Anställda; utan kod syns knappen hit aldrig.
 *
 * Saldot visas en kort stund och skärmen går sedan hem av sig själv. Ett
 * saldo som står kvar på väggen tills nästa person råkar trycka bort det är
 * en uppgift om en namngiven person uppsatt i en verkstad.
 *
 * Knappsatsen är densamma som för ordernummer, i mindre format. Samma
 * handrörelse, och ingen ny sorts inmatning att lära sig.
 */
function FlexPad({
  employee,
  onDone,
}: {
  employee: Employee;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Saldot försvinner av sig själv. Samma skäl som kvittensen efter en
  // stämpling: nästa person vid skärmen ska inte se föregående persons tal.
  useEffect(() => {
    if (minutes === null) return;

    const timer = setTimeout(onDone, 12_000);
    return () => clearTimeout(timer);
  }, [minutes, onDone]);

  async function submit() {
    if (busy || typed.length < 4) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/kiosk/flex", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id, code: typed }),
      });

      const data = (await response.json()) as {
        minutes?: number | null;
        error?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Koden kunde inte kontrolleras.");
        setTyped("");
        return;
      }

      // Saknas schema finns ingen planerad tid, och därmed inget flexsaldo
      // att visa. Det är inte ett fel, men det ska inte stå noll.
      if (data.minutes === null || data.minutes === undefined) {
        setError("Inget flexsaldo är uträknat. Kontakta kontoret.");
        setTyped("");
        return;
      }

      setMinutes(data.minutes);
    } catch {
      setError("Ingen kontakt med servern. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  if (minutes !== null) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col items-center justify-center">
        <p className="text-xl font-semibold text-neutral-900 sm:text-2xl">
          {employee.name}
        </p>
        <p className="mt-2 text-base text-neutral-500">Flexsaldo</p>
        <p className="mt-6 text-6xl font-semibold tabular-nums text-neutral-900">
          {formatSignedDuration(minutes)}
        </p>

        <button
          onClick={onDone}
          className="kiosk-press mt-10 min-h-14 rounded-xl border border-neutral-200 bg-white px-10 py-3.5 text-xl font-semibold text-neutral-900 active:bg-neutral-50"
        >
          Klart
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">
      <h2 className="kiosk-frame-title mb-2 shrink-0 text-xl font-semibold text-neutral-900 sm:mb-4 sm:text-2xl">
        {employee.name}: ange din kod
      </h2>

      {/* Fast höjd på både ruta och besked, av samma skäl som i knappsatsen
          för ordernummer: utan den hoppar siffrorna nedåt vid första trycket. */}
      <div className="kiosk-frame-display flex h-16 shrink-0 items-center justify-center rounded-xl border-2 border-neutral-200 bg-white sm:h-24">
        <span className="text-4xl font-semibold tracking-[0.4em] text-neutral-900">
          {typed ? "•".repeat(typed.length) : (
            <span className="text-neutral-300">– – – –</span>
          )}
        </span>
      </div>

      <div className="kiosk-frame-hint flex h-9 shrink-0 items-center justify-center sm:h-12">
        {error && (
          <span className="text-lg font-medium text-amber-700">{error}</span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-3 gap-2 sm:gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            onClick={() =>
              setTyped((current) =>
                current.length >= MAX_CODE_DIGITS ? current : current + digit
              )
            }
            className="kiosk-press min-h-12 rounded-xl border border-neutral-200 bg-white text-3xl font-semibold text-neutral-900 active:bg-neutral-50"
          >
            {digit}
          </button>
        ))}

        <button
          onClick={() => setTyped((current) => current.slice(0, -1))}
          aria-label="Ta bort sista siffran"
          className="kiosk-press flex min-h-12 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 active:bg-neutral-50"
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
          onClick={() =>
            setTyped((current) =>
              current.length >= MAX_CODE_DIGITS ? current : current + "0"
            )
          }
          className="kiosk-press min-h-12 rounded-xl border border-neutral-200 bg-white text-3xl font-semibold text-neutral-900 active:bg-neutral-50"
        >
          0
        </button>
        <button
          onClick={() => setTyped("")}
          className="kiosk-press min-h-12 rounded-xl border border-neutral-200 bg-white text-lg font-semibold text-neutral-500 active:bg-neutral-50"
        >
          Rensa
        </button>
      </div>

      <button
        onClick={() => void submit()}
        disabled={typed.length < 4 || busy}
        className="kiosk-frame-cta kiosk-press mt-2 min-h-14 w-full shrink-0 rounded-xl bg-blue-600 px-4 py-3.5 text-2xl font-semibold text-white active:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400"
      >
        {busy ? "Kontrollerar…" : "Visa saldo"}
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
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
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


