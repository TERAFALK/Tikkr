import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { List, type Section } from "@/components/marketing/LegalPage";
import { LEGAL_UPDATED } from "@/lib/legal";

/**
 * Byggs om varje minut, likt startsidan.
 *
 * Sidan är i praktiken oföränderlig, men den visar driftmeddelanderemsan i
 * toppen via SiteHeader. Utan omvärdering hade remsan bakats in som tom när
 * containern byggdes och aldrig uppdaterats.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Användarvillkor — Tikkr",
  description:
    "Villkoren för att använda tidregistreringstjänsten Tikkr, från TERAFALK AB.",
};

const sections: Section[] = [
  {
    id: "tjansten",
    heading: "Tjänsten",
    body: (
      <>
        <p>
          Tikkr är en molnbaserad tjänst för att registrera arbetstid per
          kundorder och arbetsmoment, avsedd som underlag för fakturering.
          Tjänsten tillhandahålls av TERAFALK AB och nås via webbläsare.
        </p>
        <p>
          Tikkr är inte ett lönesystem. Tjänsten hanterar varken lönearter,
          övertidsregler, frånvaro eller semester, och ska inte användas som
          underlag för löneutbetalning. Avgränsningen är avsiktlig.
        </p>
      </>
    ),
  },
  {
    id: "provperiod",
    heading: "Provperiod",
    body: (
      <p>
        Nya kunder får 30 dagars provperiod utan kostnad. Inget betalkort krävs
        för att påbörja den, och den övergår inte automatiskt i ett betalt
        abonnemang. Under provperioden ingår två licenser.
      </p>
    ),
  },
  {
    id: "avgift",
    heading: "Avgift och betalning",
    body: (
      <>
        <p>
          Avgiften avser antalet licenser. En licens ger rätt att koppla en
          stämplingsskärm. Antalet anställda, ordrar och registrerade stämplingar
          påverkar inte priset, och ingen grundavgift tillkommer. Gällande pris
          framgår av{" "}
          <Link href="/#pris" className="text-blue-600 hover:underline">
            prissidan
          </Link>
          . Samtliga priser anges exklusive moms.
        </p>
        <p>
          Betalning sker i förskott, månadsvis eller årsvis efter kundens val,
          genom vår betalningsleverantör. Utökas antalet licenser under en
          pågående period debiteras endast återstående dagar av perioden.
        </p>
        <p>
          Vi kan ändra priset med 30 dagars varsel till den e-postadress kunden
          angett. En prisändring träder i kraft vid nästa periodstart, och kunden
          kan säga upp abonnemanget dessförinnan.
        </p>
      </>
    ),
  },
  {
    id: "uppsagning",
    heading: "Bindningstid och uppsägning",
    body: (
      <>
        <p>
          Ingen bindningstid tillämpas. Abonnemanget kan sägas upp när som helst
          och löper då till slutet av den betalda perioden. Redan erlagd avgift
          för en påbörjad period återbetalas inte.
        </p>
        <p>
          Uppsägning görs av kunden i tjänsten. Vi kan säga upp avtalet med 30
          dagars varsel, eller med omedelbar verkan vid väsentligt avtalsbrott.
        </p>
      </>
    ),
  },
  {
    id: "utebliven-betalning",
    heading: "Utebliven betalning",
    body: (
      <>
        <p>
          Uteblir betalningen ges tio dagars respit. Därefter låses adminpanelen:
          rapporter och export blir otillgängliga tills betalningen genomförts.
        </p>
        <p>
          <strong className="font-medium text-neutral-900">
            Stämplingsskärmarna påverkas inte.
          </strong>{" "}
          Tidregistreringen fortsätter att fungera, och all tid som registreras
          under låsningen finns tillgänglig när abonnemanget återupptas. Skälet
          är att arbetstid som inte registreras när arbetet utförs inte går att
          rekonstruera i efterhand — och den tiden är kundens underlag mot sin
          egen kund.
        </p>
      </>
    ),
  },
  {
    id: "kundens-ansvar",
    heading: "Kundens ansvar",
    body: (
      <>
        <List
          items={[
            "Att uppgifterna som registreras är riktiga. Vi kontrollerar inte innehållet och ansvarar inte för felaktigt registrerad tid.",
            "Att informera sina anställda om att arbetstid registreras, och att ha rättslig grund för behandlingen.",
            "Att stämplingsskärmarna placeras på arbetsplatsen. Skärmen identifieras av en nyckel i enheten och inte av den som trycker — modellen förutsätter att skärmen står fysiskt skyddad, precis som en stämpelklocka.",
            "Att hålla inloggningsuppgifter hemliga och återkalla konton som inte längre ska ha åtkomst.",
            "Att lägga upp minst två administratörer, så att arbetsytan inte blir otillgänglig om ett konto går förlorat.",
          ]}
        />
      </>
    ),
  },
  {
    id: "tillganglighet",
    heading: "Tillgänglighet",
    body: (
      <>
        <p>
          Vi strävar efter att tjänsten ska vara tillgänglig dygnet runt, men
          lämnar ingen garanti om en viss upptid. Planerat underhåll utförs när
          det stör minst, och aviseras i förväg när det bedöms påverka
          användningen.
        </p>
        <p>
          Databasen säkerhetskopieras dagligen till en annan plats än servern.
        </p>
      </>
    ),
  },
  {
    id: "kundens-data",
    heading: "Kundens data",
    body: (
      <>
        <p>
          Kunden äger sin data. Vi använder den enbart för att tillhandahålla
          tjänsten, och aldrig för marknadsföring, försäljning eller träning av
          maskininlärningsmodeller.
        </p>
        <p>
          Data kan när som helst exporteras ur tjänsten som Excel eller PDF. Vid
          avtalets slut raderas kundens data senast 90 dagar därefter. Behandling
          av personuppgifter regleras i{" "}
          <Link
            href="/personuppgiftsbitradesavtal"
            className="text-blue-600 hover:underline"
          >
            personuppgiftsbiträdesavtalet
          </Link>
          , som utgör en del av dessa villkor.
        </p>
      </>
    ),
  },
  {
    id: "ansvar",
    heading: "Ansvarsbegränsning",
    body: (
      <>
        <p>
          Vårt sammanlagda ansvar under avtalet är begränsat till det belopp
          kunden erlagt för tjänsten under de tolv månader som föregick den
          händelse som ligger till grund för kravet.
        </p>
        <p>
          Vi ansvarar inte för indirekt skada, såsom utebliven vinst, förlorade
          intäkter eller förlust som beror på att registrerad tid varit felaktig.
          Begränsningarna gäller inte vid uppsåt eller grov vårdslöshet.
        </p>
      </>
    ),
  },
  {
    id: "andringar",
    heading: "Ändringar av villkoren",
    body: (
      <p>
        Villkoren kan ändras med 30 dagars varsel till den e-postadress kunden
        angett. Godtar kunden inte ändringen kan abonnemanget sägas upp innan den
        träder i kraft. Fortsatt användning därefter innebär att de nya villkoren
        accepterats.
      </p>
    ),
  },
  {
    id: "tvist",
    heading: "Tillämplig lag och tvist",
    body: (
      <p>
        Svensk lag tillämpas på avtalet. Tvist som inte kan lösas i samförstånd
        avgörs av svensk allmän domstol med Stockholms tingsrätt som första
        instans.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Användarvillkor"
      updated={LEGAL_UPDATED}
      intro={
        <p>
          Villkoren gäller mellan TERAFALK AB, organisationsnummer anges på
          fakturan, och det företag som använder Tikkr. De accepteras när en
          arbetsyta skapas.
        </p>
      }
      sections={sections}
    />
  );
}
