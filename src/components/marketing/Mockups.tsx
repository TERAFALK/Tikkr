/**
 * PRODUKTBILDER FÖR SÄLJSIDAN.
 *
 * Byggda som kod istället för skärmdumpar. Tre skäl:
 *
 * 1. De blir skarpa i alla upplösningar, även på en retina-skärm där en
 *    skärmdump ser suddig ut.
 * 2. De kan animeras. En skärm där någon stämplar in visar på tio sekunder
 *    vad produkten gör, vilket en stillbild inte kan.
 * 3. De innehåller ingen riktig kunddata. En skärmdump från en testmiljö har
 *    en tråkig vana att innehålla något man inte tänkt på.
 *
 * DE MÅSTE HÅLLAS I TAKT MED PRODUKTEN, och det är den dyra delen av valet
 * ovan. En skärmdump blir uppenbart gammal; en ritad bild blir tyst gammal.
 * Bilderna hade glidit på fem punkter innan någon märkte det: ordervalet
 * ritades som rutnätet fastän knappsatsen är första vyn sedan 2026-10-01,
 * granskningen hade två knappar där produkten har ett fält och en, panelen
 * visade tre nyckeltal av fyra, rapporten ett stapeldiagram som inte finns,
 * och två dokument stod i ett annat tidformat än produkten. En säljsida som
 * visar en äldre version är en besvikelse som kommer fram först efter köpet.
 *
 * DÄRFÖR GÄLLER: ÄNDRAS EN YTA I PRODUKTEN ÄNDRAS BILDEN I SAMMA GREN.
 * Kolumnrubriker, knapptexter och format skrivs av ur produktens egen kod och
 * gissas inte. Siffrorna i en bild går dessutom ihop med varandra: summan är
 * summan av raderna, och priset är kostnaden gånger påslaget minus rabatten.
 * En bild vars tal inte stämmer läses av precis den sortens köpare som räknar
 * efter.
 *
 * TIDEN SKRIVS SOM DECIMALTIMMAR: "8,5", aldrig "8:30". Samma format som i
 * panelen, kiosken och varje PDF, se CLAUDE.md § 7.1 punkt 8. Bilderna stod i
 * tim:min till 2026-10-14, eftersom produkten gjorde det.
 *
 * KLOCKSLAG ÄR INTE TID SOM RÄKNAS. Ett pass som börjar "07:00" och en
 * beräknad sluttid "18:00" står kvar som klockslag — det är vad produkten
 * skriver. Bara LÄNGDER är decimala.
 *
 * RAMEN HAR INGA FÖNSTERKNAPPAR. Tre färgade prickar i hörnet härmar ett
 * operativsystem produkten inte körs i. En etikettrad som säger vad man tittar
 * på bär mer information och ljuger inte.
 */

import { initialsOf, toneFor } from "@/components/ui/EmployeeAvatar";
import { WordmarkOnly } from "@/components/ui/Logo";

/**
 * HUR TUNGT RAMEN LIGGER.
 *
 * `flat` är ramens eget förval och den som gäller när bilden står i en spalt
 * bland text: en hårfin skugga som bara skiljer pappret från ytan.
 *
 * `onDark` ligger i `globals.css` som `.plate-dark`, med skuggan i två lager.
 * Skälet till två lager står där. Den gäller när bilden ligger mot Fjord, där
 * en ljus skugga inte syns alls.
 *
 * MOT EN LJUS YTA SÄTTS DEN DJUPA SKUGGAN AV `Plate` och inte här. Skälet är
 * att den bilden dessutom lutar och har en bakplatta bakom sig, och skuggan
 * hör till den uppställningen och inte till ramen. Ramen behåller då sin egen
 * hårfina skugga, som blir uppställningens innersta lager.
 */
export type FrameLift = "flat" | "onDark";

const LIFTS: Record<FrameLift, string> = {
  flat: "shadow-[0_1px_1px_rgba(14,26,43,0.04),0_24px_48px_-28px_rgba(14,26,43,0.35)]",
  onDark: "plate plate-dark",
};

