import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, {
  Definitions,
  List,
  type Section,
} from "@/components/marketing/LegalPage";
import {
  HOSTING_LOCATION,
  LEGAL_UPDATED,
  SUBPROCESSOR_NOTICE_DAYS,
} from "@/lib/legal";

/**
 * Byggs om varje minut, likt startsidan.
 *
 * Sidan är i praktiken oföränderlig, men den visar driftmeddelanderemsan i
 * toppen via SiteHeader. Utan omvärdering hade remsan bakats in som tom när
 * containern byggdes och aldrig uppdaterats.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Personuppgiftsbiträdesavtal · Tikkr",
  description:
    "Biträdesavtal enligt artikel 28 i dataskyddsförordningen mellan kundföretaget och TERAFALK AB.",
};

/**
 * Biträdesavtalet.
 *
 * Publicerat som en sida i stället för att skickas som ett dokument att skriva
 * under. Skälet: avtalet gäller lika för alla kunder, det ingår i villkoren som
 * accepteras vid registrering, och en kund som vill läsa det innan de blir kund
 * ska kunna göra det utan att be om det.
 *
 * En kund som behöver ett undertecknat exemplar får det på begäran — det står
 * i sista avsnittet.
 */

const sections: Section[] = [
  {
    id: "parter",
    heading: "Parter och omfattning",
    body: (
      <>
        <Definitions
          rows={[
            {
              term: "Personuppgiftsansvarig",
              description:
                "Det företag som använder Tikkr. Bestämmer ändamålet med behandlingen och vilka uppgifter som läggs in.",
            },
            {
              term: "Personuppgiftsbiträde",
              description:
                "TERAFALK AB, som tillhandahåller Tikkr och behandlar uppgifterna på den ansvariges uppdrag.",
            },
          ]}
        />
        <p>
          Avtalet reglerar biträdets behandling av personuppgifter för den
          ansvariges räkning, och utgör en del av{" "}
          <Link href="/villkor" className="text-blue-600 hover:underline">
            användarvillkoren
          </Link>
          . Det ingås när en arbetsyta skapas och gäller så länge biträdet
          behandlar personuppgifter för den ansvariges räkning.
        </p>
      </>
    ),
  },
  {
    id: "foremal",
    heading: "Föremål, varaktighet och art",
    body: (
      <>
        <Definitions
          rows={[
            {
              term: "Föremål",
              description:
                "Behandling som krävs för att tillhandahålla tidregistrering per kundorder och arbetsmoment.",
            },
            {
              term: "Varaktighet",
              description:
                "Avtalstiden, samt högst 90 dagar därefter för radering och avveckling.",
            },
            {
              term: "Art och ändamål",
              description:
                "Insamling, lagring, strukturering och utlämnande till den ansvarige i form av rapporter och underlag.",
            },
            {
              term: "Kategorier av registrerade",
              description:
                "Den ansvariges anställda och andra som utför arbete åt denne, samt den ansvariges administratörer.",
            },
            {
              term: "Kategorier av uppgifter",
              description:
                "Namn, frivilligt porträtt samt registrerad arbetstid med tidpunkt, kundorder, arbetsmoment, stämplingsskärm och IP-adress. För administratörer även e-postadress och krypterat lösenord.",
            },
          ]}
        />
        <p>
          Inga särskilda kategorier av personuppgifter enligt artikel 9 behandlas
          i tjänsten. Systemet saknar fält för hälsouppgifter,
          fackföreningstillhörighet, frånvaroorsak och liknande, och kan därför
          inte innehålla sådant vid avsedd användning.
        </p>
      </>
    ),
  },
  {
    id: "instruktioner",
    heading: "Instruktioner",
    body: (
      <>
        <p>
          Biträdet behandlar personuppgifter endast enligt dokumenterade
          instruktioner från den ansvarige. Användningen av tjänsten och detta
          avtal utgör de fullständiga instruktionerna.
        </p>
        <p>
          Biträdet underrättar den ansvarige om en instruktion enligt biträdets
          uppfattning strider mot dataskyddsförordningen. Krävs behandling enligt
          unionsrätt eller svensk rätt informerar biträdet den ansvarige om det
          rättsliga kravet innan behandlingen, om inte lagen förbjuder det.
        </p>
      </>
    ),
  },
  {
    id: "konfidentialitet",
    heading: "Konfidentialitet",
    body: (
      <p>
        Biträdet säkerställer att de personer som behandlar uppgifterna har
        åtagit sig att iaktta konfidentialitet. Åtkomsten begränsas till dem som
        behöver den för att fullgöra biträdets skyldigheter, och driftpersonal
        har inte tillgång till innehållet i den ansvariges verksamhetsdata.
      </p>
    ),
  },
  {
    id: "sakerhet",
    heading: "Säkerhetsåtgärder",
    body: (
      <>
        <p>
          Biträdet vidtar de tekniska och organisatoriska åtgärder som krävs
          enligt artikel 32. Följande åtgärder är genomförda:
        </p>
        <List
          items={[
            "Kryptering av all trafik mellan användare och tjänst.",
            "Logisk avskiljning av varje kunds data, kontrollerad med automatiska tester vid varje kodändring.",
            "Lösenord lagras som envägskryptering med bcrypt och kan inte läsas ut.",
            "Stämplingsskärmar identifieras med långa, slumpmässiga och återkallbara nycklar. Ingen anställd loggar in på skärmen.",
            "Begränsat antal inloggningsförsök, och omedelbart upphörd åtkomst när ett konto tas bort eller ett lösenord ändras.",
            "Loggning av varje registrering med tidpunkt, skärm och IP-adress, samt märkning av manuella ändringar.",
            "Dagliga säkerhetskopior till annan plats än driftservern.",
            "Regelbundna säkerhetsuppdateringar av servermiljön.",
          ]}
        />
        <p>
          Åtkomstmodellen förutsätter att stämplingsskärmen är fysiskt placerad
          på den ansvariges arbetsplats. Den fysiska säkerheten kring skärmen
          ansvarar den ansvarige för.
        </p>
      </>
    ),
  },
  {
    id: "underbitraden",
    heading: "Underbiträden",
    body: (
      <>
        <p>
          Den ansvarige lämnar ett allmänt förhandsgodkännande till att biträdet
          anlitar underbiträden. Underbiträden anlitas för drift av servrar, för
          betalningshantering och för utskick av systemets e-post. Samtliga
          behandlar uppgifter inom EU eller EES.
        </p>
        <p>
          En aktuell förteckning över underbiträden, med namn, ändamål och
          behandlingsort, lämnas på begäran till{" "}
          <a
            href="mailto:support@tikkr.se"
            className="font-medium text-blue-600 hover:underline"
          >
            support@tikkr.se
          </a>
          .
        </p>
        <p>
          Biträdet informerar den ansvarige minst {SUBPROCESSOR_NOTICE_DAYS}{" "}
          dagar innan ett underbiträde tillkommer eller byts ut. Den ansvarige
          kan invända mot ändringen inom den tiden, och har vid invändning rätt
          att säga upp avtalet utan kostnad för återstående period.
        </p>
        <p>
          Biträdet ålägger varje underbiträde samma skyldigheter som följer av
          detta avtal, och ansvarar gentemot den ansvarige för underbiträdets
          behandling.
        </p>
      </>
    ),
  },
  {
    id: "tredjeland",
    heading: "Överföring till tredjeland",
    body: (
      <p>
        Tjänsten och databasen driftas på servrar i {HOSTING_LOCATION}, och
        personuppgifter behandlas inom EU eller EES. Skulle överföring till
        tredjeland bli aktuell sker den endast med stöd av ett beslut om adekvat
        skyddsnivå eller av standardavtalsklausuler, och den ansvarige
        informeras i förväg.
      </p>
    ),
  },
  {
    id: "bistand",
    heading: "Bistånd till den ansvarige",
    body: (
      <>
        <p>
          Biträdet bistår den ansvarige med lämpliga tekniska och organisatoriska
          åtgärder så att denne kan fullgöra sin skyldighet att svara på begäran
          från registrerade. Funktionerna finns inbyggda i tjänsten:
        </p>
        <List
          items={[
            "Registerutdrag tas fram genom att filtrera på personen i rapporterna och exportera resultatet.",
            "Radering sker genom anonymisering: namnet tas bort permanent medan den registrerade tiden finns kvar utan koppling till en namngiven person. Skälet är att rätten att bli glömd och bokföringslagens krav på bevarande av räkenskapsinformation annars står i konflikt.",
            "Rättelse av felaktig tid görs av den ansvariges administratör, och märks som manuell ändring.",
          ]}
        />
        <p>
          Biträdet bistår även den ansvarige med information som behövs för
          konsekvensbedömningar och förhandssamråd, i den mån uppgifterna finns
          hos biträdet.
        </p>
      </>
    ),
  },
  {
    id: "incident",
    heading: "Personuppgiftsincident",
    body: (
      <p>
        Biträdet underrättar den ansvarige utan onödigt dröjsmål, och senast
        inom 48 timmar från att incidenten upptäckts, via den e-postadress som
        angetts för arbetsytan. Underrättelsen innehåller vad som inträffat,
        vilka kategorier av uppgifter och registrerade som berörs, sannolika
        konsekvenser samt vidtagna och föreslagna åtgärder. Det åligger den
        ansvarige att bedöma om incidenten ska anmälas till tillsynsmyndighet.
      </p>
    ),
  },
  {
    id: "radering",
    heading: "Radering och återlämnande",
    body: (
      <p>
        När avtalet upphör raderas samtliga personuppgifter senast 90 dagar
        därefter, inklusive kopior. Den ansvarige kan dessförinnan när som helst
        exportera sin data ur tjänsten. Säkerhetskopior som ännu inte fallit ur
        rotationen raderas i takt med att de ersätts, dock senast inom 90 dagar.
        Uppgifter som biträdet enligt lag är skyldigt att bevara undantas, och
        behandlas då endast för det ändamålet.
      </p>
    ),
  },
  {
    id: "granskning",
    heading: "Granskning",
    body: (
      <p>
        Biträdet tillhandahåller den ansvarige den information som krävs för att
        visa att skyldigheterna enligt artikel 28 fullgörs, och möjliggör och
        medverkar vid granskning. Granskning aviseras minst 30 dagar i förväg,
        sker under normal arbetstid och får ske högst en gång per år, om inte en
        inträffad incident eller ett myndighetskrav motiverar annat. Den
        ansvarige står för sina egna kostnader vid granskningen.
      </p>
    ),
  },
  {
    id: "undertecknande",
    heading: "Undertecknande",
    body: (
      <p>
        Avtalet ingås genom att arbetsytan skapas och villkoren accepteras.
        Behöver den ansvarige ett undertecknat exemplar för sin egen
        dokumentation lämnas det på begäran till{" "}
        <a
          href="mailto:support@tikkr.se"
          className="font-medium text-blue-600 hover:underline"
        >
          support@tikkr.se
        </a>
        .
      </p>
    ),
  },
];

export default function DataProcessingAgreementPage() {
  return (
    <LegalPage
      title="Personuppgiftsbiträdesavtal"
      updated={LEGAL_UPDATED}
      intro={
        <p>
          Avtalet enligt artikel 28 i dataskyddsförordningen mellan
          kundföretaget, som är personuppgiftsansvarig, och TERAFALK AB, som är
          personuppgiftsbiträde. Det gäller lika för alla kunder och ingår i
          användarvillkoren.
        </p>
      }
      sections={sections}
    />
  );
}
