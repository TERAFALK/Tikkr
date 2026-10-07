import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import LegalPage, {
  Definitions,
  List,
  type Section,
} from "@/components/marketing/LegalPage";
import { HOSTING_LOCATION, LEGAL_UPDATED, providerLine } from "@/lib/legal";

/**
 * Byggs om varje minut, likt startsidan.
 *
 * Sidan är i praktiken oföränderlig, men den visar driftmeddelanderemsan i
 * toppen via SiteHeader. Utan omvärdering hade remsan bakats in som tom när
 * containern byggdes och aldrig uppdaterats.
 */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  path: "/integritetspolicy",
  title: "Integritetspolicy · Tikkr",
  description:
    "Hur TERAFALK AB behandlar personuppgifter i tidregistreringstjänsten Tikkr.",
});

/**
 * Integritetspolicyn.
 *
 * Skriven utifrån vad systemet faktiskt lagrar, inte ur en mall. Det gör den
 * kortare än de flesta — Tikkr samlar in påfallande lite om en anställd, och
 * det är värt att säga rakt ut i stället för att dölja i en uppräkning av allt
 * tänkbart.
 */

const sections: Section[] = [
  {
    id: "vem",
    heading: "Vem som ansvarar för vad",
    body: (
      <>
        <p>
          Tikkr används av företag för att registrera sina anställdas arbetstid.
          I dataskyddsförordningens mening innebär det två olika roller.
        </p>
        <Definitions
          rows={[
            {
              term: "Kundföretaget",
              description:
                "Personuppgiftsansvarig för uppgifterna om sina anställda. Det är kunden som bestämmer vilka som läggs upp, varför tiden registreras och hur länge uppgifterna ska finnas kvar.",
            },
            {
              term: "TERAFALK AB",
              description:
                "Personuppgiftsbiträde. Vi behandlar uppgifterna på kundens uppdrag och enligt kundens instruktioner, för att kunna tillhandahålla tjänsten. Villkoren för det regleras i personuppgiftsbiträdesavtalet.",
            },
          ]}
        />
        <p>
          För uppgifter om den som besöker tikkr.se eller själv registrerar ett
          konto är TERAFALK AB personuppgiftsansvarig.
        </p>
      </>
    ),
  },
  {
    id: "uppgifter",
    heading: "Vilka uppgifter som behandlas",
    body: (
      <>
        <p>
          <strong className="font-medium text-neutral-900">
            Om en anställd hos kunden
          </strong>{" "}
          lagras namnet och den tid som registrerats, samt ett
          anställningsnummer och ett porträtt om arbetsgivaren valt att lägga
          upp dem. Arbetsgivaren kan också ange vad personens arbetstimme kostar
          företaget, för att räkna på ordrarna. Den uppgiften visas aldrig på
          stämplingsskärmen. Systemet har inga fält för personnummer, adress,
          telefonnummer eller anställningsform.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">
            Med tillvalet Löneunderlag
          </strong>{" "}
          lagras dessutom personens arbetstidsschema, stämplade raster, flex-
          och komptidssaldo, frånvaro med orsak och anteckning, och en personlig
          kod som visar saldot på stämplingsskärmen. Frånvaroorsaken kan säga
          något om hälsa, till exempel sjukdom eller vård av barn. Frånvaro
          registreras bara av arbetsgivarens administratörer, aldrig på
          stämplingsskärmen, och varje post visar vem som registrerade den.
          Koden lagras som envägskryptering och går inte att läsa ut.
        </p>
        <p>
          Porträttet är frivilligt och används enbart för att göra rätt knapp
          lättare att hitta på stämplingsskärmen. Det raderas tillsammans med
          namnet när en person anonymiseras.
        </p>
        <p>Varje registrerad stämpling innehåller:</p>
        <List
          items={[
            "tidpunkt för in- och utstämpling",
            "vilken kundorder och vilket arbetsmoment tiden avser",
            "vilken stämplingsskärm trycket gjordes på",
            "från vilken IP-adress trycket kom",
            "om posten registrerats på skärmen, stängts automatiskt vid dagens slut eller lagts in manuellt av en administratör",
          ]}
        />
        <p>
          De tre sista finns för att en felaktig registrering ska gå att reda ut
          i efterhand. Tiden ligger till grund för fakturering, och ett
          fakturaunderlag som inte går att kontrollera är svårt att försvara mot
          den som ifrågasätter det.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">
            Om en administratör
          </strong>{" "}
          lagras namn, e-postadress, telefonnummer, ett krypterat lösenord och
          vilken behörighet kontot har. Lösenordet lagras som en envägskryptering och går inte att
          läsa ut, vare sig av oss eller av någon som skulle komma över
          databasen.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">
            Om kundföretaget
          </strong>{" "}
          lagras firmanamn, kontaktuppgifter, eventuell uppladdad logotyp samt
          uppgifter om prenumerationen.
        </p>
      </>
    ),
  },
  {
    id: "syfte",
    heading: "Varför uppgifterna behandlas",
    body: (
      <>
        <p>
          Ändamålet är att kunden ska kunna registrera arbetad tid per kundorder
          och använda den som underlag för fakturering. Med tillvalet
          Löneunderlag är ändamålet också att ta fram underlag för lön: arbetad
          tid, flex, komptid och frånvaro. Uppgifterna används inte för något
          annat. De säljs inte, lämnas inte ut för marknadsföring och
          används inte för att träna maskininlärningsmodeller.
        </p>
        <p>
          Den rättsliga grunden är för kundens del berättigat intresse av att
          kunna fakturera utfört arbete och styrka underlaget, samt rättslig
          förpliktelse i den del uppgifterna utgör räkenskapsinformation.
          Kundföretaget ansvarar för att bedöma och dokumentera grunden för sin
          egen behandling, och för att informera sina anställda om att tiden
          registreras.
        </p>
        <p>
          Namn och telefonnummer till den som registrerar en arbetsyta används
          av TERAFALK AB för att nå personen i frågor om kontot, driften och
          betalningen. De används inte för marknadsföring. Grunden är avtalet
          med kundföretaget.
        </p>
      </>
    ),
  },
  {
    id: "lagring",
    heading: "Hur länge uppgifterna sparas",
    body: (
      <>
        <p>
          Uppgifterna finns kvar så länge kundförhållandet består. Avslutas
          prenumerationen raderas kundens data senast 90 dagar därefter, om
          kunden inte dessförinnan begärt att den raderas tidigare eller lämnas
          ut.
        </p>
        <p>
          Säkerhetskopior sparas i 30 dagar och skrivs därefter över. En
          uppgift som raderats ur tjänsten finns alltså kvar i en
          säkerhetskopia som längst så länge.
        </p>
        <p>
          Registrerad tid som ingår i ett fakturaunderlag omfattas av
          bokföringslagens krav på arkivering i sju år. Det kravet kan inte
          avtalas bort, och gäller även när en enskild anställd begär radering.
          se nästa avsnitt.
        </p>
      </>
    ),
  },
  {
    id: "rattigheter",
    heading: "Den anställdes rättigheter",
    body: (
      <>
        <p>
          En anställd som vill använda sina rättigheter vänder sig till sin
          arbetsgivare, eftersom det är arbetsgivaren som är
          personuppgiftsansvarig. Vi bistår kunden med att verkställa begäran.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">Utdrag.</strong>{" "}
          Administratören kan när som helst ta fram samtliga registrerade
          uppgifter om en person och lämna ut dem som fil.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">Radering.</strong>{" "}
          Systemet anonymiserar personen: namnet tas bort permanent, medan den
          registrerade tiden finns kvar utan koppling till någon namngiven
          individ. Anledningen är att två krav krockar: rätten att bli glömd
          och skyldigheten att bevara räkenskapsinformation. Anonymisering
          uppfyller båda, eftersom tiden fortfarande går att fakturera men inte
          längre utgör en personuppgift.
        </p>
        <p>
          Åtgärden går inte att ångra, och den utförs av kundens administratör.
          inte av oss.
        </p>
      </>
    ),
  },
  {
    id: "var",
    heading: "Var uppgifterna lagras",
    body: (
      <>
        <p>
          Tjänsten och databasen driftas på servrar i {HOSTING_LOCATION}, och
          säkerhetskopiorna förvaras krypterade på en annan plats än
          driftservern.
        </p>
        <p>
          Vår support kan, när ett ärende kräver det, se kundens adminpanel i
          ett läge som bara tillåter läsning. Varje sådant besök registreras med
          vem som gjorde det och när.
        </p>
        <p>
          För betalningar och för systemets e-postutskick anlitas
          underleverantörer. Samtliga behandlar uppgifter inom EU eller EES, och
          ingen av dem får tillgång till uppgifter om kundens anställda. En
          aktuell förteckning över underleverantörerna lämnas på begäran till{" "}
          <a
            href="mailto:support@tikkr.se"
            className="font-medium text-tick-deep hover:underline"
          >
            support@tikkr.se
          </a>
          .
        </p>
        <p>
          Byts en underleverantör ut informeras berörda kunder i förväg, enligt
          personuppgiftsbiträdesavtalet.
        </p>
      </>
    ),
  },
  {
    id: "sakerhet",
    heading: "Hur uppgifterna skyddas",
    body: (
      <>
        <List
          items={[
            "All trafik går krypterad över HTTPS.",
            "Varje kundföretags data är avskild i systemet, och avskiljningen kontrolleras med automatiska tester vid varje ändring av koden.",
            "Lösenord lagras som envägskryptering och går inte att läsa ut.",
            "Stämplingsskärmar identifieras med en lång, slumpmässig nyckel som kan återkallas när som helst. Ingen anställd loggar in på skärmen.",
            "Antalet inloggningsförsök är begränsat, och ett borttaget administratörskonto förlorar åtkomsten omedelbart.",
            "Ändringar av registrerad tid, saldon och frånvaro loggas med vem som ändrade och värdet före och efter.",
            "Databasen säkerhetskopieras dagligen, krypterat, till en annan plats än servern.",
          ]}
        />
        <p>
          En förutsättning för modellen är att stämplingsskärmen står på
          arbetsplatsen, precis som en fysisk stämpelklocka. Kunden ansvarar för
          skärmens fysiska placering.
        </p>
      </>
    ),
  },
  {
    id: "kakor",
    heading: "Kakor",
    body: (
      <>
        <p>
          Säljsidan tikkr.se använder inga kakor och innehåller ingen
          besöksmätning eller spårning.
        </p>
        <p>
          I systemet används bara nödvändiga kakor: de som håller en
          administratör inloggad, en som låter en administratör som valt det
          slippa inloggningskoden på samma dator i 30 dagar, och en som
          identifierar en kopplad stämplingsskärm. Ingen av dem används för
          mätning eller marknadsföring, och de kräver därför inget samtycke.
        </p>
      </>
    ),
  },
  {
    id: "kontakt",
    heading: "Kontakt och klagomål",
    body: (
      <>
        <p>
          {providerLine()},{" "}
          <a
            href="mailto:support@tikkr.se"
            className="font-medium text-tick-deep hover:underline"
          >
            support@tikkr.se
          </a>
          .
        </p>
        <p>
          Den som anser att personuppgifter behandlas felaktigt kan lämna
          klagomål till Integritetsskyddsmyndigheten, imy.se.
        </p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Integritetspolicy"
      updated={LEGAL_UPDATED}
      intro={
        <p>
          Tikkr registrerar arbetstid per kundorder. Den här policyn beskriver
          vilka personuppgifter som behandlas i tjänsten, varför, hur länge och
          av vem, skriven utifrån vad systemet faktiskt lagrar.
        </p>
      }
      sections={sections}
    />
  );
}