export function Frame({
  label,
  meta,
  children,
  lift = "flat",
  className = "",
}: {
  label: string;
  /** Höger sida av etikettraden, t.ex. ett filnamn eller en period. */
  meta?: string;
  children: React.ReactNode;
  lift?: FrameLift;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-neutral-200 bg-white ${LIFTS[lift]} ${className}`}
    >
      {/* Etikettraden har en hårfin ljusning överst.

          En ram utan den läses som ett utskuret fält; med den läses den som
          ett föremål med en kant som fångar ljus. Det är samma greppet som
          skuggans täta innerlager, bara från andra sidan. */}
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-linear-to-b from-white to-neutral-50 px-3 py-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
          {label}
        </span>
        {meta && (
          <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">
            {meta}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stämplingsskärmens egna delar                                               */
/* -------------------------------------------------------------------------- */

/**
 * Rubrikraden i kiosken: företaget till vänster, steget i mitten, Tikkr
 * nedtonat till höger.
 *
 * Samma uppdelning som på riktigt. Skärmen hänger på kundens vägg och är
 * deras.
 *
 * STEGET STÅR I RUBRIKEN OCH INTE I RAMENS ETIKETT. Så ligger det i
 * produkten: `STEPS` i KioskScreen ger en numrerad cirkel och en etikett mitt
 * i rubriken, och den syns bara mitt i ett val. Stod det i etikettraden ovanför
 * bilden påstod bilden att produkten har en sådan rad, vilket den inte har.
 */
export function KioskChrome({
  step,
  children,
}: {
  /** Var i flödet skärmen står. Utelämnas på namnrutnätet, som i produkten. */
  step?: { number: number; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-neutral-200 bg-white px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-[11px] font-semibold text-white">
        D
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold leading-tight text-neutral-900">
          Demo Mekaniska AB
        </span>
        <span className="block text-[10px] leading-tight text-neutral-400">
          Verkstaden
        </span>
      </span>

      {step && (
        <span className="ml-3 hidden min-w-0 items-center gap-1.5 text-[10px] font-medium text-neutral-500 sm:flex">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[8px] font-semibold text-white">
            {step.number}
          </span>
          <span className="truncate">{step.label}</span>
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-2">
        {children}
        {/* Riktiga ordmärket och inte ordet skrivet som text. Mockupen är en
            bild av produkten, och en logotyp som skiljer sig från produktens
            syns först när någon jämför en skärmdump med säljsidan. */}
        <span className="text-neutral-400">
          <WordmarkOnly height={8} tone="current" />
        </span>
      </span>
    </div>
  );
}

/** Knappen som leder tillbaka. Finns i rubriken så snart man valt ett namn. */
function CancelChip() {
  return (
    <span className="rounded-md border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-neutral-500">
      Avbryt
    </span>
  );
}

/** En person på stämplingsskärmen, som kortet faktiskt ser ut. */
export interface KioskPerson {
  name: string;
  /** Jobbet personen står på, eller null för utstämplad och för rast. */
  job: string | null;
  /**
   * Ett andra pågående jobb. En operatör som kör två maskiner har två öppna
   * stämplingar, och kortet visar båda med en bricka över dem.
   */
  alsoJob?: string;
  /** Improduktiv tid i stället för en order. Ger ett gult kort. */
  indirect?: boolean;
  /** Rasten personen är på. Ger ett Fjord-kort, och `job` är då null. */
  onBreak?: string;
  /** Det som står på en utstämplad knapp. */
  last?: string;
}

/**
 * NAMNKNAPPEN, OCH DESS FYRA LÄGEN.
 *
 * Fyllningen är hela svaret på den enda fråga skärmen finns för att besvara,
 * och den går att läsa tvärs över en verkstad: vitt hemma, grönt på order,
 * gult improduktivt, Fjord på rast. Tonerna är `JOB_TONE` i KioskScreen.
 *
 * Under namnet står JOBBET, aldrig hur länge det pågått. Ingen tidräknare:
 * den som går fram till skärmen behöver veta vad hen är instämplad på, och
 * hur många timmar det blivit står i panelen.
 */
export function KioskCard({
  person,
  size = "normal",
}: {
  person: KioskPerson;
  /** "stor" används i hero, där bilden får mer plats. */
  size?: "normal" | "stor";
}) {
  const jobs = [person.job, person.alsoJob].filter(
    (job): job is string => Boolean(job)
  );
  const working = jobs.length > 0;
  const filled = working || Boolean(person.onBreak);
  const big = size === "stor";

  // Gult kort har mörk text, som på skärmen. Se JOB_TONE i KioskScreen.
  const onAmber = working && Boolean(person.indirect);
  const ink = onAmber ? "text-fjord" : "text-white";

  const fill = working
    ? person.indirect
      ? "border-amber-500 bg-amber-500"
      : "border-emerald-600 bg-emerald-600"
    : person.onBreak
      ? "border-blue-600 bg-blue-600"
      : "border-neutral-200 bg-white";

  return (
    /*
      `h-full` SÅ ATT KNAPPARNA I EN RAD BLIR LIKA HÖGA.

      Rutnätet sträcker sina celler till radens höjd, men kortet inuti cellen
      är en vanlig blockruta och tar bara den höjd innehållet kräver. En rad
      med Anna, som kör två maskiner, och Carina, som kör en, fick därför ett
      högt kort bredvid ett lågt med en lucka under — och på en riktig
      stämplingsskärm är knapparna lika stora. Bilden ska visa skärmen och
      inte en hopplockad rad rutor.

      `min-h` står kvar: den gäller en rad där ingen har mer än ett jobb, och
      sätter då golvet för hur liten en knapp får bli.
    */
    <div
      className={`flex h-full flex-col justify-between rounded-lg border p-2.5 ${
        big ? "min-h-[86px]" : "min-h-[64px]"
      } ${fill}`}
    >
      <span className="flex items-center gap-2">
        {/* INITIALERNA OCH TONEN KOMMER UR PRODUKTENS EGNA FUNKTIONER, se
            EmployeeAvatar. Samma namn ger därmed samma bokstäver och samma
            färg här som på en riktig skärm.

            Bilderna visar fallet UTAN foto, fastkodat. Produkten visar ett
            porträtt när ett finns, men ett ansikte på säljsidan vore en
            riktig person. */}
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
            big ? "h-7 w-7 text-[10px]" : "h-6 w-6 text-[9px]"
          } ${
            onAmber
              ? "bg-fjord/10 text-fjord ring-1 ring-fjord/30"
              : filled
                ? "bg-white/20 text-white ring-1 ring-white/40"
                : `${toneFor(person.name)} ring-1 ring-neutral-200`
          }`}
        >
          {initialsOf(person.name)}
        </span>
        <span
          className={`min-w-0 truncate font-semibold leading-tight ${
            big ? "text-[12px]" : "text-[11px]"
          } ${filled ? ink : "text-neutral-900"}`}
        >
          {person.name}
        </span>
      </span>

      {working ? (
        <span className="mt-2 block">
          {/* Antalet först när flera jobb pågår. Ett dolt jobb är värre än ett
              förkortat namn, och brickan är produktens egen. */}
          {jobs.length > 1 && (
            <span
              className={`mb-1 inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${
                onAmber
                  ? "bg-fjord/10 text-fjord ring-fjord/25"
                  : "bg-white/15 text-white ring-white/25"
              }`}
            >
              <span
                className={`h-1 w-1 rounded-full ${
                  onAmber ? "bg-fjord" : "bg-white"
                }`}
              />
              {jobs.length} jobb igång
            </span>
          )}
          {jobs.map((job) => (
            <span
              key={job}
              className={`block truncate font-semibold leading-snug ${ink} ${
                big ? "text-[12px]" : "text-[11px]"
              }`}
            >
              {job}
            </span>
          ))}
        </span>
      ) : person.onBreak ? (
        /* VILKEN rast, inte bara att det är rast. Den som ser "Lunch" tvärs
           över verkstaden vet om personen är tillbaka om tio minuter eller om
           fyrtio. */
        <span className="mt-2 block">
          <span className="inline-flex items-center gap-1.5 rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold text-white ring-1 ring-inset ring-white/25">
            <span className="h-1 w-1 rounded-full bg-white" />
            Rast
          </span>
          <span
            className={`mt-1 block truncate font-semibold leading-snug text-white ${
              big ? "text-[12px]" : "text-[11px]"
            }`}
          >
            {person.onBreak}
          </span>
        </span>
      ) : person.last ? (
        <span className="mt-2 block truncate text-[10px] text-neutral-500">
          Senast: {person.last}
        </span>
      ) : (
        <span className="mt-2 block text-[10px] text-neutral-400">
          Ej instämplad
        </span>
      )}
    </div>
  );
}

