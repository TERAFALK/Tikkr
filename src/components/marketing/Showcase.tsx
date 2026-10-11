import { PlateGlow } from "./Atmosphere";
import {
  AdminMockup,
  CalcMockup,
  ExportMockup,
  OrderNumberMockup,
  OrderPickMockup,
  ReportMockup,
  ReviewMockup,
  RunningMockup,
  TimesheetMockup,
} from "./Mockups";

/**
 * HUR PRODUKTBILDERNA STÄLLS FRAM.
 *
 * `Mockups.tsx` ritar vad gränssnittet INNEHÅLLER. Den här filen avgör hur det
 * står på sidan: hur djupt det ligger, vad som lyser bakom det, om det lutar
 * och vad som händer när pekaren vilar på det.
 *
 * DE TVÅ UPPGIFTERNA ÄR MEDVETET SKILDA. Bilderna ska hållas i takt med
 * produkten, och det är en annan sorts ändring än att flytta ett ljus. Låg
 * presentationen inne i varje bild skulle en ändring av ljuset kräva åtta
 * likadana ändringar i åtta bilder, och den som uppdaterar en knapptext i
 * kiosken skulle behöva läsa förbi trettio rader skuggor för att hitta den.
 *
 * LUTNINGEN GÄLLER FRÅN `lg` OCH UPPÅT, ALLTID. En lutad produktbild på en
 * telefon är en bild man inte kan läsa, och poängen med bilderna är att de ska
 * gå att läsa — en besökare ska kunna se vad en knapp heter. Därför bär varje
 * lutning här ett `lg:`-prefix, och på en telefon står bilderna rakt.
 */

/* -------------------------------------------------------------------------- */
/* Plattan                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * EN PRODUKTBILD SOM ETT FÖREMÅL PÅ ETT BORD.
 *
 * Tre lager i ordning bakifrån: glöden, en tonad bakplatta en aning förskjuten
 * uppåt, och bilden själv.
 *
 * BAKPLATTAN ÄR DET SOM GÖR DJUPET. En bild med skugga ser ut att ligga strax
 * ovanför ytan; en bild med en andra kant bakom sig ser ut att ligga ovanpå
 * något. Den är vriden ett par tiondels grader mer än bilden, så att kanten
 * sticker fram längs en sida i stället för runt om — en jämn ram bakom en bild
 * läses som en ram och inte som ett lager.
 *
 * AVSNITTET SOM BÄR EN PLATTA MÅSTE KLIPPA I SIDLED (`overflow-hidden`).
 * Glöden går fyrtio pixlar utanför bilden åt båda håll, och den bilden ligger
 * längst ut i sin spalt. Utan klippning blir de fyrtio pixlarna sexton pixlar
 * bredare dokument än fönster, alltså en vågrät rullningslist på en sida som
 * inte har något att visa i sidled. Det syns inte på en bred skärm och är det
 * första man märker på en smal.
 *
 * `group` gör att hela plattan reagerar som en enhet när pekaren vilar på den:
 * bilden lyfter, lutningen rätas ut en aning och glöden tar i. Rätar man ut
 * lutningen vid beröring blir rörelsen ett svar — föremålet vänder sig mot den
 * som tittar.
 */
