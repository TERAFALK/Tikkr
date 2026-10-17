import type { ModuleKey } from "../modules";
import type { HelpAreaKey } from "./areas";

/**
 * GUIDERNA I HJÄLPCENTRET, SOM DATA.
 *
 * Texten ligger i koden och inte i databasen (beslutat 2026-10-11). En guide
 * beskriver hur produkten fungerar, och den ändras i samma takt som produkten:
 * en knapp som byter namn ska byta namn i guiden i samma commit. Låg texten i
 * en tabell hade guiden och knappen kunnat säga olika saker utan att någon
 * kodgranskning såg det.
 *
 * Konsekvensen är att en ändring av en guide kräver en driftsättning. Det är
 * rätt pris för att guiden aldrig ska ligga före eller efter produkten.
 *
 * SAMMA REGLER SOM I PANELEN. Knapparnas namn skrivs exakt som de står på
 * skärmen, så att den som letar efter "Ny skärm" hittar just "Ny skärm".
 * Tid skrivs som decimaltimmar, och tankstreck i löptext fälls av
 * tests/ui-text.test.ts. Se TONE-OF-VOICE.md.
 *
 * `slug` är adressen, /support/<slug>, och det namn panelens hjälplänkar pekar
 * ut. Typen `GuideSlug` härleds ur listan, så att en länk till en guide som
 * inte finns blir ett typfel och inte en sida som svarar 404.
 *
 * Bara bastypen och områdets nyckel importeras. Filen ska gå att läsa från
 * säljsidan, panelen och webbläsaren utan att dra med sig något av dem.
 */

export interface GuideStep {
  /** Vad man gör, i imperativ. */
  title: string;
  /** Det som behövs för att göra det, om rubriken inte räcker. */
  body?: string;
}

export interface Guide {
  slug: string;
  area: HelpAreaKey;
  title: string;
  /** En mening. Står under rubriken och i sökträffen. */
  summary: string;
  /** Tillvalet guiden hör till. Utelämnad betyder basen. */
  module?: ModuleKey;
  /**
   * Ord någon kan tänkas söka på som inte står i texten. Synonymer, och de
   * ord kunden själv använder: "kiosk", "lösen", "sjuk".
   */
  keywords: string[];
  steps: GuideStep[];
  /** Bra att veta. Konsekvenser och undantag, en mening var. */
  notes?: string[];
  related?: string[];
}