/**
 * Personerna som återkommer i bilderna.
 *
 * Samma namn överallt, så att den som skrollar känner igen sig och förstår att
 * bilderna visar samma verkstad från olika håll.
 *
 * ALLA FYRA LÄGEN FINNS MED. Anna kör två maskiner, Gustav städar, Frida har
 * lunch, och tre står utstämplade. En uppsättning där alla antingen arbetar
 * eller är hemma visar hälften av vad skärmen kan säga.
 */
export const PEOPLE: KioskPerson[] = [
  {
    name: "Anna Andersson",
    job: "2601 · Svetsning",
    alsoJob: "2604 · Fräsning",
  },
  { name: "Björn Bergqvist", job: null, last: "2602 · Montering" },
  { name: "Carina Cederlund", job: "2603 · Montering" },
  { name: "David Dahl", job: null },
  { name: "Erik Ek", job: "2601 · Fräsning" },
  { name: "Frida Falk", job: null, onBreak: "Lunch" },
  { name: "Gustav Gran", job: "Städning", indirect: true },
  { name: "Hanna Holm", job: null, last: "2605 · Kapning" },
  { name: "Ivar Isaksson", job: "2605 · Kapning" },
];

/* -------------------------------------------------------------------------- */
/* Stämplingsskärmen — namnrutnätet                                            */
/* -------------------------------------------------------------------------- */

/**
 * Namnrutnätet, skärmens första vy.
 *
 * Sex kort i tre spalter, som på en liggande skärm i verkstaden. Urvalet är
 * inte de sex första i listan utan de sex som visar alla fyra lägen: två
 * ordrar på en person, en order, improduktiv tid, rast och utstämplad.
 */
const SHOWN = [0, 2, 6, 5, 8, 1].map((index) => PEOPLE[index]);

