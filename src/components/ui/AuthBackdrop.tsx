import { Aurora, Grid, Motif } from "@/components/marketing/Atmosphere";
import { RunningMockup, TimesheetMockup } from "@/components/marketing/Mockups";
import Parallax from "@/components/marketing/Parallax";

/**
 * YTAN BAKOM INLOGGNING OCH REGISTRERING (infört 2026-10-11, issue #16).
 *
 * Sidorna låg på en platt grå yta. Den som kom från säljsidan, där ljuset
 * driver och produktbilderna ligger som föremål på ett bord, mötte en tom ruta
 * i mitten av ingenting och lämnade ett steg som ser ut att höra till en annan
 * produkt. Registreringen är det första kunden GÖR, och den ska kännas som
 * samma hus.
 *
 * LAGREN ÄR SÄLJSIDANS EGNA, och det är hela skälet att filen är så kort.
 * Ljuset, ritningsrutnätet, symbolen och pointerparallaxen ligger i
 * `marketing/` sedan säljsidans omgång, och de hör ihop: en andra uppsättning
 * gradienter som är "ungefär likadana" är precis vad `Atmosphere.tsx` finns
 * för att slippa. Mappen heter `marketing` efter var de först användes, inte
 * efter vem som får använda dem.
 *
 * BARA AUTH-SIDORNA DRAR IN DEN HÄR FILEN. `AuthShell` ligger i `ui/` men
 * exporteras inte ur `ui/index.tsx`, så stämplingsskärmen och panelen får
 * ingenting av produktbilderna med sig i sitt bygge. Samma avvägning som
 * `HelpLink` gör när den bara importerar typen för en guide.
 *
 * ALLT HÄR ÄR `aria-hidden` OCH `pointer-events-none`. Det är ytor, inte
 * innehåll. Den som lyssnar på sidan ska höra ett formulär, inte två
 * tidrapporter som inte finns, och den som trycker ska aldrig träffa en bild.
 */
export default function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <Aurora tone="onDark" />
      <Grid tone="onDark" />
      <Motif tone="onDark" className="-right-72 -top-56 h-[54rem] w-[54rem]" />

      {/* PRODUKTBILDERNA SVÄVAR, OCH DE SYNS FÖRST FRÅN xl.
          Under den bredden är avståndet mellan rutan och fönsterkanten mindre
          än en produktbild, och bilderna skulle då ligga UNDER formuläret
          i stället för runt om det. En telefon får ljuset och rutnätet, vilket
          är det som bär ytan ändå.

          Rörelsen är två saker samtidigt: de vaggar långsamt av sig själva
          (`animate-float`) och flyttar sig mot pekaren efter sitt djup
          (`parallax-layer`). Det första gör dem levande när ingen rör musen,
          det andra gör ytan till ett rum. Båda stängs av vid minskad rörelse,
          se globals.css och Parallax.tsx. */}
      <Parallax className="absolute inset-0 hidden xl:block">
        {/* STÄMPLINGSSKÄRMEN ÄR DÄMPAD HÅRDARE ÄN TIDRAPPORTEN, och det är
            inte en smaksak. Kioskens kort bär grönt och orange, alltså sidans
            enda mättade färger, och i full styrka är de det första ögat
            hittar. Tidrapporten är vit med grå text och får därför stå
            ljusare. Samma dämpning på båda hade gjort den ena till ett motiv
            och den andra till ett dis. */}
        <div
          className="parallax-layer animate-float absolute -left-32 top-[16%] w-[30rem] opacity-[0.28] [transform:perspective(2400px)_rotateY(14deg)_rotateX(3deg)]"
          style={{ "--parallax-depth": 1.5 } as React.CSSProperties}
        >
          <RunningMockup />
        </div>

        <div
          className="parallax-layer animate-float-slow absolute -right-28 bottom-[12%] w-[26rem] opacity-[0.36] [transform:perspective(2400px)_rotateY(-14deg)_rotateX(3deg)]"
          style={{ "--parallax-depth": 2.1 } as React.CSSProperties}
        >
          <TimesheetMockup />
        </div>
      </Parallax>

      {/* SLÖJAN ÖVER BILDERNA.
          Produktbilderna är vita kort med text, och text bakom ett formulär
          läses som text man ska läsa. Lagret lägger ytans egen färg tillbaka
          över dem, kraftigast i mitten där rutan står, så att de blir ett djup
          och inte ett innehåll.

          Ligger här och inte som lägre opacitet på bilderna: en bild på tjugo
          procent blir grå och platt överallt, medan den här tonar bort just
          mitten och lämnar kanterna intakta. */}
      <div className="absolute inset-0 bg-[radial-gradient(62%_52%_at_50%_45%,rgba(14,26,43,0.95),rgba(14,26,43,0.7)_68%,rgba(14,26,43,0.5))]" />
    </div>
  );
}
