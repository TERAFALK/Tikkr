# Tikkr — språket i gränssnittet

> Läs den här filen innan du skriver en rad text som en användare ser.
> Den gäller varje yta: säljsidan, adminpanelen, stämplingsskärmen,
> plattformspanelen, varje PDF, varje Excel-ark och varje mejl.
>
> Reglerna är desamma som i `CLAUDE.md` § 7.1 och 7.2. Den här filen är den
> praktiska versionen: terminologi, mönster och facit. Ändras ett beslut
> ändras det i CLAUDE.md först.

## 1. Vem som läser

En verkstadschef eller en administratör på ett svenskt tillverkningsföretag.
Personen kan sitt yrke, har tjugo andra saker att göra idag, och öppnade Tikkr
för att få något gjort — inte för att läsa.

På stämplingsskärmen är läsaren en operatör med handskar på, som står upp,
mitt i ett arbete. Där räknas varje ord dubbelt.

Skriv för den personen. Inte för en nybörjare som behöver handledning, och
inte för en inköpare som ska imponeras.

## 2. Tonen i en mening

**Tikkr är ett verktyg, inte en handledare.** Säg vad saken är och sluta
skriva.

Rakt, men inte kort för kortheten skull. Vänligt, men utan entusiasm.
Professionellt, men inte stelt. Självsäkert, utan att skryta.

Tänk svensk digital produkt byggd av folk som bryr sig om detaljer. Inte
amerikansk startup översatt till svenska.

## 3. De åtta reglerna

1. **Skriv ingen beskrivning som inte behöver finnas.** Standardläget är
   ingen text. En beskrivning skrivs bara när den hindrar ett konkret fel
   eller säger något som inte går att se på skärmen. Ett filter, en kolumn
   eller en knapp med ett begripligt namn förklaras aldrig.

2. **Beskriv aldrig det som redan syns.** "Aktiva först" ovanför en lista där
   aktiva står först, "senaste först", "mest först" — bort.

3. **Motivera aldrig systemets val för användaren.** "Det är dem man har en
   fråga om", "så att ni ser vart timmarna tar vägen", "Ett meddelande som
   inte syns någonstans fyller ingen funktion" — bort. Skälen hör hemma i
   CLAUDE.md och i kodkommentarer.

4. **Inget prat.** Inga tilltal i stil med "så går de att välja när…".
   **Inga tankstreck som lägger till en eftertanke** — skriv en egen mening,
   eller stryk eftertanken. Ingen ton av att förklara för någon som inte
   förstår sitt eget yrke.

5. **Rubriker är substantiv.** "Ordrar", inte "Här är dina ordrar". Knappar är
   verb i imperativ: "Lägg till", "Spara", "Koppla om".

6. **Fälthjälp bara vid format eller konsekvens**, i en kort mening utan punkt
   om den är ofullständig: "Tim:min, t.ex. 7:30", "Minst 10 tecken", "Kan inte
   ångras". Inte varför fältet finns.

7. **Felmeddelanden säger vad som är fel och vad som rättar det. Ett led, inte
   tre.** Och aldrig teknisk jargong: "Felet står i serverloggen" hjälper
   ingen som inte har en server.

8. **Tid skrivs alltid som tim:min.** "8:30", aldrig "8,50". Saldon får sitt
   tecken utskrivet: "+2:15", "−0:45", "0:00". Decimaltimmar finns bara i
   Excel-arket, som är till för att räkna vidare i, och står där bredvid
   tim:min. `src/lib/format.ts` äger båda formaten.

Där något verkligen är svårt — GDPR-radering, fast pris kontra påslag — får en
mening stå kvar. Den ska då vara skriven för en verkstadschef.

## 4. Ord vi aldrig skriver

Inte för att de är fula, utan för att de inte säger något. Listan är inte
komplett; principen är att en formulering som skulle passa i vilket SaaS-system
som helst inte hör hemma i det här.

> smidigt och enkelt · enkelt och effektivt · ta kontroll över · få full koll
> på · allt du behöver · upptäck · revolutionera · nästa nivå · sömlöst ·
> kraftfullt · optimera · maximera · effektivisera · skräddarsytt · oavsett
> om · för dig som · vi gör det enkelt · med Tikkr kan du