export function RunningMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Stämplingsskärmen" className={className}>
      <KioskChrome />

      <div className="grid grid-cols-2 gap-2 bg-neutral-50 p-3 sm:grid-cols-3">
        {SHOWN.map((person, index) => (
          <div
            key={person.name}
            className="animate-rise"
            style={{ animationDelay: `${200 + index * 70}ms` }}
          >
            <KioskCard person={person} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Stämplingsskärmen — knappsatsen                                             */
/* -------------------------------------------------------------------------- */

/**
 * ORDERNUMMER PÅ KNAPPSATS, och det här är vyn man möter.
 *
 * Ordervalet börjar på knappsatsen sedan 2026-10-01, både vid instämpling och
 * vid jobbyte. Den som ska börja på ett jobb har ordernumret på ritningen
 * framför sig, och rutnätet med öppna ordrar ligger ett tryck bort på "Visa
 * öppna ordrar".
 *
 * Bilden låg länge som rutnätet, alltså som den vy produkten numera har ett
 * steg bort. Det är precis den sortens glidning som gör en ritad bild tyst
 * gammal.
 *
 * KNAPPEN BEKRÄFTAR KUNDEN OCH INTE SIFFRORNA. Man bekräftar inte ett nummer
 * — man bekräftar vilken kund arbetet ska faktureras. Numret står som
 * underrad.
 */
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function OrderNumberMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Stämplingsskärmen" className={className}>
      <KioskChrome step={{ number: 2, label: "Slå in ordernummer" }}>
        <CancelChip />
      </KioskChrome>

      <div className="bg-neutral-50 p-3">
        <p className="text-[11px] font-semibold text-neutral-900">
          Anna Andersson: slå in ordernummer
        </p>

        {/* Displayen och beskedet under den har fast höjd i produkten, så att
            knappsatsen inte hoppar när första siffran trycks in. */}
        <div className="mt-2 flex h-11 items-center justify-center rounded-lg border-2 border-neutral-200 bg-white">
          <span className="text-[22px] font-semibold tabular-nums tracking-[0.2em] text-neutral-900">
            2604
          </span>
        </div>
        <div className="flex h-6 items-center justify-center">
          <span className="text-[10px] font-semibold text-emerald-700">
            Sandvik Coromant
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((key, index) => (
            <span
              key={key}
              className="animate-rise flex h-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-900"
              style={{ animationDelay: `${200 + index * 25}ms` }}
            >
              {key}
            </span>
          ))}

          {/* Ritad pil och inte tecknet ⌫, som i produkten: tecknet saknas i
              en del fonter och blir då en tom fyrkant. */}
          <span className="flex h-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
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
          </span>
          <span className="flex h-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[13px] font-semibold text-neutral-900">
            0
          </span>
          <span className="flex h-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[10px] font-semibold text-neutral-500">
            Rensa
          </span>
        </div>

        <div className="mt-1.5 rounded-lg bg-blue-600 px-3 py-2 text-center">
          <span className="block text-[12px] font-semibold text-white">
            Sandvik Coromant
          </span>
          <span className="block text-[9px] text-white/80">order 2604</span>
        </div>

        {/* Vägarna vidare under knappsatsen. Amber på snabbjobbet: att lägga
            upp en ny order är något annat än att välja en befintlig. */}
        <div className="mt-1.5 flex gap-1.5">
          <span className="flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-center text-[10px] font-semibold text-neutral-900">
            Visa öppna ordrar
          </span>
          <span className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-900">
            Snabbjobb
          </span>
          <span className="rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-neutral-600">
            Improduktiv tid
          </span>
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Stämplingsskärmen — rutnätet med öppna ordrar                               */
/* -------------------------------------------------------------------------- */

/**
 * HÖGSTA ORDERNUMMER FÖRST (ändrat 2026-10-07).
 *
 * Nya ordrar får höga nummer, och det är dem folk stämplar på. Bilden visade
 * dem i stigande ordning, alltså med det äldsta jobbet överst.
 */
const ORDERS = [
  { number: "2605", customer: "SKF Sverige" },
  { number: "2604", customer: "Sandvik Coromant" },
  { number: "2603", customer: "Atlas Copco" },
  { number: "2601", customer: "Volvo Lastvagnar" },
];

/**
 * Rutnätet med öppna ordrar, ett tryck bort från knappsatsen.
 *
 * Finns med för att visa att valet är knappar och inte en rullgardinslista.
 * Skillnaden är hela poängen för den som står med arbetshandskar på.
 *
 * De tre vägarna vid rubriken är produktens egna och ligger där med flit:
 * improduktiv tid hör inte till någon kund, och den som letar efter sin order
 * ska inte kunna råka trycka på Städning.
 */
export function OrderPickMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Stämplingsskärmen" className={className}>
      <KioskChrome step={{ number: 2, label: "Välj order" }}>
        <CancelChip />
      </KioskChrome>

      <div className="bg-neutral-50 p-3">
        <p className="text-[11px] font-semibold text-neutral-900">
          Anna Andersson: välj order
        </p>

        <div className="mb-2 mt-1.5 flex flex-wrap gap-1.5">
          <span className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-neutral-900">
            Slå in ordernummer
          </span>
          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-900">
            Snabbjobb
          </span>
          <span className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-neutral-600">
            Improduktiv tid
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ORDERS.map((order, index) => (
            <div
              key={order.number}
              className="animate-rise rounded-lg border border-neutral-200 bg-white p-3"
              style={{ animationDelay: `${200 + index * 80}ms` }}
            >
              <span className="block text-sm font-semibold leading-tight text-neutral-900">
                {order.number}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-neutral-500">
                {order.customer}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Adminpanelen — menyn                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Menyn, med sina avdelningar.
 *
 * Panelens meny är inte en platt lista utan grupper med rubrik: Dagligen,
 * Register, Uppsättning. Bilden visade en platt lista av fem rader, vilket
 * fick panelen att se mindre ut än den är.
 *
 * Uppsättningen utelämnas. Den gruppen försvinner i produkten när
 * uppsättningen är klar, och bilderna visar en arbetsyta i drift.
 */
const MENU: { title: string; items: string[] }[] = [
  {
    title: "Dagligen",
    items: ["Översikt", "Rapporter", "Veckovy", "Tidrapport", "Granskning"],
  },
  { title: "Register", items: ["Kunder", "Ordrar", "Anställda"] },
];

function Sidebar({ active }: { active: string }) {
  return (
    <div className="hidden w-36 shrink-0 border-r border-neutral-200 p-2 @2xl:block">
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-neutral-900 text-[9px] font-semibold text-white">
          D
        </span>
        <span className="truncate text-[10px] font-semibold text-neutral-900">
          Demo Mekaniska
        </span>
      </div>

      {MENU.map((group) => (
        <div key={group.title} className="mb-2">
          <p className="mb-1 px-2 text-[8px] font-semibold uppercase tracking-wider text-neutral-400">
            {group.title}
          </p>
          {group.items.map((item) => (
            <div
              key={item}
              className={`mb-0.5 flex items-center justify-between gap-1 rounded px-2 py-1 text-[10px] font-medium ${
                item === active
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-500"
              }`}
            >
              <span className="truncate">{item}</span>
              {/* Siffran vid Granskning är produktens egen. Den finns för att
                  en post utan utstämpling ska synas utan att man letar. */}
              {item === "Granskning" && (
                <span className="shrink-0 rounded bg-amber-100 px-1 text-[8px] font-semibold tabular-nums text-amber-800">
                  1
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Adminpanelen — översikten                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Översikten i panelen.
 *
 * Här STÅR tiden som gått, till skillnad från på stämplingsskärmen. Det är
 * skillnaden mellan de två ytorna: skärmen svarar på vad man är instämplad på,
 * panelen på hur länge.
 *
 * FYRA NYCKELTAL OCH INTE TRE. Öppna ordrar är det fjärde i produkten, och det
 * är dessutom det som säger att panelen håller ordning på jobben och inte bara
 * på klockan.
 *
 * Anna står på två rader. En operatör som kör två maskiner har två öppna
 * stämplingar, och båda ordrarna ska betala sin — därför är nyckeltalet fyra
 * personer och fem jobb.
 *
 * ATT GÖRA OCH ORDRAR I ARBETE (2026-10-20). Översikten fick två kort till,
 * och bilden följde med samma dag. Planerat idag står inte med: det hör till
 * ett tillval, och bilden visar basen.
 */
const ROWS = [
  {
    name: "Anna Andersson",
    order: "2601",
    customer: "Volvo Lastvagnar",
    moment: "Svetsning",
    time: "2,25",
  },
  {
    name: "Anna Andersson",
    order: "2604",
    customer: "Sandvik Coromant",
    moment: "Fräsning",
    time: "1,67",
  },
  {
    name: "Carina Cederlund",
    order: "2603",
    customer: "Atlas Copco",
    moment: "Montering",
    time: "0,8",
  },
  {
    name: "Erik Ek",
    order: "2601",
    customer: "Volvo Lastvagnar",
    moment: "Fräsning",
    time: "3,08",
  },
  {
    name: "Gustav Gran",
    order: null,
    customer: null,
    moment: "Städning",
    time: "0,42",
  },
];

const TODO = [
  { title: "1 stämpling att granska", detail: null },
  { title: "Svetsen", detail: "Ingen kontakt sedan 2026-10-19 15:42." },
];

/**
 * Registrerat och beräknat, i timmar. Andelen ger stapelns längd; 2603 har
 * dragit över och står i gult, som i produkten.
 */
const IN_PROGRESS = [
  { order: "2601", customer: "Volvo Lastvagnar", hours: "42,25", share: 75 },
  { order: "2603", customer: "Atlas Copco", hours: "28", share: 117 },
  { order: "2604", customer: "Sandvik Coromant", hours: "14,25", share: 36 },
];

export function AdminMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen" meta="översikt" className={className}>
      {/* BILDEN RÄKNAR PÅ SIN EGEN BREDD, inte fönstrets (`@container`). På
          säljsidan står den i en smal spalt på en bred skärm. Med `sm:` fick
          den skrivbordets kolumner i en halv spalt: namnen försvann, rubrikerna
          hamnade i varandra och tiden kapades vid kanten. */}
      <div className="flex @container">
        <Sidebar active="Översikt" />

        <div className="min-w-0 flex-1 bg-neutral-50 p-3">
          <div className="mb-3 grid grid-cols-2 gap-2 @lg:grid-cols-4">
            <Stat
              label="Arbetar just nu"
              value="4"
              hint="5 pågående jobb"
              tone="emerald"
            />
            <Stat label="Registrerat idag" value="18,5" hint="Vecka 43: 96,25" />
            <Stat label="Att granska" value="1" tone="amber" />
            <Stat label="Öppna ordrar" value="4" />
          </div>

          <div className="grid gap-2 @4xl:grid-cols-3">
          <div className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-white @4xl:col-span-2">
            <div className="border-b border-neutral-200 px-3 py-1.5">
              <span className="text-[10px] font-semibold text-neutral-900">
                Pågående arbete
              </span>
            </div>

            <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50/70 px-3 py-1">
              <span className="min-w-0 flex-1 text-[9px] font-medium uppercase tracking-wider text-neutral-400">
                Anställd
              </span>
              <span className="w-20 shrink-0 text-[9px] font-medium uppercase tracking-wider text-neutral-400">
                Order
              </span>
              <span className="hidden w-24 shrink-0 text-[9px] font-medium uppercase tracking-wider text-neutral-400 @md:block">
                Arbetsmoment
              </span>
              <span className="w-10 shrink-0 text-right text-[9px] font-medium uppercase tracking-wider text-neutral-400">
                Tid
              </span>
            </div>

            {ROWS.map((row, index) => (
              <div
                key={`${row.name}-${row.order ?? row.moment}`}
                className="animate-rise flex items-center gap-2 border-b border-neutral-100 px-3 py-1.5 last:border-0"
                style={{ animationDelay: `${500 + index * 80}ms` }}
              >
                <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-neutral-900">
                  {row.name}
                </span>
                <span className="w-20 shrink-0 text-[10px] text-neutral-500">
                  {row.order ?? (
                    <span className="rounded bg-neutral-100 px-1 py-0.5 text-[9px] font-medium text-neutral-600">
                      Improduktiv
                    </span>
                  )}
                </span>
                <span className="hidden w-24 shrink-0 text-[10px] text-neutral-500 @md:block">
                  {row.moment}
                </span>
                <span className="w-10 shrink-0 text-right">
                  <span className="rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-medium tabular-nums text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    {row.time}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {/* Att göra, med samma sorts rader som produkten skriver. */}
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-3 py-1.5">
              <span className="text-[10px] font-semibold text-neutral-900">
                Att göra
              </span>
            </div>
            {TODO.map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-2 border-b border-neutral-100 px-3 py-1.5 last:border-0"
              >
                <span className="mt-1 size-1 shrink-0 rounded-full bg-amber-500" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-medium text-neutral-900">
                    {item.title}
                  </span>
                  {item.detail && (
                    <span className="block text-[8px] text-neutral-500">
                      {item.detail}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          </div>

          {/* Ordrar i arbete. Staplarna växer fram som i panelen. */}
          <div className="mt-2 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-3 py-1.5">
              <span className="text-[10px] font-semibold text-neutral-900">
                Ordrar i arbete
              </span>
            </div>
            {IN_PROGRESS.map((order, index) => {
              const over = order.share > 100;

              return (
                <div
                  key={order.order}
                  className="flex items-center gap-3 border-b border-neutral-100 px-3 py-1.5 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[10px]">
                    <span className="font-medium text-tick-deep">
                      {order.order}
                    </span>
                    <span className="ml-1.5 text-neutral-500">
                      {order.customer}
                    </span>
                  </span>
                  <span className="hidden w-24 shrink-0 @md:block">
                    <span className="block h-1 overflow-hidden rounded-full bg-neutral-100">
                      <span
                        className={`animate-grow-x block h-full rounded-full ${
                          over ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{
                          width: `${Math.min(100, order.share)}%`,
                          ["--i" as string]: index + 6,
                        }}
                      />
                    </span>
                  </span>
                  <span className="w-10 shrink-0 text-right text-[10px] font-medium tabular-nums text-neutral-900">
                    {order.hours}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "emerald" | "amber";
}) {
  const valueTone =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : "text-neutral-900";

  return (
    <div className="flex h-full flex-col rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
      {/* Etiketten bryter rader i stället för att kapas. Fyra nyckeltal står
          bredvid varandra i en bild som är en halv spalt bred, och "Ogranska…"
          är ett ord som inte betyder något.

          HÖJDEN ÄR RESERVERAD FÖR TVÅ RADER, och det är hela skälet att den
          står här. "Att granska" ryms på en rad och "Arbetar just nu" på två,
          och utan reserverad höjd hamnade de fyra talen under varandra på
          fyra olika höjder. En rad nyckeltal med talen i otakt ser ut som ett
          fel i bilden, inte som fyra olika långa etiketter. */}
      <span className="block min-h-[2.1em] text-[9px] font-medium leading-tight text-neutral-500">
        {label}
      </span>
      <span className={`block text-sm font-semibold tabular-nums ${valueTone}`}>
        {value}
      </span>
      {/* Tipsraden ligger sist och trycks nedåt, så att den inte flyttar
          talet ovanför i de rutor som har en. */}
      {hint && (
        <span className="mt-auto block pt-0.5 text-[8px] leading-tight text-neutral-400">
          {hint}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Adminpanelen — rapporten                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Rapporten. Summeringen som svarar på vad som ska faktureras.
 *
 * INGA STAPLAR. Bilden ritade ett stapeldiagram per order, och det finns inte
 * i produkten: summeringarna är listor med namn till vänster och tid till
 * höger. En bild som visar ett diagram kunden inte får är ett löfte som bryts
 * efter köpet, och det var dessutom det enda i bilden som inte gick att peka
 * på i panelen.
 *
 * Kvar står det som faktiskt finns: fyra nyckeltal, summeringarna per order,
 * kund, anställd och arbetsmoment, och de två uttagen.
 *
 * TVÅ UTTAG OCH INGEN UTSKRIFT. Rapporten lämnas ut som PDF eller Excel.
 * Utskriftsknappen finns på underlagen och på tidrapporten, inte här.
 */
const REPORT = [
  { order: "2601", customer: "Volvo Lastvagnar", hours: "42,25" },
  { order: "2603", customer: "Atlas Copco", hours: "28" },
  { order: "2604", customer: "Sandvik Coromant", hours: "14,25" },
];

export function ReportMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen" meta="rapporter" className={className}>
      <div className="flex @container">
        <Sidebar active="Rapporter" />

        <div className="min-w-0 flex-1 bg-neutral-50 p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-neutral-900">
              Rapporter
            </span>
            <span className="ml-auto rounded-md border border-neutral-200 bg-white px-2 py-1 text-[9px] font-semibold text-neutral-700">
              Ladda ner PDF
            </span>
            <span className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[9px] font-semibold text-neutral-700">
              Ladda ner Excel
            </span>
          </div>

          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {["Förra veckan", "Alla ordrar", "Ordertid"].map((chip) => (
              <span
                key={chip}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[9px] font-medium text-neutral-600"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="mb-2.5 grid grid-cols-2 gap-2 @lg:grid-cols-4">
            <Stat label="Total tid" value="84,5" hint="timmar" />
            <Stat label="Stämplingar" value="37" />
            <Stat label="Pågår just nu" value="4" tone="emerald" />
            <Stat label="Ogranskade" value="1" tone="amber" />
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-2.5">
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-500">
              Per order
            </p>
            <ul>
              {REPORT.map((row, index) => (
                <li
                  key={row.order}
                  className="animate-rise flex items-baseline gap-2 py-1"
                  style={{ animationDelay: `${300 + index * 90}ms` }}
                >
                  <span className="text-[10px] font-medium text-neutral-900">
                    {row.order}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-neutral-500">
                    {row.customer}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium tabular-nums text-neutral-900">
                    {row.hours}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Adminpanelen — granskning                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Posten där utstämplingen saknas.
 *
 * ETT FÄLT OCH EN KNAPP, inte två knappar. Bilden visade "Ange rätt sluttid"
 * och "Godkänn" bredvid varandra, alltså den uppställning produkten hade innan
 * den togs bort: valet låg på den som granskar fastän servern kan göra det
 * bättre, och de två knapparna såg ut att göra samma sak. Nu finns en fråga att
 * svara på — när slutade arbetet? — och servern avgör själv om tiden godkändes
 * eller rättades.
 *
 * Sluttiden i fältet är den beräknade, ifylld i förväg. Den som bara ska
 * godkänna behöver därför inte skriva något.
 */
export function ReviewMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Adminpanelen" meta="granskning" className={className}>
      <div className="bg-neutral-50 p-3">
        <div className="mb-2.5 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          <span className="text-[10px] font-medium text-amber-900">
            1 stämpling att granska
          </span>
        </div>

        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-3 py-2">
            <p className="text-[10px] font-semibold text-neutral-900">
              1 stämpling att granska
            </p>
            <p className="text-[9px] text-neutral-500">
              Rätta sluttiden eller godkänn den.
            </p>
          </div>

          <div className="px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium text-neutral-900">
                  David Dahl
                </span>
                <span className="block truncate text-[9px] text-neutral-500">
                  2601 · Lackering · Volvo Lastvagnar
                </span>
                <span className="mt-0.5 block text-[9px] text-amber-800">
                  Stämplades inte ut. Stängdes automatiskt 18:00.
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-amber-700 ring-1 ring-inset ring-amber-200">
                  10,8
                </span>
                <span className="mt-1 block text-[8px] text-neutral-400">
                  beräknad till 18:00
                </span>
              </span>
            </div>

            <p className="mt-1.5 text-[9px] text-neutral-500">
              Instämplad <span className="tabular-nums">2026-04-16 07:12</span>
            </p>

            {/* Fältet bär den beräknade sluttiden, som i produkten. Knappen
                heter Godkänn tills tiden ändrats. */}
            <div className="mt-2 flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate rounded-md border border-neutral-400 bg-white px-2 py-1 text-[10px] tabular-nums text-neutral-900">
                2026-04-16 18:00
              </span>
              <span className="shrink-0 rounded-md bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold text-white">
                Godkänn
              </span>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Dokument 1 — underlaget till kunden                                         */
/* -------------------------------------------------------------------------- */

/**
 * Underlaget som skickas vidare till kundens kund.
 *
 * Logotypsrutan överst är med avsikt. Det är den detalj som gör skillnaden
 * mellan en systemutskrift och ett dokument från leverantören.
 *
 * DECIMALTIMMAR, som dokumentet. Kolumnrubriken bär enheten, också som i
 * dokumentet: "Tid (timmar)".
 *
 * Kundens adress och organisationsnummer står under namnet. De skrevs för hand
 * varje gång innan kundregistret fanns, och att de står där är skälet att
 * underlaget går att bifoga en faktura utan att kompletteras.
 *
 * BELOPPEN SAKNAS MED FLIT. De tas med först när den som tar ut underlaget
 * kryssar i det, och utan kryss visas bara tid. Självkostnad och marginal kan
 * aldrig hamna här, se order-price.ts.
 */
export function ExportMockup({ className = "" }: { className?: string }) {
  const rows = [
    ["Anna Andersson", "Svetsning", "7,5"],
    ["Erik Ek", "Fräsning", "8"],
    ["Carina Cederlund", "Montering", "4,25"],
    ["Anna Andersson", "Kvalitetskontroll", "3"],
  ];

  return (
    <Frame label="Till kunden" meta="order-2601.pdf" className={className}>
      <div className="px-4 py-4">
        <div className="flex h-7 w-20 items-center justify-center rounded border border-dashed border-neutral-300 text-[8px] text-neutral-400">
          er logotyp
        </div>

        <p className="mt-2 text-[10px] font-semibold text-neutral-900">
          Demo Mekaniska AB
        </p>

        <p className="mt-3 text-[13px] font-semibold text-neutral-900">
          Order 2601
        </p>
        <p className="text-[10px] text-neutral-700">Volvo Lastvagnar</p>
        <p className="text-[9px] leading-snug text-neutral-500">
          Gropegårdsgatan 2
          <br />
          417 15 Göteborg
          <br />
          Org.nr 556013-9700
        </p>

        <p className="mt-2 text-[8px] text-neutral-500">
          Period: 2026-04-13 – 2026-04-17 · Underlag skapat 2026-04-17
        </p>

        <table className="mt-2.5 w-full text-[10px]">
          <thead>
            <tr className="bg-neutral-900 text-white">
              <th className="px-2 py-1 text-left font-medium">Anställd</th>
              <th className="px-2 py-1 text-left font-medium">Arbetsmoment</th>
              <th className="px-2 py-1 text-right font-medium">
                Tid (timmar)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join()} className="border-b border-neutral-100">
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={`px-2 py-1 ${
                      index === 2
                        ? "text-right tabular-nums text-neutral-900"
                        : "text-neutral-600"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-1 flex items-center justify-between rounded bg-neutral-100 px-2 py-1.5">
          <span className="text-[10px] font-semibold text-neutral-900">
            TOTALT
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-neutral-900">
            22,75
          </span>
        </div>

        {/* Jämförelsen med den beräknade tiden står direkt under totalen,
            eftersom det är där den görs. */}
        <p className="mt-1 text-[8px] text-neutral-500">
          Beräknad tid 24. Upparbetat 95 %.
        </p>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Dokument 2 — efterkalkylen                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Efterkalkylen.
 *
 * Bandet överst är produktens eget och står först av allt, före logotypen: det
 * ska inte gå att missa vad man håller i, och en logotyp överst får ett papper
 * att se ut som något man skickar vidare.
 *
 * INGA TIMKOSTNADER, som i dokumentet: pappret rör sig, och vad en namngiven
 * person kostar i timmen hör inte hemma på ett bord i verkstaden. Kvar står
 * tiden och kostnaden per arbetsmoment.
 *
 * RADERNA PER ANSTÄLLD UTELÄMNAS, delsummorna står kvar. Dokumentet
 * grupperar per arbetsmoment med en rad per stämpling under varje rubrik och
 * en delsumma sist i gruppen. Bilden är en tredjedel av en spalt bred och
 * rymmer inte sex kolumner; delsummorna är det den som läser kalkylen går
 * till, och de är ett äkta utsnitt av dokumentet och inte en egen tabell.
 *
 * SUMMERINGENS ETIKETTER ÄR DOKUMENTETS EGNA. "Självkostnad" och "Påslag
 * 40 %" stod här tidigare; raderna heter "Total operationskostnad" och
 * "Påslag ×1,40", och påslaget skrivs med varifrån det kom, eftersom tre
 * ställen kan bestämma det.
 */
export function CalcMockup({ className = "" }: { className?: string }) {
  const rows = [
    ["Svetsning", "12,5", "10 625,00 kr"],
    ["Fräsning", "8", "7 200,00 kr"],
    ["Montering", "4,25", "2 550,00 kr"],
  ];

  return (
    <Frame label="Internt" meta="efterkalkyl-2601.pdf" className={className}>
      <div className="px-4 py-4">
        <div className="rounded bg-neutral-900 px-2 py-1.5">
          <span className="text-[8px] font-semibold uppercase tracking-wider text-white">
            Internt underlag
          </span>
        </div>

        <p className="mt-2.5 text-[10px] font-semibold text-neutral-900">
          Demo Mekaniska AB
        </p>

        <p className="mt-2.5 text-[13px] font-semibold text-neutral-900">
          Efterkalkyl order 2601
        </p>
        <p className="text-[10px] text-neutral-700">Volvo Lastvagnar</p>
        <p className="mt-1 text-[8px] text-neutral-500">
          Period: 2026-04-13 – 2026-04-17 · 12 stämplingar
        </p>

        <table className="mt-2.5 w-full text-[10px]">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-1 text-left font-medium">Arbetsmoment</th>
              <th className="py-1 text-right font-medium">Tid (timmar)</th>
              <th className="py-1 text-right font-medium">Kostnad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-b border-neutral-100">
                <td className="py-1 text-neutral-700">{row[0]}</td>
                <td className="py-1 text-right tabular-nums text-neutral-600">
                  {row[1]}
                </td>
                <td className="py-1 text-right tabular-nums text-neutral-900">
                  {row[2]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-2.5 space-y-1 text-[10px]">
          <Line label="Total operationstid (timmar)" value="24,75" />
          <Line label="Total operationskostnad" value="20 375,00 kr" />
          <Line label="Påslag ×1,40 (kundens)" value="8 150,00 kr" />
          <Line label="Rabatt 5 % (kundens)" value="−1 426,25 kr" muted />
        </dl>

        <div className="mt-2 flex items-center justify-between rounded bg-neutral-900 px-2 py-1.5">
          <span className="text-[10px] font-semibold text-white">PRIS</span>
          <span className="text-[10px] font-semibold tabular-nums text-white">
            27 098,75 kr
          </span>
        </div>
      </div>
    </Frame>
  );
}

function Line({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={muted ? "text-neutral-500" : "text-neutral-600"}>
        {label}
      </dt>
      <dd className="shrink-0 tabular-nums text-neutral-900">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dokument 3 — tidrapporten                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Tidrapporten per anställd. Underlaget som går vidare till lönen.
 *
 * DOKUMENTET LISTAR STÄMPLINGAR PER DAG, inte en rad per dag med planerat och
 * utfall bredvid varandra. Bilden visade det senare, alltså en tabell som inte
 * finns: dagen är en rubrik, raderna under den är passen med start och stopp,
 * och en fet dagssumma avslutar dagen. Frånvaro står som en egen rad i gult,
 * raster i grått.
 *
 * DECIMALTIMMAR, som dokumentet. Saldon får sitt tecken utskrivet: "+0,25".
 *
 * SAMMANSTÄLLNINGEN ÄR KUNDENS EGEN ORDNING, två kolumner i tre rader, och
 * talen går ihop enligt flexformeln i CLAUDE.md § 3 regel 7: arbetad tid plus
 * frånvaro minus planerad tid minus uttagen flex. 32,25 + 8 − 40 = +0,25.
 *
 * UNDERSKRIFTSRADEN ÄR MED. Den är raden förmannen skriver på, och fälten är
 * kundens egna från blanketten de använt i tio år.
 */
interface TimesheetRow {
  what: string;
  from: string;
  to: string;
  time: string;
}

interface TimesheetEntry {
  day: string;
  /** Frånvaron har varken start eller stopp, bara ett antal minuter. */
  absence?: { what: string; time: string };
  rows: TimesheetRow[];
  rest?: TimesheetRow;
  /** Dagssumman. Saknas på en dag utan arbetad tid, som i dokumentet. */
  sum?: string;
}

const DAYS: TimesheetEntry[] = [
  {
    day: "Må 2026-04-13",
    rows: [
      { what: "2601 · Svetsning", from: "07:00", to: "11:30", time: "4,5" },
      { what: "2604 · Fräsning", from: "12:15", to: "16:00", time: "3,75" },
    ],
    rest: { what: "Lunch", from: "11:30", to: "12:15", time: "0,75" },
    sum: "8,25",
  },
  {
    day: "Ti 2026-04-14",
    absence: { what: "Sjuk", time: "8" },
    rows: [],
  },
  {
    day: "On 2026-04-15",
    rows: [
      { what: "2603 · Montering", from: "07:00", to: "15:45", time: "8" },
    ],
    rest: { what: "Lunch", from: "11:30", to: "12:15", time: "0,75" },
    sum: "8",
  },
];

export function TimesheetMockup({ className = "" }: { className?: string }) {
  return (
    <Frame label="Till lönen" meta="tidrapport.pdf" className={className}>
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-semibold text-neutral-900">
            Demo Mekaniska AB
          </p>
          <span className="shrink-0 text-right">
            <span className="block text-[8px] text-neutral-500">Anställd</span>
            <span className="block text-[11px] font-semibold tabular-nums text-neutral-900">
              12
            </span>
          </span>
        </div>

        {/* Namnrutan i Snö, med företaget och perioden till höger. */}
        <div className="mt-2 flex items-end justify-between gap-3 rounded bg-neutral-100 px-2 py-1.5">
          <span>
            <span className="block text-[8px] text-neutral-500">Namn</span>
            <span className="block text-[11px] font-semibold text-neutral-900">
              Johan Andersson
            </span>
          </span>
          <span className="shrink-0 text-[8px] tabular-nums text-neutral-500">
            2026-04-13 – 2026-04-17
          </span>
        </div>

        <table className="mt-2.5 w-full text-[9px]">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-1 text-left font-medium">Dag</th>
              <th className="py-1 text-left font-medium">Order</th>
              <th className="py-1 text-right font-medium">Start</th>
              <th className="py-1 text-right font-medium">Stopp</th>
              <th className="py-1 text-right font-medium">Tid</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map((entry) => (
              <TimesheetDay key={entry.day} entry={entry} />
            ))}
          </tbody>
        </table>

        <div className="mt-1 flex items-center justify-between rounded bg-neutral-100 px-2 py-1.5">
          <span className="text-[10px] font-semibold text-neutral-900">
            Totalt för perioden
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-neutral-900">
            32,25
          </span>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-3 rounded bg-neutral-100 px-2 py-2 text-[9px]">
          <Line label="Planerad tid" value="40" />
          <Line label="Närvarotid" value="32,25" />
          <Line label="Frånvaro" value="8" />
          <Line label="Rast" value="3" />
          <Line label="Flextid, perioden" value="+0,25" />
          <Line label="Flexsaldo" value="+2,5" />
        </dl>

        {/* Underskriftsfälten, kundens egna. Ritas alltid i dokumentet. */}
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {["Spara ___ tim", "Övertid ok", "Tidrapport ok"].map((field) => (
            <span key={field} className="block">
              <span className="block text-[8px] text-neutral-500">
                {field}
              </span>
              <span className="mt-2.5 block border-t border-neutral-300" />
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function TimesheetDay({ entry }: { entry: TimesheetEntry }) {
  return (
    <>
      {entry.absence && (
        <tr className="border-b border-neutral-100">
          <td className="py-1 text-amber-700">{entry.day}</td>
          <td className="py-1 text-amber-700" colSpan={3}>
            {entry.absence.what}
          </td>
          <td className="py-1 text-right tabular-nums text-amber-700">
            {entry.absence.time}
          </td>
        </tr>
      )}

      {entry.rows.map((row) => (
        <tr key={row.what} className="border-b border-neutral-100">
          <td className="py-1 text-neutral-900">{entry.day}</td>
          <td className="truncate py-1 text-neutral-700">{row.what}</td>
          <td className="py-1 text-right tabular-nums text-neutral-600">
            {row.from}
          </td>
          <td className="py-1 text-right tabular-nums text-neutral-600">
            {row.to}
          </td>
          <td className="py-1 text-right tabular-nums text-neutral-900">
            {row.time}
          </td>
        </tr>
      ))}

      {entry.rest && (
        <tr className="border-b border-neutral-100 text-neutral-400">
          <td className="py-1">{entry.day}</td>
          <td className="py-1">{entry.rest.what}</td>
          <td className="py-1 text-right tabular-nums">{entry.rest.from}</td>
          <td className="py-1 text-right tabular-nums">{entry.rest.to}</td>
          <td className="py-1 text-right tabular-nums">{entry.rest.time}</td>
        </tr>
      )}

      {entry.sum && (
        <tr className="border-b border-neutral-200">
          <td colSpan={4} />
          <td className="py-1 text-right font-semibold tabular-nums text-neutral-900">
            {entry.sum}
          </td>
        </tr>
      )}
    </>
  );
}