export function Plate({
  children,
  tone = "onLight",
  tilt = "right",
  className = "",
}: {
  children: React.ReactNode;
  /** Ytan bakom plattan. Avgör skuggans och glödens färg. */
  tone?: "onLight" | "onDark";
  /** Vilket håll bilden lutar. `none` för en bild som står rakt. */
  tilt?: "left" | "right" | "none";
  className?: string;
}) {
  const dark = tone === "onDark";

  /*
    Lutningen i tre delar: vridning kring Y-axeln ger djupet, en knapp vridning
    kring Z-axeln ger att bilden ligger ned på bordet, och perspektivet gör att
    den bortre kanten faktiskt blir mindre. Utan perspektiv blir en Y-vridning
    bara en platt sammanpressning.
  */
  const TILTS = {
    right:
      "lg:[transform:perspective(1800px)_rotateY(-7deg)_rotateX(2deg)_rotateZ(0.6deg)] lg:group-hover:[transform:perspective(1800px)_rotateY(-3deg)_rotateX(1deg)_rotateZ(0.2deg)_translateY(-8px)]",
    left: "lg:[transform:perspective(1800px)_rotateY(7deg)_rotateX(2deg)_rotateZ(-0.6deg)] lg:group-hover:[transform:perspective(1800px)_rotateY(3deg)_rotateX(1deg)_rotateZ(-0.2deg)_translateY(-8px)]",
    none: "lg:group-hover:[transform:translateY(-8px)]",
  } as const;

  return (
    <div className={`group relative ${className}`}>
      <PlateGlow
        tone={tone}
        className="-inset-x-10 -inset-y-8 opacity-70 transition-opacity duration-700 group-hover:opacity-100"
      />

      {/* Bakplattan. Ingen egen skugga: den ska läsas som en kant bakom
          bilden, och en skugga på den konkurrerar med bildens egen. */}
      <div
        aria-hidden="true"
        className={`absolute inset-x-3 -top-3 bottom-3 hidden rounded-xl border lg:block ${
          dark
            ? "border-white/10 bg-white/5"
            : "border-neutral-200 bg-neutral-50"
        } ${
          tilt === "right"
            ? "[transform:perspective(1800px)_rotateY(-7deg)_rotateX(2deg)_rotateZ(1.4deg)]"
            : tilt === "left"
              ? "[transform:perspective(1800px)_rotateY(7deg)_rotateX(2deg)_rotateZ(-1.4deg)]"
              : ""
        }`}
      />

      {/* Den djupa skuggan sitter HÄR och inte på ramen inuti.

          Uppställningen är tre lager: glöden, bakplattan och bilden. Skuggan
          hör till den och inte till ramen, som har sin egen hårfina och blir
          det innersta lagret. `rounded-lg` är ramens egen radie, så att
          skuggan följer bildens hörn och inte ritar en fyrkant bakom dem.

          `h-full` för de tre dokumenten, som står i en rad och ska bli lika
          höga även när en tabell har en rad mer. Höjden lämnas vidare från
          rutan runt plattan till ramen inuti; står den rutan i ett flöde utan
          bestämd höjd betyder `h-full` ingenting, vilket är rätt överallt
          annars. */}
      <div
        className={`plate relative h-full rounded-lg ${
          dark ? "plate-dark" : "plate-light"
        } ${TILTS[tilt]}`}
      >
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero-stapeln                                                                */
/* -------------------------------------------------------------------------- */

/**
 * SATELLITKORTET.
 *
 * De små korten som ligger framför stämplingsskärmen i hero. Var och ett bär
 * ett enda tal ur panelen, och tillsammans säger de vad produkten lämnar:
 * fakturerbar tid, en post att granska, ett underlag att skicka.
 *
 * ETT TAL PER KORT. Två tal gör kortet till en tabell man måste läsa, och de
 * ligger i utkanten av blicken där man inte läser. De finns för att ge djup
 * och för att antyda vad panelen innehåller, inte för att informera.
 */
export function SatelliteCard({
  label,
  value,
  foot,
  tone = "neutral",
}: {
  label: string;
  value: string;
  foot?: string;
  /** `tick` för tal som rör tid som löper, enligt produktens egen färgregel. */
  tone?: "neutral" | "tick";
}) {
  return (
    /*
      INGEN OSKÄRPA BAKOM KORTET, fastän en halvgenomskinlig yta ber om det.

      Kortet svävar: det rör sig några pixlar upp och ned hela tiden, och det
      flyttar sig dessutom med pekaren. En `backdrop-filter` måste räknas om
      varje gång ytan bakom den förskjuts, alltså i varje bildruta så länge
      kortet syns — och det syns direkt när sidan öppnas, på den yta där en
      besökare bildar sig sin uppfattning.

      Fjord på nittio procent ger samma läsbarhet. Att man anar skärmen bakom
      kortet är hela poängen, och den anar man lika väl genom en nästan
      heltäckande yta som genom en oskarp.

      Listen uppe i menyn har kvar sin oskärpa: den ligger still i förhållande
      till ytan bakom sig på ett annat sätt, och en list som bara är tonad över
      en produktbild blir svårläst.
    */
    <div className="plate plate-dark w-[11.5rem] rounded-xl border border-white/10 bg-neutral-900/90 p-3.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
        {label}
      </p>
      <p
        className={`mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums ${
          tone === "tick" ? "text-tick" : "text-white"
        }`}
      >
        {value}
      </p>
      {foot && (
        <p className="mt-2 text-[10px] leading-snug text-neutral-400">{foot}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bandet med gränssnitten                                                     */
/* -------------------------------------------------------------------------- */

/**
 * ALLA YTOR PÅ EN GÅNG, SOM ETT BAND SOM DRAR FÖRBI.
 *
 * Sidan visar annars en yta i taget, vid den text som förklarar den. Det är
 * rätt för den som läser uppifrån och ned, men det svarar aldrig på frågan en
 * köpare faktiskt har efter tre avsnitt: hur mycket ÄR det här?
 *
 * Bandet svarar på den. Nio ytor ur produkten i en rad som drar förbi i jämn
 * takt — stämplingsskärmens tre vyer, panelen, rapporten, granskningen och de
 * tre dokumenten. Ingen text, inga rubriker. Den som tittar i fem sekunder har
 * förstått omfattningen.
 *
 * SPÅRET INNEHÅLLER SAMMA BILDER TVÅ GÅNGER. Animationen flyttar det exakt
 * halva bredden, vilket betyder att den andra uppsättningen står precis där
 * den första stod när varvet börjar om. Flyttades hela bredden syns ett hopp
 * vid varje varv, och ett hopp var sextionde sekund är värre än inget band.
 *
 * `aria-hidden` på den andra uppsättningen: den är en kopia, och den som
 * lyssnar på sidan ska inte höra nio produktbilder två gånger.
 *
 * BILDERNA ÄR INTE INTERAKTIVA, och det är avsiktligt. De är bilder av
 * produkten; vill man röra den finns provperioden. Draget pausas däremot när
 * pekaren vilar på bandet, så att den som vill se en bild närmare kan det.
 */
const STRIP = [
  { key: "kiosk", node: <RunningMockup /> },
  { key: "pad", node: <OrderNumberMockup /> },
  { key: "order", node: <OrderPickMockup /> },
  { key: "admin", node: <AdminMockup /> },
  { key: "report", node: <ReportMockup /> },
  { key: "review", node: <ReviewMockup /> },
  { key: "export", node: <ExportMockup /> },
  { key: "calc", node: <CalcMockup /> },
  { key: "timesheet", node: <TimesheetMockup /> },
];

export function SurfaceStrip() {
  const lane = (copy: boolean) => (
    <div
      aria-hidden={copy || undefined}
      className="flex shrink-0 items-start gap-5 pr-5 sm:gap-7 sm:pr-7"
    >
      {STRIP.map((item) => (
        <div
          key={`${item.key}-${copy ? "kopia" : "original"}`}
          /* Bredden är fast och inte procentuell. Spåret ligger utanför varje
             spalt, och en procentbredd mot ett element utan bredd blir noll. */
          className="plate plate-dark w-[19rem] shrink-0 opacity-85 transition-all duration-500 hover:-translate-y-1.5 hover:opacity-100 sm:w-[23rem]"
        >
          {item.node}
        </div>
      ))}
    </div>
  );

  return (
    <div className="marquee-stage relative">
      <div className="animate-marquee flex w-max">
        {lane(false)}
        {lane(true)}
      </div>
    </div>
  );
}