Knappar heter aldrig **Läs mer**, **Kom igång**, **Utforska** eller
**Fortsätt din resa** när det finns ett konkret alternativ.

Undvik också engelska ord där svenska finns: *underlag*, inte *export* som
substantiv om dokumentet; *stämplingsskärm*, inte *kiosk* (det ordet är
kodens, inte användarens).

## 5. Terminologi — en sak, ett namn

Det här är den ordlista som gäller. Byt inte synonym för variationens skull.

| Använd | Inte | Varför |
|---|---|---|
| **stämpling** | tidsregistrering, tidrapportering, instämpling | En stämpling är posten. Verbet är *stämpla in* / *stämpla ut*. |
| **registrerad tid** | arbetade timmar, jobbtid, inrapporterad tid | Det som faktiskt står i systemet. |
| **arbetad tid** | — | Bara i löneunderlaget, där den betyder huvudstämplingen. Blanda inte ihop med *registrerad tid*. |
| **order** | projekt, uppdrag, jobb (i panelen) | Kundens order är det allt hänger på. |
| **jobb** | — | Bara på stämplingsskärmen, för "order + arbetsmoment" tillsammans. Operatören säger jobb. |
| **arbetsmoment** | moment (i löpande text), operation, aktivitet | "Moment" går i en rubrik där utrymmet är slut. |
| **improduktiv tid** | intern tid, övrig tid, OH-tid | Städning, möten, underhåll. Når aldrig ett fakturaunderlag. |
| **anställd** | medarbetare, personal (om en person), användare | *Användare* är ett konto i panelen, aldrig en person i verkstaden. |
| **administratör** | admin, användare | Den som loggar in i panelen. |
| **stämplingsskärm** | kiosk, enhet, terminal, panel | Menyn, sidan och fakturan säger alla *stämplingsskärm*. Kortformen *skärm* går på sidan som redan heter så ("Ny skärm"). |
| **panelen** / **adminpanelen** | backend, administrationsgränssnittet | |
| **arbetsyta** | konto, organisation, tenant | Det kunden skapar vid registrering. |
| **underlag** | rapport, faktureringsunderlag | Dokumentet som går till kunden, per order. |
| **efterkalkyl** | kalkyl, lönsamhetsrapport | Internt. Självkostnad, påslag, pris. |
| **rapport** | tidrapport | Uttaget under Rapporter. **Får inte heta tidrapport.** |
| **tidrapport** | lönerapport, tidsrapport | Löneunderlaget per anställd. Bara detta dokument heter så. |
| **beräknad tid** | budget, budgeterad tid, estimat | Per arbetsmoment på ordern. |
| **planerad tid** | schemalagd tid, bokad tid | Planeringsmodulens rutor. Varken arbetad eller fakturerbar. |
| **tillval** | modul (mot kunden), add-on, paket | *Modul* är kodens ord. Kunden ser *tillval*. |
| **påslag** | marginal, uppräkning | Faktor från kostnad till pris. |
| **granskning** | kontroll, attestering | Sidan där flaggade poster rättas. |
| **flexsaldo**, **komptid**, **frånvaro** | — | Löneunderlagets ord. Håll dem där. |

**Rapport och tidrapport är två olika dokument.** Rapporten svarar på hur
mycket kunden ska faktureras. Tidrapporten svarar på hur mycket en person har
arbetat. De räknar samma timme olika, med flit (se CLAUDE.md § 1). Två papper
på samma bord med samma rubrik är precis den sammanblandningen arkitekturen är
byggd för att förhindra.

## 6. Mönster

### Knappar som skapar något
`Ny <sak>` — "Ny anställd", "Ny order", "Ny station", "Ny kund".
Dialogens rubrik är `Lägg till <sak>`, och dess spara-knapp `Lägg till`.

### Knappar som ändrar
`Ändra`. Dialogens rubrik är `Ändra <sak>` eller `Ändra <namnet>`.

### Kvittenser
Kort, i perfekt, utan utropstecken.