export const GUIDES = [
  /* ---------------------------------------------------------------------- */
  /* Kom igång                                                               */
  /* ---------------------------------------------------------------------- */
  {
    slug: "kom-igang",
    area: "START",
    title: "Sätt upp arbetsytan",
    summary:
      "Fyra steg från ny arbetsyta till första stämplingen: anställda, arbetsmoment, en order och en skärm.",
    keywords: ["start", "uppsättning", "ny kund", "registrera", "börja"],
    steps: [
      {
        title: "Öppna Kom igång",
        body: "Sidan ligger överst i menyn tills uppsättningen är klar. Därefter nås den från Inställningar.",
      },
      {
        title: "Lägg upp anställda",
        body: "Skriv ett namn per rad och tryck Lägg till. Namnen blir knappar på stämplingsskärmen.",
      },
      {
        title: "Lägg upp arbetsmoment",
        body: "Kryssa i de vanliga momenten eller skriv egna, ett per rad. Ett arbetsmoment är den typ av arbete tiden avser, t.ex. svetsning.",
      },
      {
        title: "Lägg upp minst en order",
        body: "Ordernummer räcker. Kunden är valfri och kan läggas till senare.",
      },
      {
        title: "Koppla en stämplingsskärm",
        body: "Tryck Skapa skärm och följ guiden för att koppla skärmen.",
      },
    ],
    notes: [
      "Under Därefter på samma sida står det som gör underlagen kompletta: kundregister, timkostnader och improduktiv tid.",
    ],
    related: ["koppla-skarm", "anstallda", "ordrar"],
  },
  {
    slug: "koppla-skarm",
    area: "START",
    title: "Koppla en stämplingsskärm",
    summary:
      "En pekskärm eller surfplatta kopplas en gång med en sexsiffrig kod och kräver därefter ingen inloggning.",
    keywords: ["kiosk", "surfplatta", "pekskärm", "kod", "enhet", "terminal", "koppla om"],
    steps: [
      {
        title: "Öppna Inställningar, Stämplingsskärmar och tryck Ny skärm",
        body: "Ge skärmen ett namn efter var den sitter, t.ex. Monteringen, och tryck Skapa kod.",
      },
      {
        title: "Öppna adressen på skärmen",
        body: "Rutan i panelen visar adressen. Öppna den i webbläsaren på enheten som ska sitta i verkstaden.",
      },
      {
        title: "Knappa in koden och tryck Koppla skärmen",
        body: "Koden gäller en gång och slutar gälla efter en stund. Gick den ut, tryck Ny kod i panelen.",
      },
      {
        title: "Kontrollera att skärmen står som Kopplad",
        body: "Namnen på de anställda visas på skärmen så snart den är kopplad.",
      },
    ],
    notes: [
      "Varje skärm tar en licens. Antalet licenser ändras under Inställningar, Prenumeration.",
      "Byts enheten ut, eller har webbläsarens data rensats, tryck Koppla om och knappa in den nya koden.",
      "Byter systemet adress måste varje skärm kopplas om.",
    ],
    related: ["stampla-in-och-ut", "prenumeration"],
  },

  /* ---------------------------------------------------------------------- */
  /* Stämplingsskärmen                                                       */
  /* ---------------------------------------------------------------------- */
  {
    slug: "stampla-in-och-ut",
    area: "KIOSK",
    title: "Stämpla in och ut",
    summary:
      "Tryck på ditt namn, välj order och arbetsmoment. Ingen kod och ingen bekräftelse.",
    keywords: ["stämpla", "instämpling", "utstämpling", "jobb", "byt jobb", "ordernummer", "knappsats"],
    steps: [
      {
        title: "Tryck på ditt namn",
        body: "Står du redan instämplad visas dina pågående jobb.",
      },
      {
        title: "Tryck Välj jobb och slå in ordernumret",
        body: "Numret står på ritningen. Tryck Visa öppna ordrar för att välja i en lista i stället.",
      },
      {
        title: "Välj arbetsmoment",
        body: "Stämplingen startar direkt.",
      },
      {
        title: "Tryck Stämpla ut när jobbet är klart",
        body: "Ska du direkt vidare till nästa jobb, tryck Byt jobb. Det pågående stämplas ut när det nya startar.",
      },
    ],
    notes: [
      "Stämplar du in på ett nytt jobb med samma arbetsmoment stämplas det förra ut automatiskt. En maskin kör ett jobb i taget.",
      "Glömda utstämplingar stängs vid ett klockslag som kontoret bestämt och hamnar i granskningen.",
      "Stängdes ditt jobb medan du fortfarande arbetade visar skärmen Stämpla ut nu i sex timmar. Trycket förlänger passet.",
    ],
    related: ["tva-maskiner", "snabbjobb", "granskning"],
  },
  {
    slug: "tva-maskiner",
    area: "KIOSK",
    title: "Kör två maskiner samtidigt",
    summary:
      "En anställd kan ha ett pågående jobb per arbetsmoment. Två maskiner i en timme blir två maskintimmar.",
    keywords: ["parallellt", "samtidigt", "flera jobb", "lägg till jobb", "två jobb"],
    steps: [
      {
        title: "Tryck på ditt namn medan det första jobbet pågår",
      },
      {
        title: "Tryck Lägg till jobb",
        body: "Det pågående jobbet fortsätter.",
      },
      {
        title: "Välj order och ett annat arbetsmoment",
        body: "Båda jobben står nu som pågående.",
      },
      {
        title: "Stämpla ut jobben var för sig, eller tryck Stämpla ut allt",
      },
    ],
    notes: [
      "Två jobb på samma arbetsmoment går inte. Det nya ersätter det gamla.",
      "Båda ordrarna får sin maskintid på underlaget. Tidrapporten räknar däremot den tid personen var på plats, en gång.",
    ],
    related: ["stampla-in-och-ut", "tidrapport"],
  },
  {
    slug: "snabbjobb",
    area: "KIOSK",
    title: "Stämpla utan ordernummer",
    summary:
      "Saknas numret, eller finns ordern inte upplagd än, skapas ett snabbjobb som kontoret kompletterar.",
    keywords: ["snabbjobb", "okänt nummer", "ny order", "saknas", "vet inte"],
    steps: [
      {
        title: "Tryck Snabbjobb under knappsatsen",
        body: "Har du ett nummer som inte finns, slå in det. Skärmen erbjuder då att skapa ordern.",
      },
      {
        title: "Välj kund",
        body: "Tryck på första bokstaven i kundens namn. Tryck Vet inte om du inte vet.",
      },
      {
        title: "Välj arbetsmoment",
        body: "Stämplingen startar som vanligt.",
      },
      {
        title: "Kontoret kompletterar ordern",
        body: "Snabbjobbet står överst under Granskning. Tryck Ändra för att sätta rätt ordernummer och kund.",
      },
    ],
    notes: [
      "Ett snabbjobb utan ordernummer får ett tillfälligt nummer.",
      "En ny order kräver kontakt med servern. Utan internetanslutning går snabbjobb inte att skapa.",
    ],
    related: ["granskning", "ordrar"],
  },
  {
    slug: "improduktiv-tid",
    area: "KIOSK",
    title: "Registrera improduktiv tid",
    summary:
      "Städning, möten och underhåll registreras i ett eget register och når aldrig ett fakturaunderlag.",
    keywords: ["städning", "möte", "underhåll", "intern tid", "övrig tid", "ej fakturerbar"],
    steps: [
      {
        title: "Lägg upp de improduktiva momenten",
        body: "Under Inställningar, Improduktiv tid, tryck Nytt improduktivt moment.",
      },
      {
        title: "Tryck Improduktiv tid på stämplingsskärmen",
        body: "Knappen ligger under knappsatsen och i ordervyn.",
      },
      {
        title: "Välj moment",
        body: "Stämpla ut som vanligt när det är klart.",
      },
    ],
    notes: [
      "Rapporterna visar ordertid och improduktiv tid var för sig.",
      "Ett moment som aldrig använts går att ta bort. Annars avaktiveras det.",
    ],
    related: ["rapporter", "stampla-in-och-ut"],
  },
  {
    slug: "rast",
    area: "KIOSK",
    title: "Ta rast",
    summary:
      "Ett tryck på Rast stämplar ut från alla pågående jobb. Efter rasten fortsätter du där du var.",
    module: "PAYROLL",
    keywords: ["lunch", "frukost", "fika", "paus", "rast"],
    steps: [
      {
        title: "Tryck på ditt namn och sedan Rast",
        body: "Välj vilken rast det är. Alla pågående jobb stämplas ut.",
      },
      {
        title: "Tryck på ditt namn när rasten är slut",
      },
      {
        title: "Tryck Fortsätt",
        body: "Det senaste jobbet startar igen. Tryck Avsluta rasten för att gå hem eller välja annat.",
      },
    ],
    notes: [
      "Rasttyperna läggs upp under Inställningar, Arbetstider, med Ny rast.",
      "Rasten räknas inte som arbetad tid och kan inte faktureras.",
    ],
    related: ["arbetstider", "tidrapport"],
  },
  {
    slug: "utan-internet",
    area: "KIOSK",
    title: "När internetanslutningen bryts",
    summary:
      "Skärmen tar emot stämplingar som vanligt. De sparas på enheten och skickas när anslutningen är tillbaka.",
    keywords: ["offline", "wifi", "nätverk", "uppkoppling", "kö", "avbrott"],
    steps: [
      {
        title: "Stämpla som vanligt",
        body: "Varje tryck sparas på enheten med den tid det gjordes.",
      },
      {
        title: "Låt skärmen stå på",
        body: "Stämplingarna skickas av sig själva när anslutningen är tillbaka.",
      },
    ],
    notes: [
      "Stäng inte webbläsaren och rensa inte dess data medan stämplingar väntar.",
      "Snabbjobb och flexsaldo kräver anslutning.",
      "En stämpling som kommer fram sent, efter att något ändrats, registreras och flaggas för granskning.",
    ],
    related: ["granskning", "koppla-skarm"],
  },

  /* ---------------------------------------------------------------------- */
  /* Ordrar och register                                                     */
  /* ---------------------------------------------------------------------- */
  {
    slug: "ordrar",
    area: "REGISTERS",
    title: "Lägg upp en order",
    summary:
      "Ordernummer, kund och beräknad tid per arbetsmoment. Påslag och fast pris om underlaget ska visa belopp.",
    keywords: ["order", "beräknad tid", "budget", "fast pris", "påslag", "leveransdatum", "stäng order"],
    steps: [
      {
        title: "Öppna Ordrar och tryck Ny order",
      },
      {
        title: "Skriv ordernummer och välj kund",
        body: "Kunden är valfri men står som rubrik på underlaget.",
      },
      {
        title: "Lägg till beräknad tid per arbetsmoment",
        body: "En rad per moment. Timmar, t.ex. 7,5. Orderns totala beräkning är summan av raderna.",
      },
      {
        title: "Fyll i påslag eller fast kundpris vid behov",
        body: "Tomt påslag ger kundens, och därefter företagets. Fast pris går före allt.",
      },
    ],
    notes: [
      "En order med registrerad tid går inte att radera. Den stängs, och försvinner då från stämplingsskärmen.",
      "Stämplingen stoppas aldrig för att den beräknade tiden överskrids.",
    ],
    related: ["kunder", "arbetsmoment", "underlag"],
  },
  {
    slug: "anstallda",
    area: "REGISTERS",
    title: "Lägg upp anställda",
    summary:
      "Namnet blir en knapp på stämplingsskärmen. Timkostnaden används bara i efterkalkylen.",
    keywords: ["personal", "medarbetare", "anställd", "timkostnad", "avaktivera", "slutat", "anställningsnummer"],
    steps: [
      {
        title: "Öppna Anställda och tryck Ny anställd",
      },
      {
        title: "Skriv namn",
        body: "Anställningsnummer är valfritt.",
      },
      {
        title: "Fyll i timkostnad",
        body: "Valfritt. Läggs till arbetsmomentets kostnad i efterkalkylen. Visas aldrig på stämplingsskärmen.",
      },
      {
        title: "Tryck Lägg till",
      },
    ],
    notes: [
      "Den som slutat avaktiveras med Ändra. Registrerad tid finns kvar.",
      "En ändrad timkostnad gäller nya stämplingar. Det som redan registrerats behåller sin kostnad.",
    ],
    related: ["arbetsmoment", "gdpr"],
  },
  {
    slug: "arbetsmoment",
    area: "REGISTERS",
    title: "Arbetsmoment och timkostnad",
    summary:
      "Arbetsmomentet är maskinen eller typen av arbete. Dess timkostnad läggs till personens i efterkalkylen.",
    keywords: ["moment", "maskin", "operation", "timpris", "maskinkostnad", "självkostnad"],
    steps: [
      {
        title: "Öppna Inställningar, Arbetsmoment och tryck Nytt arbetsmoment",
      },
      {
        title: "Skriv namn och timkostnad",
        body: "Timkostnaden är valfri. Utan den räknas bara personens kostnad.",
      },
      {
        title: "Tryck Lägg till",
        body: "Momentet syns direkt på stämplingsskärmen.",
      },
    ],
    notes: [
      "Självkostnaden per timme är personens timkostnad plus momentets.",
      "Ett moment med registrerad tid går inte att radera. Det avaktiveras.",
    ],
    related: ["anstallda", "efterkalkyl"],
  },
  {
    slug: "kunder",
    area: "REGISTERS",
    title: "Kunder, påslag och rabatt",
    summary:
      "Kundregistret bär adress, påslag och rabatt. Uppgifterna skrivs ut på kundens underlag.",
    keywords: ["kund", "kundregister", "rabatt", "påslag", "organisationsnummer", "adress"],
    steps: [
      {
        title: "Öppna Kunder och tryck Ny kund",
      },
      {
        title: "Fyll i namn och adress",
        body: "Det som skrivs ut på kundens underlag.",
      },
      {
        title: "Fyll i påslag och rabatt vid behov",
        body: "Påslaget är en faktor, t.ex. 1,3. Rabatten dras av efter påslaget och syns för kunden.",
      },
    ],
    notes: [
      "Kunden ser pris och rabatt. Självkostnad och marginal visas aldrig på kundens underlag.",
    ],
    related: ["ordrar", "underlag"],
  },

  /* ---------------------------------------------------------------------- */
  /* Granskning och underlag                                                 */
  /* ---------------------------------------------------------------------- */
  {
    slug: "granskning",
    area: "DOCUMENTS",
    title: "Granska flaggade stämplingar",
    summary:
      "Glömda utstämplingar, helgstämplingar och snabbjobb hamnar i granskningen innan de faktureras.",
    keywords: ["granska", "flaggad", "glömt stämpla ut", "automatisk utstämpling", "helg", "attestera", "rätta"],
    steps: [
      {
        title: "Öppna Granskning",
        body: "Siffran i menyn visar hur mycket som väntar.",
      },
      {
        title: "Komplettera snabbjobben",
        body: "Tryck Ändra och sätt rätt ordernummer och kund.",
      },
      {
        title: "Rätta sluttiden eller godkänn den beräknade",
        body: "Skriv rätt sluttid och tryck Godkänn.",
      },
    ],
    notes: [
      "Klockslaget för automatisk utstämpling ställs in under Inställningar, Tid och automatik.",
      "Varje ändring sparas i ändringsloggen med vem som gjorde den.",
    ],
    related: ["andra-stampling", "snabbjobb"],
  },
  {
    slug: "andra-stampling",
    area: "DOCUMENTS",
    title: "Ändra, lägg till eller ta bort en stämpling",
    summary:
      "En felaktig stämpling skrivs om eller tas bort. Borttagna poster står kvar i ändringsloggen.",
    keywords: ["ändra", "rätta", "fel tid", "lägga till tid", "manuell", "efterregistrera", "radera", "ta bort", "improduktiv"],
    steps: [
      {
        title: "Öppna Stämplingar",
        body: "Filtrera på anställd, order eller datum.",
      },
      {
        title: "Tryck Ändra på raden",
        body: "Rätta tider, order eller arbetsmoment och spara.",
      },
      {
        title: "Tryck Ny stämpling för tid som aldrig stämplades",
        body: "Välj Ordertid eller Improduktiv tid, sedan anställd, jobb och tider.",
      },
      {
        title: "Tryck Ta bort på en stämpling som inte skulle ha funnits",
        body: "Kan inte ångras. Posten står kvar i ändringsloggen med vem som tog bort den.",
      },
    ],
    notes: [
      "Två stämplingar på samma anställd och arbetsmoment får inte överlappa.",
      "En pågående stämpling går varken att ändra eller ta bort förrän den avslutats.",
      "Ska en persons tid bort helt används raderingen under Inställningar, Dataskydd.",
    ],
    related: ["granskning", "gdpr"],
  },
  {
    slug: "underlag",
    area: "DOCUMENTS",
    title: "Ta ut underlag till kunden",
    summary:
      "Underlaget visar ordern, kunden, alla stämplingar och en summa. Det skrivs ut direkt eller laddas ner som PDF.",
    keywords: ["underlag", "faktura", "fakturaunderlag", "pdf", "skriv ut", "ladda ner", "belopp", "zip"],
    steps: [
      {
        title: "Öppna Ordrar och markera en eller flera ordrar",
      },
      {
        title: "Välj Skriv ut eller Ladda ner under Underlag",
        body: "Flera ordrar skrivs ut som ett dokument, eller laddas ner som en fil per order i ett zip-arkiv.",
      },
      {
        title: "Kryssa i Visa belopp och rabatt vid behov",
        body: "Utan kryss visas bara tid. Valet finns i menyn på en enskild order.",
      },
    ],
    notes: [
      "Er logotyp står på underlaget. Den laddas upp under Inställningar.",
      "Självkostnad och marginal kommer aldrig med på underlaget.",
    ],
    related: ["efterkalkyl", "kunder"],
  },
  {
    slug: "efterkalkyl",
    area: "DOCUMENTS",
    title: "Efterkalkyl",
    summary:
      "Internt dokument med tid, självkostnad, pris och marginal per order.",
    keywords: ["kalkyl", "lönsamhet", "marginal", "självkostnad", "avsluta order", "intern"],
    steps: [
      {
        title: "Öppna Ordrar och markera de ordrar som är klara",
      },
      {
        title: "Välj Skriv ut eller Ladda ner under Efterkalkyl",
      },
      {
        title: "Svara på frågan om ordern ska avslutas",
        body: "Står någon instämplad på ordern visas vem innan något ändras.",
      },
    ],
    notes: [
      "Efterkalkylen är märkt som internt underlag och ska inte lämnas till kunden.",
      "Timkostnaden per person står inte på pappret, bara tid och kostnad per rad.",
    ],
    related: ["underlag", "arbetsmoment"],
  },
  {
    slug: "rapporter",
    area: "DOCUMENTS",
    title: "Rapporter och Excel",
    summary:
      "Registrerad tid per order, kund, anställd och arbetsmoment, med export till Excel.",
    keywords: ["rapport", "excel", "export", "statistik", "summera", "per order", "per anställd"],
    steps: [
      {
        title: "Öppna Rapporter",
      },
      {
        title: "Välj period och filter",
        body: "Sorts tid väljer ordertid, improduktiv tid eller båda. Tryck Visa.",
      },
      {
        title: "Tryck Excel för att räkna vidare",
        body: "Arket har tiden som ett tal, så att den går att summera.",
      },
    ],
    notes: [
      "Rapporten svarar på hur mycket kunden ska faktureras. Hur mycket en person har arbetat står i tidrapporten.",
    ],
    related: ["underlag", "tidrapport"],
  },

  /* ---------------------------------------------------------------------- */
  /* Löneunderlag                                                            */
  /* ---------------------------------------------------------------------- */
  {
    slug: "arbetstider",
    area: "PAYROLL",
    title: "Arbetstider och raster",
    summary:
      "Schemat ger planerad tid per dag. Utan schema blir allt arbete flex.",
    module: "PAYROLL",
    keywords: ["schema", "arbetstid", "deltid", "timanställd", "rast", "lunch", "planerad tid"],
    steps: [
      {
        title: "Öppna Inställningar, Arbetstider",
      },
      {
        title: "Fyll i start, slut och raster per veckodag",
        body: "Planerad tid räknas netto efter schemats raster.",
      },
      {
        title: "Lägg upp rasttyperna med Ny rast",
        body: "De visas som val när någon trycker Rast på stämplingsskärmen.",
      },
      {
        title: "Ge en anställd egna tider vid behov",
        body: "Under Anställda, Ändra, kryssa i Egna arbetstider. Utan kryss gäller företagets.",
      },
      {
        title: "Lägg in årets röda dagar",
        body: "Under Inställningar, Röda dagar. En röd dag har ingen planerad tid för någon.",
      },
    ],
    notes: [
      "En timanställd mäts inte mot något schema och har inget flexsaldo. Kryssa i Timanställd under Anställda.",
    ],
    related: ["tidrapport", "rast"],
  },
  {
    slug: "tidrapport",
    area: "PAYROLL",
    title: "Tidrapport och flex",
    summary:
      "Planerad tid, närvarotid, flex och frånvaro per anställd och period.",
    module: "PAYROLL",
    keywords: ["lön", "löneunderlag", "flex", "flextid", "flexsaldo", "närvaro", "saldo", "justera", "startdatum", "atf", "arbetstidsförkortning"],
    steps: [
      {
        title: "Öppna Tidrapport och välj anställd och period",
      },
      {
        title: "Kontrollera summeringen",
        body: "Flex är arbetad tid plus frånvaro, minus planerad tid. Flexledighet drar på saldot.",
      },
      {
        title: "Justera flexsaldot vid behov",
        body: "Tryck Justera flexsaldo och skriv vad saldot ska vara idag.",
      },
      {
        title: "Skriv ut Förra veckan per anställd",
        body: "En person per sida, för att dela ut.",
      },
      {
        title: "Skriv ut Förra månaden per anställd till lönen",
        body: "Samma sida per person, med bara frånvaron dag för dag.",
      },
    ],
    notes: [
      "Tid utöver schemat är flex.",
      "Flexen räknas från startdatumet, som sätts under Anställda. Utan startdatum räknas den från första stämplingen.",
      "Intjänad ATF visas för en hel kalendermånad när ett kollektivavtal är valt under Inställningar, Arbetstidsförkortning. Tikkr håller inget ATF-saldo.",
      "Tikkr räknar timmar. Lönearter, OB och övertidsersättning hanteras i lönesystemet.",
      "Tidrapporten är ett internt dokument och ska inte skickas till en kund.",
      "Den anställde ser sitt saldo på stämplingsskärmen med en kod som sätts under Anställda.",
    ],
    related: ["franvaro", "arbetstider"],
  },
  {
    slug: "franvaro",
    area: "PAYROLL",
    title: "Registrera frånvaro",
    summary:
      "Sjukdom, semester och annan frånvaro registreras i panelen och täcker den planerade tiden.",
    module: "PAYROLL",
    keywords: ["sjuk", "semester", "vab", "ledig", "frånvaroorsak", "tjänstledig", "flexledig"],
    steps: [
      {
        title: "Öppna Tidrapport och välj den anställde",
      },
      {
        title: "Tryck Registrera frånvaro",
        body: "Välj orsak och datum. Tomt antal timmar ger hela den schemalagda dagen.",
      },
    ],
    notes: [
      "Orsakerna läggs upp under Inställningar, Frånvaroorsaker. En orsak som drar på flexsaldot, som Flexledig, minskar saldot.",
      "Frånvaro registreras aldrig på stämplingsskärmen.",
    ],
    related: ["tidrapport"],
  },

  /* ---------------------------------------------------------------------- */
  /* Planering                                                               */
  /* ---------------------------------------------------------------------- */
  {
    slug: "planering",
    area: "PLANNING",
    title: "Planera jobb på stationer",
    summary:
      "Orderns arbetsmoment placeras ut på en veckovis tidslinje, en rad per station.",
    module: "PLANNING",
    keywords: ["planera", "tidslinje", "station", "maskin", "oplacerat", "whiteboard", "leveransdatum", "planeringsläge", "personal", "tjänst"],
    steps: [
      {
        title: "Lägg upp stationerna",
        body: "Under Inställningar, Stationer, tryck Ny station. En station gör ett arbetsmoment.",
      },
      {
        title: "Ge ordern beräknad tid per arbetsmoment",
        body: "Det är den tiden som hamnar i Oplacerat.",
      },
      {
        title: "Öppna Planering och tryck på ett jobb i Oplacerat",
        body: "Stationerna som kan köra momentet lyses upp.",
      },
      {
        title: "Tryck där jobbet ska börja",
        body: "Rutan går också att dra. Krymper du en ruta kommer resten tillbaka till Oplacerat.",
      },
    ],
    notes: [
      "Under Inställningar, Planeringsläge, väljs Produktion eller Tjänst. Tjänst planerar personal, utan stationer.",
      "Produktion: öppna en ruta och tryck Bemanna för att planera en anställd på jobbet. Passet räknas inte mot beräknad tid.",
      "Tjänst: tryck på ett jobb i Oplacerat och sedan på en anställd.",
      "En anställd med två pass samtidigt markeras i gult.",
      "Vecka och Dag växlar mellan hela veckan och en dag i taget. Tryck på en dag i rubriken för att öppna den.",
      "Överbokning tillåts och markeras i gult.",
      "En ruta som någon står instämplad på visas som pågående.",
      "Planerad tid är en avsikt. Den faktureras aldrig och räknas inte som arbetad tid.",
    ],
    related: ["ordrar", "arbetsmoment"],
  },

  /* ---------------------------------------------------------------------- */
  /* Konto och prenumeration                                                 */
  /* ---------------------------------------------------------------------- */
  {
    slug: "tvastegsinloggning",
    area: "ACCOUNT",
    title: "Logga in med tvåstegsverifiering",
    summary:
      "Lösenordet och en kod från en autentiseringsapp. Krävs för alla administratörer.",
    keywords: ["inloggning", "logga in", "kod", "app", "authenticator", "qr", "glömt lösenord", "ny telefon"],
    steps: [
      {
        title: "Installera en autentiseringsapp i telefonen",
        body: "T.ex. Microsoft Authenticator eller Google Authenticator.",
      },
      {
        title: "Logga in med e-post och lösenord",
        body: "Första gången visas en QR-kod. Skanna den med appen.",
      },
      {
        title: "Skriv koden från appen",
        body: "Kryssa i Kom ihåg den här datorn för att slippa koden i 30 dagar.",
      },
    ],
    notes: [
      "Under Inloggningsalternativ går det att få koden via e-post, om adressen är bekräftad.",
      "Ny telefon: be en ägare i arbetsytan att nollställa tvåstegsverifieringen under Inställningar, Användare.",
      "Glömt lösenord: tryck Glömt lösenordet? på inloggningssidan.",
    ],
    related: ["bjud-in"],
  },
  {
    slug: "bjud-in",
    area: "ACCOUNT",
    title: "Bjud in en administratör",
    summary:
      "Fler kollegor kan logga in i panelen. Var och en väljer sitt eget lösenord.",
    keywords: ["användare", "kollega", "inbjudan", "behörighet", "ägare", "administratör", "roll"],
    steps: [
      {
        title: "Öppna Inställningar, Användare",
      },
      {
        title: "Fyll i e-postadress och behörighet",
        body: "Ägare kan dessutom hantera prenumerationen och andra administratörer.",
      },
      {
        title: "Tryck Skapa inbjudan",
        body: "Inbjudan mejlas. Länken gäller i sju dagar och kan användas en gång.",
      },
    ],
    notes: [
      "Ditt eget namn, lösenord och e-postadress ändras under Ditt konto, längst ner i menyn.",
    ],
    related: ["tvastegsinloggning"],
  },
  {
    slug: "prenumeration",
    area: "ACCOUNT",
    title: "Prenumeration, licenser och tillval",
    summary:
      "En licens per stämplingsskärm. Tillvalen slås på och av under Prenumeration.",
    keywords: ["betala", "faktura", "licens", "pris", "tillval", "kort", "provperiod", "säga upp", "kvitto"],
    steps: [
      {
        title: "Öppna Inställningar, Prenumeration",
      },
      {
        title: "Ändra antalet licenser eller slå på ett tillval",
        body: "Före och efter visas innan något ändras.",
      },
      {
        title: "Bekräfta",
      },
    ],
    notes: [
      "Kort, kvitton och uppsägning hanteras på betaltjänstens sida, som nås från samma sida.",
      "Stämplingsskärmarna slutar aldrig fungera vid utebliven betalning. Panelen låses efter tio dagar.",
      "Ingen bindningstid.",
    ],
    related: ["koppla-skarm"],
  },
  {
    slug: "gdpr",
    area: "ACCOUNT",
    title: "Lämna ut eller radera en anställds uppgifter",
    summary:
      "En anställd har rätt att få ut sina uppgifter och att bli glömd.",
    keywords: ["gdpr", "dataskydd", "personuppgifter", "radera", "anonymisera", "registerutdrag", "glömd"],
    steps: [
      {
        title: "Öppna Inställningar, Dataskydd",
      },
      {
        title: "Lämna ut uppgifter",
        body: "Välj den anställde under Lämna ut en persons uppgifter och ladda ner filen.",
      },
      {
        title: "Radera personuppgifter",
        body: "Välj den anställde och skriv ANONYMISERA. Kan inte ångras.",
      },
    ],
    notes: [
      "Registrerad tid finns kvar utan namn, så att fakturerade underlag fortfarande stämmer.",
    ],
    related: ["anstallda"],
  },
] as const satisfies readonly Guide[];

export type GuideSlug = (typeof GUIDES)[number]["slug"];

export function guideBySlug(slug: string): Guide | undefined {
  return (GUIDES as readonly Guide[]).find((guide) => guide.slug === slug);
}

/** Adressen till en guide. Relativ, se HelpLink. */
export function guideHref(slug: string): string {
  return `/support/${slug}`;
}