> Orsaken är tillagd. · Stämplingen är ändrad. · Stationen är borttagen. ·
> Flexsaldot är ändrat. · Bilden är borttagen.

Inte "Din tidsregistrering har sparats framgångsrikt."

### Tomma tillstånd
En rubrik som substantiv. Beskrivning bara om den säger vad man gör nu.

> Inga anställda upplagda · Inget att granska · Ingen kund matchar "volvo" ·
> Inga stämplingar

Inte "Du har ännu inte registrerat några arbetstimmar för den här perioden."

### Bekräftelser före något oåterkalleligt
En fråga, sedan konsekvensen. Verbet i knappen säger vad som händer.

> Ta bort skärmen Monteringen? Licensen frigörs.
>
> Avaktivera Svetsning? Rasten döljs på stämplingsskärmen men registrerad tid
> finns kvar.

### Fälthjälp
> Tim:min, t.ex. 7:30 · Minst 10 tecken · Faktor, t.ex. 1,4. Tomt ger
> företagets standard · Valfritt. Läggs till arbetsmomentets kostnad

### Fel
> Skriv företagets namn. · Sluttiden måste ligga efter starttiden. · Koden
> består av sex siffror. · Anställningsnumret används redan av en annan
> person. · Stationen har planerad tid. Stäng den och lägg upp en ny för ett
> annat moment.

Sista exemplet är två led: vad som är fel, och vad som rättar det. Det är
taket.

## 7. Säljsidan

Samma språk, mer övertygande. Konkreta påståenden i stället för löften.

Det som gäller:

- **Säg vad produkten gör, inte vad varumärket heter.** Rubriken är "Rätt tid
  på rätt order", inte "Välkommen till Tikkr".
- **Formell svenska.** "Internetanslutningen bryts", inte "nätet försvinner".
- **Vad systemet gör, aldrig varför det är byggt som det är.** Att två dokument
  inte delar kod är sant och viktigt, och helt ointressant för den som köper.
- **Priset står bara i prisavsnittet.** Den som läser uppifrån ska först få
  veta vad de får.
- **Inga kundlöften vi inte kan belägga.** Inga siffror på besparingar, ingen
  påhittad statistik, inga kundcitat vi inte har.

## 8. Tillgänglighet

`aria-label` och `title` är text någon läser upp högt. Samma regler gäller.

> aria-label="Mitt flexsaldo" · aria-label="Föregående vecka" ·
> aria-label="Tikkr, till startsidan" · aria-label="En skärm färre"

Inte "Klicka här för att gå till föregående vecka".

Dolda rubriker för skärmläsare (`sr-only`) är substantiv som alla andra:
"Åtgärder".

## 9. Innan du är klar

Läs varje mening du skrivit och ställ tre frågor:

1. **Skulle en erfaren svensk UX-skribent faktiskt skriva den här meningen
   annorlunda?** Är svaret nej, låt den stå. Skriv inte om text som fungerar.
2. **Låter detta som något en människa skrev?** Känns en formulering för
   perfekt, generisk eller konstruerad — skriv om den. Variera meningslängd.
   Ge inte alla rubriker samma form.
3. **Behöver den finnas?** Den vanligaste förbättringen är att stryka.

## 10. Skyddsnäten

Delar av det här går att mäta, och mäts:

| Test | Fäller |
|---|---|
| `tests/ui-text.test.ts` | Tankstreck i texten användaren ser — i panelen, kiosken, de fyra PDF-filerna, exportrutterna, granskningsnoterna och mejlen |
| `tests/format.test.ts` | En ny sida som visar decimaltimmar |
| `tests/brand.test.ts` | En färg utanför paletten, och ordmärket satt som text |

Resten är omdöme, och omdöme går inte att mäta med ett reguljärt uttryck.
Lägger du text på en ny yta som skriver något en människa läser — en ny
exportrutt, en ny notis, ett nytt mejl — lägg den ytan i `PROSE_FILES` i
`tests/ui-text.test.ts`. Ett skyddsnät som bara täcker halva ytan är värre än
inget, eftersom man slutar titta själv.
