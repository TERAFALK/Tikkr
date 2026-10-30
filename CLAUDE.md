# Tikkr — projektkontext för Claude Code

> Denna fil läses automatiskt i varje ny session. Den är den enda källan till
> projektkontext — uppdatera den när beslut ändras.

## 0. Arbetsflödet — gäller varje session (beslutat 2026-10-10)

Kod går gren → PR → CI → `dev` → labbet → `prod` → tagg → produktionen.
Rutinen står i `docs/release.md`, skälen i § 5.

### Före arbetet
1. Kör `git status` och `git branch --show-current`. Finns ändringar jag inte
   gjort: fråga innan något rörs.
2. Arbeta aldrig på `dev` eller `prod`. Skapa en gren från senaste
   `origin/dev`: `feat/<namn>`, `fix/<namn>` eller `chore/<namn>`. En gren
   är en avgränsad ändring.
3. Läs koden, testerna och avsnittet i denna fil som rör ändringen innan något
   ändras. Är nuvarande beteende oklart: fråga, anta inte.

### Under arbetet
4. Ändra bara det uppgiften kräver. Orelaterad städning, omdöpning eller
   formatering föreslås separat.
5. Logik som rör tid, pengar, lön, behörighet eller `company_id` får ett test
   som fäller felet. Vid buggrättning skrivs testet som visar buggen först.
6. Gränstesterna (`payroll-boundary`, `planning-boundary`, `tenant-*`,
   `module-coverage`, `support-coverage`) försvagas aldrig för att något ska
   gå igenom. Faller ett är det koden som är fel.
7. Ändring i `prisma/schema.prisma` kräver en migration i samma gren, som
   fungerar med FÖREGÅENDE version av appen: lägg till, ta inte bort.
   Borttagning och namnbyte sker i en senare release. Migrationer som raderar
   eller skriver om data anges i PR-beskrivningen med hur man backar.
   Migrationen skapas med `node scripts/new-migration.mjs <namn>`, se § 9.
8. Ny miljövariabel läggs i `.env.example` och `docker-compose.yml` och anges
   i PR-beskrivningen under "Driftändringar".

### Före commit
9. Kör lokalt: `npm run typecheck`, och `npm run build` när ändringen rör
   bygget. Testerna med databas körs av CI på PR:en — läs resultatet innan
   något kallas klart. Skriv vad som är verifierat och vad som inte är det.
10. Läs hela diffen. Inga hemligheter, felsökningsrader eller orelaterade filer.
11. Commit och push till grenen. Öppna PR mot `dev` med `gh pr create`: vad,
    hur det testats, migrationer, driftändringar. **Aldrig push eller
    force-push till `dev` eller `prod`**, aldrig `--no-verify`. En akut
    rättelse i produktionen grenas från `origin/prod` och går mot `prod`, se
    `docs/release.md` steg 7.

### Det som bara användaren beslutar
12. Sammanslagning till `dev` eller `prod`, en tagg `v*`, en GitHub Release
    och varje driftsättning kräver användarens uttryckliga ja i samma session.
13. Claude har ingen åtkomst till servrarna och ska inte ha det. Claude ger
    kommandon, ett i taget; användaren kör dem.
14. Ett kommando som raderar eller skriver över data (`restore.sh`,
    `docker compose down -v`, `prisma db push` eller `migrate reset` mot
    produktionen, SQL som ändrar rader) föreslås bara med en tydlig varning om
    vad som går förlorat, och efter en backup. Seed körs aldrig i produktionen.
15. Produktionen används aldrig för att prova något. Allt provas i labbet först.

### Versioner och beslut
`vMAJOR.MINOR.PATCH`. PATCH = rättelse utan migration. MINOR = ny funktion
eller vilken migration som helst. MAJOR = kunden måste göra något.

Ett beslut om hur systemet ska bete sig skrivs in i denna fil med datum. Det
som bara gäller en version hör hemma i releaseanteckningen.

Det kunden ska veta om en version skrivs i `src/lib/release-notes.ts`, i en
egen PR före taggningen. Se § 5 och `docs/release.md` steg 1.

## 1. Vad Tikkr är

Ett molnbaserat **stämplingssystem för touchskärm** som svenska verkstads- och
tillverkningsföretag använder för att registrera arbetstid per **order** och
**arbetsmoment**. Domän: **tikkr.se**.

### Avgränsning — läs denna först

**Tikkr lämnar TVÅ underlag: ett för fakturering och ett för lön.**
(Ändrat 2026-09-26. Tidigare gällde "aldrig för lön". Pilotkunden behövde
tidrapporter, och beslutet fattades av produktägaren.)

Löneunderlaget är sedan 2026-09-27 dessutom ett TILLVAL kunden betalar extra
för, se § 3.1. Den gränsen är kommersiell och ligger utanpå den tekniska —
den gör inget av det som står här mindre sant.

**Gränsen går vid pengar till lön, inte vid tid.** Tikkr räknar timmar:
planerad tid, närvarotid, flex och frånvaro. Vad timmarna är värda i lön
avgörs av kollektivavtalet, i lönesystemet. Lägg därför ALDRIG till lönearter,
OB-tillägg, övertidsersättning, karensavdrag eller semesterlön — de reglerna
ändras med varje avtalsrörelse, och ett system som har dem fel betalar fel lön
till riktiga människor.

**De två underlagen räknar samma timme olika, och det är avsiktligt.**

> En operatör kör två maskiner 08–12. Fakturaunderlaget visar ÅTTA
> maskintimmar — båda ordrarna ska betala sin. Tidrapporten visar FYRA timmar,
> för så länge var personen på jobbet.

Det är därför de aldrig får dela kod. `payroll.ts`, `schedule.ts`,
`absence.ts`, `breaks.ts` och `timesheet-pdf.ts` importeras ALDRIG av
`order-export.ts`, `pdf.ts`, `order-calc.ts`, `report.ts` eller
exportrutterna. Bevisas av `tests/payroll-boundary.test.ts`. Skulle
fakturasidan börja läsa löneunderlaget vore det en tidsfråga innan någon
"förenklade" till en siffra, och kunden skulle faktureras för halva arbetet.

Konsekvenser att hålla fast vid:
- Rapporterna svarar på "hur mycket ska kunden faktureras". Tidrapporten
  svarar på "hur mycket har personen arbetat". Blanda dem inte.
- En felaktig stämpling är numera BÅDE ett fakturafel och ett lönefel.
  Allvarligare än förut, och skälet till att varje beräknad tid är märkt som
  beräknad.

**Improduktiv tid** (ändrat 2026-09-23). Städning, möten och underhåll får
registreras, i ett eget register skilt från arbetsmomenten.

Skälet är inte att den tiden ska faktureras — den når aldrig ett
fakturaunderlag. Skälet är att den annars göms i närmaste order och förstör
just det underlaget. En städtimme som bokförts på order 2601 gör den ordern
dyrare än den var, och kunden betalar för golvet.

Den hålls isär på fyra sätt, och alla fyra ska finnas kvar:
1. Eget register (`indirect_moments`), inte en bock på arbetsmomenten.
2. `ReportFilters.kind` utelämnad betyder ORDER. Glömska ger fakturerbar tid,
   aldrig tvärtom. **Rapportvyn på skärmen visar däremot BÅDA som standard**
   (ändrat 2026-10-01) och skickar då sitt val uttryckligen, både till
   rapporten och till uttaget. Biblioteksregeln står kvar orörd: den som
   glömmer skicka något får fakturerbar tid.
3. Importgrafen: `pdf.ts` och `calc-pdf.ts` ser bara orderdata, aldrig
   rapporttyperna. Ingen fil ser båda.
4. `order-export.ts` och `order-calc.ts` filtrerar uttryckligen på
   `kind: "ORDER"`, fastän en improduktiv post inte kan ha en order.

### Kärnflöde (kiosk)

En anställd går fram till en touchskärm, trycker på sitt namn, stämplar in/ut,
väljer order och arbetsmoment (t.ex. "Svetsning"). Stämplar personen in på ett
nytt jobb **på samma arbetsmoment** stämplas hen automatiskt ut från det förra
— en maskin kör ett jobb i taget. Stämplar hen in på ett **annat** moment
läggs det till bredvid, och båda löper parallellt.

**Ingen PIN-kod. Ingen bekräftelseruta.** Ett tryck ska räcka och det ska kännas
omedelbart (optimistisk UI-uppdatering). Den enda koden på skärmen är den som
visar en anställds eget flexsaldo, och den rör inte stämplingen — se regel 7.

**Tillbaka går ett steg, Avbryt går hem** (beslutat 2026-10-30, UX-granskningen).
Tillbaka står i sidhuvudet på varje delsteg, och Avbryt betyder alltid tillbaka
till namnen. Valdes fel order fanns tidigare bara vägen hem, och i kundvalet stod
två Avbryt med olika betydelse. Ett byte av jobb står kvar när man går bakåt inom
valet, och avbryts först vid personens egen vy.

**Namnrutnätet får fler kolumner på en stor skärm** (beslutat 2026-10-30,
UX-granskningen), och en bokstavsrad över 24 anställda, samma som kundvalet har.
Bokstaven släpper av sig själv efter samma tid som ett halvfärdigt val.

**Ordervalet börjar på knappsatsen** (ändrat 2026-10-01). Den som ska börja
eller byta jobb har ordernumret på ritningen framför sig; rutnätet med öppna
ordrar ligger ett tryck bort, på "Visa öppna ordrar".

Rutnätet visar det **högsta ordernumret först** (ändrat 2026-10-07). Nya
ordrar får höga nummer, och det är dem folk stämplar på. Sorteringen sker i
koden och inte i databasen, eftersom numret är en textsträng — som text kommer
"99" efter "426". Nummer som inte är tal hamnar sist, i bokstavsordning.

**Snabbjobb nås från båda hållen** (ändrat 2026-10-07): knappen i ordervyn och
en egen knapp under knappsatsen. Vägen fanns redan via ett okänt nummer, men
den som inte HAR ett nummer såg ingen väg alls, och knappsatsen är första vyn
även vid jobbyte.

### Adminflöde

Administratör loggar in separat i en adminpanel, hanterar anställda/ordrar/
moment och tar ut rapporter (tid per order, person, moment) med export till
Excel/PDF.

**Filtren i Rapporter och Stämplingar är en rad, och de gäller direkt** (beslutat
2026-10-30, UX-granskningen). `FilterBar` har perioden överst, de vanligaste
fälten under, och resten bakom Fler filter, som står öppet så länge något i det
är valt. Ett snabbval byter bara datumen. Summeringarna i Rapporter ligger bakom
ett tryck, så att listan börjar på första skärmen.

**Ett namn och ett ordernummer leder vidare** (beslutat 2026-10-30, produktägarens
val). Ordernumret öppnar ordern på varje sida. Namnet leder till personens
tidrapport med löneunderlaget, och annars till personens stämplingar
(`person-link.ts`). En anställd har ingen egen sida.

**Stämplingar går att filtrera på order, och Ordrar på status** (beslutat
2026-10-30, produktägarens val). Ordersidan länkar till orderns stämplingar, där
de går att rätta.

**Tidrapportens utskrifter står i två grupper** (beslutat 2026-10-30,
UX-granskningen): den valda personen och hela personalen. Sidan visar en person,
men tre av utskrifterna gäller alla, och frånvaro är känsliga uppgifter (§ 4
punkt 9). Justera flexsaldo står vid saldot.

**Listorna är kort på telefon** (beslutat 2026-10-30, produktägarens val). Ordrar,
Stämplingar, Anställda och Kunder visar varje rad som ett kort under `sm`, med
`Table cards` och en `label` på cellerna. Det är samma celler som på skrivbordet,
ritade om i `globals.css`, så att telefonen aldrig kan visa något annat.

**Osparade ändringar frågar innan de försvinner** (beslutat 2026-10-30,
UX-granskningen). `UnsavedGuard` står i `SaveForm`, i Arbetstider och i rutorna
för anställd, kund och order: en länk i panelen och webbläsarens omladdning
frågar på en sida, och Escape frågar i en ruta. Avbryt frågar inte, eftersom det
är ett val man gjort med flit. Korta rutor har ingen fråga.

**Menyn bär det man arbetar i, Inställningar det man sätter upp** (beslutat
2026-10-14, issue #17). Vänstermenyn har två avsnitt: **Dagligen** (Översikt,
Granskning, Stämplingar, Veckovy, Planering, Tidrapport, Rapporter) och
**Register** (Ordrar, Kunder, Anställda). Arbetsmoment, Improduktiv tid,
Stämplingsskärmar och Stationer låg också under Register, och menyn hade
fjorton punkter. De sätts upp en gång och står sedan, och ligger nu under
Inställningar, i avsnitten Stämpling och Planering. De gamla adresserna
skickas vidare i `next.config.ts`, så att bokmärken fortsätter fungera.

Frågan för en ny sida är alltså hur ofta den öppnas: varje dag eller vecka
hör den till menyn, en gång och sedan sällan hör den till Inställningar.

**En order öppnas som en kund** (beslutat 2026-10-30, produktägarens val).
Ordernumret i listorna och i Ordrar i arbete på översikten leder till
`/admin/ordrar/<id>`. Det öppnade en meny förut, och från översikten rapporten.
Sidan har efterkalkyl och underlag med samma knappar som markeringsläget, Ändra
och Stäng ordern, tiden per arbetsmoment mot beräkningen, och en länk till
stämplingarna i Rapporter. Menyn är borttagen, också på kundsidan och under
Granskning, där ett snabbjobb nu rättas på orderns sida. Att markera flera och
ta ut eller avsluta dem i ett svep fungerar som förut, och valet Visa belopp
och rabatt finns bara på en enskild order, som förut.

**Ordrar och Anställda går att söka i, som Kunder** (beslutat 2026-10-30).
Sökningen är ett vanligt formulär som hamnar i adressen som `q`
(`SearchForm`). Ordrar söks på ordernummer, kund och kundnummer, anställda på
namn och anställningsnummer. Sökrutan göms i markeringsläget, eftersom en
sökning laddar om sidan och tappar det man markerat.

**Bara ägaren ändrar fakturan och anonymiserar** (beslutat 2026-10-18,
produktägarens val, säkerhetsgranskningen). Ägaren bjuder in, tar bort och
nollställer administratörer som förut, och nu också licenser, tillval,
kassan, betalningsportalen och GDPR-anonymiseringen. Allt annat gör en
administratör. Skälet är att de två första ändrar vad kunden betalar, och
den sista går inte att ångra. En administratör ser prenumerationssidan men
inga knappar, och den låsta panelen säger att ägaren aktiverar
prenumerationen. Prövningen ligger i varje serveråtgärd (`isOwner` i
`admin-session.ts`) och bevisas av `tests/owner-coverage.test.ts`, som
härleder prenumerationens åtgärder ur filen.

**Stämplingar och Rapporter visar 50 rader i taget** (beslutat 2026-10-17,
issue #24), med Föregående och Nästa. Båda ritade varje rad i urvalet, och en
rapport utan datum var då varje stämpling arbetsytan gjort: sidan blev
långsammare för varje vecka kunden använde systemet. **Bara listan delas
upp.** Rapportens total, grupper och uttag räknas på hela urvalet som förut,
och en grupp som delas mellan två sidor behåller sin egen summa
(`src/lib/paging.ts`). Stämplingar bläddrar i databasen; Rapporter hämtar
hela urvalet, eftersom summorna behöver det. Pågående stämplingar står
överst på första sidan. Sidnumret följer inte med när perioden byts.

**Varje lista bläddras likadant, och man väljer hur många rader en sida
visar** (beslutat 2026-10-30, produktägarens önskan). Gäller Ordrar, Kunder,
Anställda, ordrarna på en kundsida, Stämplingar, Rapporter och Ändringsloggen,
och plattformens Kunder, Historik, Händelser, Inkorg och Beställningar. Det
finns EN komponent, `Pager`, och den går inte att använda utan radvalet.
Förvalet är 50 överallt, också i plattformens kundlista och inkorg som hade 25,
och 25, 100 och 200 går att välja. Rymmer listan högst 50 rader syns ingen
bläddring alls, vad adressen än säger (`listPaging`). Är den längre står valet
kvar även när allt ryms på en sida, så att det går att välja om. Valet ligger i
adressen som `antal`, och inte i en kaka, av samma skäl som `helg=visa` på
tavlan. Filter och sökning behåller valet; sidnumret börjar om. Uttaget i
Rapporter påverkas inte av något av dem. Bläddringen göms i markeringsläget,
som sökrutan. Rubrikens antal gäller hela urvalet. Ordrar och Anställda
bläddrar i databasen, registren som redan hämtas hela i minnet.

Stämplingar har EN Ändra-ruta för hela listan (ändrat 2026-10-20). Varje rad
hade en egen, och varje ruta bar hela orderregistret, så sidan växte med rader
gånger ordrar. Rapporten hämtar raderna med sina nycklar och namnen en gång
per anställd, order och moment.

**Översikten svarar på vad som händer nu och vad som väntar** (beslutat
2026-10-20, produktägarens godkända förslag). Den samlar det man annars
öppnar fem sidor för, och har inga diagram för diagrammens skull:

- **Nyckeltalen.** "Registrerat idag" och veckans tid räknas av `buildWeek`,
  samma räkning som Veckovy. Rutorna är länkar till sidorna talen kommer från,
  och Att granska är samma tal som siffran i menyn (ändrat 2026-10-30).
- **Pågående arbete.**
- **Att göra:** granskning, ordrar från stämplingsskärmar att komplettera,
  automatisk utstämpling som inte körs, och stämplingsskärmar som inte hört
  av sig på ett dygn, samma gräns som plattformens lista.
- **Ordrar i arbete:** de senaste sju dagarna, tid mot beräknad tid, räknat
  av `orderRows` som orderlistan.
- **Planerat idag**, bara med Planering, räknat i `plan-today.ts` med
  tavlans egna delar.

Sidan hämtas om varje minut medan fliken syns. Frånvarande idag valdes bort:
frånvaro är känslig och hör till löneunderlaget (§ 4 punkt 9). Säljsidans
bild av översikten (`AdminMockup`) ändras i samma PR som översikten.

**Stämplingsskärmar vi säljer fjärrstyrs från panelen, aldrig från skärmen**
(beslutat 2026-10-19). En skärm som kör i Fully Kiosk rapporterar sin
version, sitt nät och sitt serienummer, och får då knappen Fjärrstyrning
under Stämplingsskärmar: ljusstyrka och omstart. En kunds egen dator eller
surfplatta rapporterar ingenting och får ingen knapp. Det är en förmåga
skärmen intygar och inte en bock, så den kan inte vara fel. Ljusstyrkan syns
inte på stämplingsskärmen, som saknar inloggning: ett reglage där hade låtit
vem som helst släcka stämpelklockan. `src/lib/fully.ts` är enda filen som
känner appen, och hårdvaran står i `docs/kioskskarm.md`.

**Omstarten finns också på skärmen** (ändrat 2026-10-30, produktägarens val).
En ikon överst i rutan under kugghjulet, bara på skärmar som kör appen, och
bakom en fråga. Den som står vid en skärm som krånglar ska inte behöva ringa
någon med panelen. Vem som helst kan alltså starta om, men inte med tryck i
kön, och skärmen är tillbaka efter en minut. **Stänga av finns inte:**
`fully.shutdown()` kräver en rotad enhet, och våra skärmar är inte rotade.

**Starta om startar om hela skärmen** (ändrat 2026-10-26), med
`fully.reboot()`, och appen om enheten inte går att starta om. Skärmen är
borta i ungefär en minut, och startar som förut aldrig om med tryck i kön.

**Skärmarnas inställningar ställs in i ProDVX portal, inte i Tikkr**
(beslutat 2026-10-26, produktägarens val). Samma dag byggdes först tre
inställningar som Tikkr skickade till skärmarna, och sedan hela
konfigurationsfiler med versioner och krypterade hemligheter, som skärmarna
läste in med appens `importSettingsFile`. Det blev för rörigt, och allt togs
bort igen. Konfigurationen sätts vid provisioneringen och ändras med en
USB-sticka, se `docs/kioskskarm.md` § 6. Det som finns kvar är Fjärrstyrning:
ljusstyrka och omstart av hela skärmen. Tabellerna från försöket ligger kvar,
döda, och tas bort i en senare release.

### Multi-tenant

Flera kundföretag delar samma app-instans, men deras data är **helt isolerad**
via `company_id`-filtrering i koden.

### MVP-omfattning

- Stämplingsskärm (touch): välj namn → stämpla in/ut → välj order → välj moment
- Automatisk utstämpling vid byte av jobb på samma arbetsmoment
- Adminpanel: CRUD för anställda, ordrar, moment
- Rapporter med export till Excel (ev. PDF)
- Multi-tenant: ett företag = en isolerad arbetsyta, samma kodbas

## 2. Teknikstack

**Bestämd. Ändra inte utan att fråga användaren.**

| Del | Val | Varför |
|---|---|---|
| Frontend + Backend | **En enda Next.js-app** (App Router, TypeScript, sidor + API-routes i samma projekt) | Ett paket att bygga, förstå och deploya — ingen separat backend-tjänst |
| Styling | Tailwind CSS | Snabbt, snyggt, konsekvent |
| Databas | Vanlig Postgres-container (bara databasen) | Enklast möjliga — ingen plattform ovanpå att sköta |
| Databaskoppling | Prisma (ORM) | Enkelt och säkert sätt att prata med databasen |
| Reverse proxy / HTTPS | **Labb:** Nginx Proxy Manager (fanns redan). **Produktion:** Caddy. | NPM äger redan port 80/443 i labbet — rör det inte. I produktion väljs Caddy för att konfigurationen då ligger som textfil i git och servern kan återskapas identiskt, vilket NPM:s webbgränssnitt inte tillåter. |
| Server | Egen VPS hos **Glesys** (Falkenberg/Stockholm) | Enda löpande kostnaden. Svensk drift krävs — integritetspolicyn och biträdesavtalet anger servrar i Sverige |
| Betalning | Stripe (Billing/Subscriptions) | Ingen fast avgift, styr åtkomst automatiskt, självbetjäning |
| Bokföring | Fortnox, matas med Stripes intäktsdata | Vanlig bokföring/moms, slipper manuella fakturor |
| Offline-stöd | PWA + service worker + lokal kö (IndexedDB) | Stämpling ska funka vid wifi-hack, synkar sen |
| Auth (admin) | Auth.js, i samma Next.js-app | Ingen separat auth-server |
| Auth (kiosk) | Device-token, kontrolleras i appens egen API-kod | Några rader kod, ingen extra tjänst |
| E-post | Microsoft Graph, avsändare `noreply@tikkr.se` i Terafalks tenant | Återställning av lösenord och inbjudningar. Appen är låst till en enda postlåda med en åtkomstpolicy |

**Designprincip: så få containrar som möjligt.** I praktiken **två** — app och
databas — eftersom servern redan har en reverse proxy. `docker compose up -d`
startar allt.

**Varför inte självhostad Supabase eller liknande plattform:** sådana lösningar
är i praktiken 10+ separata containrar (databas, auth-server, API-lager, realtid,
admin-UI m.m.). Kraftfullt, men det motsäger målet om *ett* enkelt paket.

## 3. Datamodell

```
companies      — id, name, subscription_status, created_at, atf_agreement?,
                 planning_mode, kiosk_config_id? (död)
employees      — id, company_id, name, active, cost_rate_ore,
                 schedule_id?, flex_opening_minutes, flex_code_hash?, hourly,
                 balance_opening_date?, atf_work_form?
customers      — id, company_id, name, customer_number, org_number,
                 contact_name, email, phone,
                 address_line, postal_code, city,
                 markup_percent, discount_percent, notes, active
orders         — id, company_id, order_number, customer_id?, status,
                 planned_due_date?
order_budgets  — id, company_id, order_id, moment_id, minutes, sort_order
work_moments   — id, company_id, name, cost_rate_ore
indirect_moments — id, company_id, name, active
time_entries   — id, company_id, employee_id, kind,
                 order_id?, moment_id?, indirect_moment_id?,
                 clock_in_at, clock_out_at, source,
                 moment_cost_rate_ore, employee_cost_rate_ore,
                 needs_review, review_note, kiosk_device_id, source_ip
admin_users    — id, company_id, email, first_name?, last_name?, phone?,
                 password_hash, role,
                 password_changed_at?, sessions_revoked_at?, email_verified_at?,
                 news_seen_version?, name? (död, se § 4 punkt 3)
email_verifications — id, user_id, token_hash, email, expires_at, used_at
audit_events   — id, company_id, actor_email, entity, entity_id, action,
                 before, after, subject_employee_id
kiosk_devices  — id, company_id, name, token_hash?, pairing_code_hash?,
                 pairing_expires_at?, last_seen_at?,
                 fully_version?, webview_version?, brightness?,
                 restart_requested_at?, serial_number?, network_type?,
                 wifi_ssid?, wifi_signal?, reported_at?,
                 kiosk_config_id?, applied_config_version_id?,
                 config_applied_at? (de tre sista döda)
support_visits — id, company_id, email, started_at, last_seen_at
feedback_messages — id, company_id, author_user_id?, author_email, author_name?,
                 kind, area?, page?, body, done_at?, done_note?, done_by_email?

  — arbetstiderna, arbetsytans sedan 2026-10-17, se regel 8 —
work_schedules   — id, company_id, name, is_default
schedule_days    — id, company_id, schedule_id, weekday, start_minute, end_minute
schedule_breaks  — id, company_id, schedule_day_id, start_minute, end_minute

  — löneunderlaget, se regel 7 —
break_types      — id, company_id, name, active, sort_order
break_entries    — id, company_id, employee_id, break_type_id,
                   started_at, ended_at, source, needs_review
absence_reasons  — id, company_id, name, active, sort_order, counts_as_comp,
                   gives_atf
absences         — id, company_id, employee_id, date, reason_id, minutes,
                   note, created_by_email
comp_adjustments — id, company_id, employee_id, date, minutes,
                   note, created_by_email, absence_id
holidays         — id, company_id, date, name, created_by_email

  — planeringen, se regel 8 —
stations         — id, company_id, name, moment_id, active, sort_order
station_days     — id, company_id, station_id, weekday, start_minute,
                   end_minute
station_breaks   — id, company_id, station_day_id, start_minute, end_minute
planned_blocks   — id, company_id, station_id, order_id, moment_id,
                   starts_at, minutes, note, created_by_email
staff_blocks     — id, company_id, employee_id, order_id, moment_id,
                   planned_block_id?, starts_at, minutes, note,
                   created_by_email

  — tillvalen, se § 3.1 —
company_modules  — id, company_id, module, source, stripe_item_id,
                   enabled_by, enabled_at

company_prices   — id, company_id, item, monthly_ore, updated_by_email
company_kiosk_settings — död sedan 2026-10-26

  — plattformens egna tabeller, aldrig kundens —
stripe_prices    — item, month_price_id, year_price_id, updated_by_email
kiosk_setting_defaults, kiosk_configs, kiosk_config_versions,
kiosk_config_downloads — döda sedan 2026-10-26
login_throttles  — scope, key_hash, count, until

  — tillbehören, se § 3.4 —
company_profiles  — id, company_id, org_number, contact_name, order_email,
                    phone, address_line, postal_code, city,
                    delivery_reference, billing_address_line,
                    billing_postal_code, billing_city, invoice_email
shop_orders       — id, company_id, number, status, payment_status,
                    idempotency_key, placed_by_email, ögonblicksbild av
                    köparen och adresserna, goods_ore, shipping_ore?,
                    vat_ore, total_ore, carrier?, tracking_url?,
                    invoice_number?, invoiced_at?, paid_at?
shop_order_lines  — id, company_id, order_id, product_key, name,
                    unit_price_ore, vat_rate_percent, quantity,
                    subtotal_ore, vat_ore, sort_order
shop_order_events — id, company_id, order_id, kind, from_status, to_status,
                    detail, customer_message, actor_email, email_state
shop_order_notes  — id, order_id, target_company_id, body, author_email
                    (plattformens, ingen relation)
shop_products     — id, key, slug, kind, name, summary, description,
                    price_ore, vat_rate_percent, max_quantity, delivery,
                    warranty, benefits, included, requirements, specs,
                    in_shop, on_site, sort_order (plattformens)
shop_product_images — id, product_id, data?, mime_type?, static_path?, alt,
                    illustration, sort_order
shop_prices       — död, ersatt av shop_products.price_ore (se § 3.4)
```

### Beslutade regler för stämpling (bestämt 2026-08-10)

1. **En stämpling är antingen ordertid eller improduktiv tid.**
   `time_entries.kind` avgör vilket. ORDER har order + arbetsmoment, INDIRECT
   har ett improduktivt moment. Aldrig både och, aldrig ingetdera.

   Ordertid kräver alltid både order OCH moment — det finns inget "Ingen
   order"-val och inga interna ordrar. Improduktiv tid går en egen väg, se
   avgränsningen överst.

   Villkoret kan inte uttryckas i databasen (`db push` saknar CHECK) och vaktas
   därför i `src/lib/clock.ts`, som är enda vägen in. Ordrar och moment med
   registrerad tid går inte att radera (`onDelete: Restrict`) — de stängs.

   **Ett improduktivt moment som ALDRIG stämplats på går däremot att ta bort**
   (tillagt 2026-10-07). Det bär ingenting, och den som provat sig fram ska
   inte tvingas leva med "Städnign" i listan för alltid. Samma avvägning som
   för stationer utan planer, se regel 8. Knappen visas bara när räknaren står
   på noll, och åtgärden räknar om själv innan den raderar.
2. **En anställd kan ha flera pågående stämplingar — en per arbetsmoment.**
   (Ändrat 2026-09-23. Tidigare gällde högst en stämpling alls.)

   Skälet: en operatör kör ibland två maskiner samtidigt. Går två maskiner en
   timme är det två maskintimmar, och båda ordrarna ska betala sin. Timkostnaden
   sitter på arbetsmomentet, och **momentet är maskinen** — därför är det
   momentet och inte personen som får ha ett jobb i taget.

   Skyddet mot dubbelfakturering försvann inte, det smalnade av: aldrig två
   öppna stämplingar på samma maskin. Den garantin ligger i `clockIn`, och
   `assertNoOverlap` vaktar samma sak för tider som skrivs in för hand.

   Konsekvens: en utstämpling måste peka ut VILKET jobb den gäller. Gör den
   inte det, och flera jobb pågår, stängs det senast påbörjade och posten
   flaggas för granskning — aldrig ett felsvar, eftersom offline-kön kastar
   tryck som får 4xx och arbetstid då går förlorad.

   **Ett köat tryck avvisas inte för att världen hunnit ändras** (tillagt
   2026-10-05). En order som stängts medan trycket låg i kön stoppar det
   inte; det registreras och flaggas. Ett tryck som kommer fram efter en
   senare stämpling på samma moment blir ett avslutat pass fram till nästa
   början, i stället för ett öppet jobb som överlappar. Kön tar bara bort ett
   tryck när servern själv svarat 400 eller 409 med ett besked — 401 och
   proxyns felsidor behåller det.

   **Skärmens klocka mäts, den litas inte på** (tillagt 2026-10-05). Skärmen
   skickar både när trycket gjordes och när det skickades. Servern räknar ut
   hur fel klockan går och rättar trycket efter det; avviker den mer än två
   minuter flaggas posten. Se `punch-time.ts`.

3. **Glömd utstämpling stängs vid ett fast klockslag OCH flaggas.**

   **Helgstämpling flaggas också** (tillagt 2026-10-01). En stämpling som görs
   på en lördag eller söndag går igenom precis som vanligt, men hamnar i
   granskningen. Helgtid är nästan alltid något som ska beslutas om innan den
   faktureras eller blir flex, och en post som ingen tittat på hinner annars
   bli både faktura och lön. Veckodagen räknas i företagets tidszon, och både
   in- och utstämplingen prövas: ett pass som börjar fredag kväll och slutar på
   lördagen flaggas.

   `companies.auto_close_at` (standard "18:00", per företag) styr när. Posten
   får `source = AUTO_CLOSE`, `needs_review = true` och en `review_note` i
   klartext. Systemet fyller aldrig i en tid i tysthet — admin får en lista
   att rätta.
   Tidszon per företag, annars glider klockslaget mellan sommar- och vintertid.

   **Övertid efter klockslaget går inte förlorad** (beslutat 2026-10-05).
   Stängdes ett jobb automatiskt medan personen fortfarande arbetade visar
   skärmen det i sex timmar med "Stämpla ut nu". Trycket förlänger passet till
   dess, om det gäller samma jobb och inget startats på maskinen sedan dess.
   Posten förblir flaggad: systemet vet att personen tryckte, inte att hen
   arbetade hela tiden. Se `extendAutoClosed` i `clock.ts`.

4. **Självkostnaden är personens sats PLUS momentets** (bestämt 2026-09-25).
   Momentet är maskinen, `employees.cost_rate_ore` är människan, och en
   verkstad betalar för båda samtidigt. Svetsar Anna, som kostar 350 kr i
   timmen, vid en fräs som kostar 500, är raden 850 kr per timme.

   Båda satserna **kopieras till stämplingen** och läses aldrig upp i
   efterhand. En prishöjning får inte ändra en kalkyl som redan fakturerats.
   Två fält och inte ett hopslaget, så att efterkalkylen kan skriva
   "person 350 + maskin 500" — ett belopp som inte går att bryta ned går inte
   att förklara för den som ifrågasätter fakturan.

   **Saknad sats är inte noll.** Finns bara en av dem räknas den ensam. Saknas
   båda är raden utan underlag och redovisas som saknad tid, aldrig som noll
   kronor i en total.

   Satserna visas **aldrig** på stämplingsskärmen. Kiosken visar inga belopp
   alls, och vad en person kostar företaget hör inte på en skärm i verkstaden.

5. **Priset räknas på ETT ställe, och kunden får se en del av det**
   (beslutat 2026-09-26).

   ```
   självkostnad   (person + maskin, ögonblicksbild på stämplingen)
     × påslag      order → kund → företag, första ifyllda vinner
     − rabatt      kundens procent
     = pris
   ```

   Fast pris (`orders.fixed_price_ore`) går före allt, och rabatten tillämpas
   då inte — det avtalade beloppet är vad kunden ska betala.

   **Gränsen mellan de två dokumenten är flyttad, inte riven.** Kunden får se
   priset och rabatten; kunden ser ALDRIG er självkostnad eller marginal.
   `src/lib/order-price.ts` äger hela räkningen och lyder ut bara det kunden
   får se — typen `OrderPrice` har inga kostnads- eller marginalfält, så en
   läcka blir ett **typfel**. `order-export.ts` och `pdf.ts` importerar bara
   den, aldrig `order-calc.ts`.

   Belopp på kundens underlag är ett **val vid uttaget** (kryssruta), inte ett
   läge på kunden. Utan kryss visas bara tid, som förut.

6. **Beräknad tid anges per arbetsmoment** (ändrat 2026-09-26).

   Var ett enda timfält på ordern. Den siffran gick att jämföra med utfallet
   men inte att förklara: en order som spruckit sa ingenting om vilket moment
   som drog över, och nästa beräkning blev lika grov som den förra. Nu läggs
   raderna till en i taget — moment och timmar — i `order_budgets`.

   **Orderns totala beräkning är summan av raderna och lagras aldrig.** Ett
   cachat totalfält och en uppsättning rader är två ställen som säger samma
   sak, och de hinner alltid sluta göra det. `src/lib/order-budget.ts` äger
   både läsningen av formuläret och skrivningen.

   Totalen är det som visas i orderlistan och i kundens underlag, precis som
   förut. **Uppdelningen stannar i adminpanelen** — kunden ska se vad jobbet
   tog och vad det var beräknat till, inte hur verkstaden fördelat timmarna
   internt.

   Systemet stoppar aldrig stämpling för att en beräkning överskrids.

7. **Löneunderlaget: schema, raster, flex och frånvaro**
   (tillagt 2026-09-26).

   **Schemat ger PLANERAD tid**, netto efter schemats raster. Kundens vardag
   är 06:30–16:00 minus 20 minuters frukost och 40 minuters lunch, alltså 8,5
   timmar. Utan schema finns ingen planerad tid, och allt arbete blir flex.

   **Den som inte går på företagets tider får egna** (tillagt 2026-09-29).
   Arbetstiderna sätts under Anställda, i samma ruta som namn och timkostnad,
   och lagras som ett vanligt schema personen ensam är kopplad till. Tomt
   betyder företagets standard, vilket är det normala.

   Formen fanns redan i datamodellen (`Employee.scheduleId`), så beräkningen
   behövde inte ändras alls: `schedulesForEmployees` tar personens eget schema
   när det finns och standardschemat annars. Skälet att bygga det nu är att en
   deltid annars mäts mot någon annans dag, och då visar flexsaldot fel varje
   vecka utan att någon kan peka på varför.

   Fälten och tolkningen av dem ligger på VARSITT ställe och inte på två:
   `ScheduleDays` ritar dagarna, `readScheduleDays` läser dem. Samma formulär
   står på två sidor, och två läsare av samma fält hade glidit isär vid första
   ändringen — en glidning som syns först som ett felaktigt saldo.

   Ett eget schema utan dagar finns inte. Kryssas rutan ur raderas schemat och
   kopplingen, samma princip som att raden ÄR tillståndet i § 3.1.

   **RÖDA DAGAR ÄR KUNDENS EGEN LISTA** (tillagt 2026-10-13), under
   Inställningar, Röda dagar, i `holidays`. En röd dag har ingen planerad tid
   för någon i arbetsytan: den som är ledig tappar ingenting i flex, den som
   arbetar får tiden som plus, och frånvaro utan timmar täcker noll, som en
   lördag. En uträknad kalender med Sveriges helgdagar valdes bort av
   produktägaren: vilka aftnar och klämdagar som är lediga skiljer sig mellan
   verkstäder, och en lista kunden skrivit säger exakt det som gäller hos dem.
   Priset är att listan måste fyllas i varje år. Ändringar loggas, eftersom
   en röd dag flyttar flexen för alla på en gång. ATF-underlaget minskar inte
   av en röd dag, se ATF nedan.

   **TIMANSTÄLLD MÄTS INTE MOT NÅGOT SCHEMA** (tillagt 2026-10-07).
   `employees.hourly` stänger av planerad tid och flexsaldo för den
   personen. Arbetad tid, raster och frånvaro registreras som för alla andra.

   Utan fältet föll en timanställd tillbaka på företagets standardschema, se
   `schedulesForEmployees`. Det gav fyrtio timmar planerat i veckan och ett
   flexsaldo som sjönk med varje timme hen inte arbetat — ett tal som ser ut
   som en skuld, för någon som inte lovat några timmar.

   Att noll planerat inte heller duger är hela skälet att flexen sätts till
   noll och inte räknas: formeln hade annars gjort varje arbetad timme till
   ett plus i flex.

   Krysset sitter i rutan under Anställda, före arbetstiderna, och gömmer dem
   — ett schemaformulär under krysset hade sett ut som att tiderna ändå
   gäller. Ett eget schema raderas när krysset sätts. Rutan som justerar
   saldot avvisar personen på servern, inte bara i menyn.

   **ATF RÄKNAS SOM UNDERLAG, ALDRIG SOM SALDO** (beslutat 2026-10-13, ersätter
   "ATF är inte byggt" från 2026-10-07). Pilotkunden behövde intjänad
   arbetstidsförkortning på löneunderlaget, och lämnade sin egen formel:

   ```
   ATF = (planerad tid + flex föregående månad − ogiltig frånvaro) × faktor
   ```

   Faktorn är avtalets minuter per heltidsvecka delat med veckans minuter.
   Teknikavtalet IF Metall ger 82 minuter på 40 timmar för dagtid, alltså
   0,03417, det kunden räknat som 0,0342, och 202 minuter för tvåskift.

   - **Avtalet väljs per företag** under Inställningar, Arbetstidsförkortning,
     och **arbetstidsformen per anställd**. Värdena står i
     `src/lib/collective-agreements.ts` med källa och avtalsperiod. Ändras
     avtalet ändras raden där, i en egen PR, så att ändringen syns i en
     granskning. Det är skälet att de inte skrivs in i en ruta i panelen.
   - **Flexen är FÖREGÅENDE månads**, kundens val: deras lönekörning räknar
     ATF innan månaden är slut. Det är månadens flex och aldrig saldot, som
     hade räknat samma timmar en gång till för varje månad de stod kvar.
   - **Ogiltig frånvaro** är frånvaro på en orsak utan kryss i **Ger ATF**, ett
     val kunden gör per orsak, eftersom avtalen säger olika. En orsak som drar
     på flexen dras aldrig: den ledigheten syns redan som minus i flexen.
   - **Timanställda** räknas på arbetad tid och frånvaro som ger ATF. Formeln
     hade gett dem noll, och avtalet ger den som arbetar kortare tid ATF i
     proportion.
   - **Röda dagar minskar inte underlaget.** De har ingen planerad tid, men
     avtalet räknar en vecka med en helgdag som fullgjord, så schemats tid de
     dagarna läggs tillbaka och står för sig på utskriften.
   - **Bara för en hel kalendermånad.** Formeln blandar två månader, och för en
     vecka finns ingen föregående månad. Då visas ingen ATF alls hellre än en
     som är fel.

   **Tikkr håller inget ATF-saldo.** Tidbanken, uttagen och det som vid
   årsskiftet blir pensionspremie hör till lönesystemet. Allt räknas i
   `src/lib/atf.ts`, och `tests/atf.test.ts` fäller det.

   **Underlaget står bara på Löneunderlaget, inte på tidrapportens papper**
   (ändrat 2026-10-30, kundens begäran), se § 3.2. Raden heter Intjänad ATF
   Period. Flexen från föregående månad står på en egen rad, eftersom den
   annars bara syntes i den finstilta raden med talen. Rutan Intjänad ATF står
   kvar på sidan Tidrapport (produktägarens val), så att en persons ATF går att
   kontrollera utan att skriva ut hela personalen.

   **Ett ATF-uttag är frånvaro på kundens egen orsak** (beslutat 2026-10-30,
   produktägarens val). Löneunderlaget summerar frånvaron per orsak, och där
   syns uttaget för perioden. Listan vet inte vad orsakerna heter, så det
   krävdes ingen ny kolumn, och något saldo uppstår inte.

   Det är inte ett avsteg från avgränsningen överst: ATF är timmar, inte
   kronor. Det avtalet styr är hur många timmar, och därför står avtalets tal
   för sig, med källa, och inte utspridda i räkningen.

   **Rasterna STÄMPLAS** (kundens val), och ett rasttryck stänger ALLA
   pågående jobb. Därmed faller rasten bort ur närvarotiden av sig själv, och
   varken rapporterna eller fakturaunderlaget behöver veta att raster finns.

   Rasterna har ett EGET register, `break_entries`, av samma skäl som
   improduktiv tid fick ett: improduktiv tid är arbete som inte faktureras,
   en lunch är inte arbete alls. En rastpost har varken order, moment eller
   timkostnad och kan därför inte faktureras ens av misstag.

   **Flexformeln, som bara räknas i `src/lib/payroll.ts`:**

   ```
   flex(dag) = arbetad tid + frånvarotid − planerad tid − uttagen flex
   ```

   | Fall | Arbetad | Frånvaro | Planerad | Uttagen flex | Flex |
   |---|---|---|---|---|---|
   | Normal dag | 8,5 | 0 | 8,5 | 0 | 0 |
   | Sjuk hel dag | 0 | 8,5 | 8,5 | 0 | 0 |
   | Övertid två timmar | 10,5 | 0 | 8,5 | 0 | +2 |
   | Flexledig hel dag | 0 | 8,5 | 8,5 | 8,5 | −8,5 |

   Frånvaron TÄCKER den planerade tiden — annars gav en sjukvecka minus
   fyrtio timmar. Frånvaro på en orsak som drar på flexen dras sedan bort
   igen: den som är flexledig tar ut timmar hen arbetat in.

   **Arbetad tid är HUVUDSTÄMPLINGEN** (`mainMinutes` i `spans.ts`), aldrig
   råsumman. Det är här de två underlagen skiljer sig, se avgränsningen överst.

   **Perioden kapas till hela dygn i `buildPayrollPeriod`** (tillagt
   2026-10-05). `from` och `to` pekar ut DAGAR men kommer in som tidpunkter,
   och vilken tidpunkt beror på var de kommer ifrån: förvalet räknas ur
   `startOfWeekIn` och landar vid midnatt, medan ett datum ur adressfältet går
   genom `parseLocalDate`, som med flit landar klockan 12 för att undvika
   natten då klockan ställs om.

   Skickades de råa in i frågan föll halva första dagen bort. Samma vecka för
   samma person visade 6:51 när man kom in på sidan och 3:23 när man växlat
   vecka fram och tillbaka, eftersom förmiddagens stämplingar låg före gränsen
   andra gången. Frånvaro, som dateras vid dygnets början, försvann helt från
   första dagen.

   Normaliseringen ligger i `buildPayrollPeriod` och inte hos anroparna: sidan,
   PDF:en och flexsaldot kallar alla dit, och en regel som varje anropare måste
   komma ihåg är ingen regel. Rapportvyn gör samma sak med `startOfDayIn` och
   `endOfDayIn`, och **exportrutten gör det numera också** — den tolkade
   datumen med `new Date("...T00:00:00")`, alltså i serverns zon, som är UTC.
   Arket och skärmen kunde därmed visa olika summor för samma vecka, och det
   ena är ett fakturaunderlag.

   **Två jobb som startar i exakt samma ögonblick: det LÄNGSTA räknas**
   (ändrat 2026-10-05). Ingetdera startade medan det andra pågick, så båda är
   huvudjobb, och då avgör längden.

   Sorteringen tog tidigare bara hänsyn till starttiden, och vid lika tid
   avgjorde den ordning passen råkade komma i. Den kommer ur en databasfråga
   som sorterar på `clock_in_at` och ingenting mer, och Postgres lovar
   ingenting om rader som är lika — samma vecka visade därför 6:51 ena gången
   och 3:23 den andra, utan att något ändrats. Ett tal som hoppar är värre än
   ett tal som är lågt.

   Att det längsta vinner är inte godtyckligt: 08:00–12:00 och 08:00–16:00
   betyder att personen var på plats till 16, och fyra timmar hade dragits
   från hens flexsaldo. Tiden EFTER ett huvudjobb räknas fortfarande inte,
   även om ett sidojobb fortsätter — det är avsiktligt och oförändrat.

   Den räknas i HELA MINUTER (tillagt 2026-10-01). En stämpling bär sekunder,
   eftersom den sätts när någon trycker, och det syns ingenstans utom i
   saldot: det lagras som hela minuter och läses tillbaka, så en justering gick
   inte ihop. Administratören skrev 2 och fick 1,99.

   Avrundningen sker en gång per dag och person, i `mainMinutes`, och inte per
   pass — annars växer felet med antalet stämplingar. **Fakturasidan rörs
   inte:** rapporterna och efterkalkylen summerar rått med `minutesBetween` och
   vet inte att `spans.ts` finns. Ett belopp som redan fakturerats ska inte
   ändras av att löneunderlaget räknar jämna minuter.

   **KOMPTID FINNS INTE, BARA FLEX** (beslutat 2026-10-13, kundens begäran).
   Komptiden var ett eget saldo: övertid flyttades dit med en knapp Komptid
   på varje dag i tidrapporten, och "Uttagen komp" drog på det. Kunden
   skiljer inte på dem, och två saldon för samma timmar var ett tal för
   mycket. Nu är tid utöver schemat flex, och ledighet på inarbetad tid är
   frånvaro på en orsak som drar på flexen. Standardorsaken heter
   **Flexledig**. Knappen och rutan är borttagna, och ordet komp står
   ingenstans kunden ser.

   `comp_adjustments` och `employees.comp_opening_minutes` läses inte längre
   men ligger kvar (§ 0 punkt 7). Registerutdraget lämnar ut dem så länge de
   har innehåll, och anonymiseringen raderar dem. De tas bort i en senare
   release. En arbetsyta som redan har orsaken "Uttagen komp" behåller
   namnet, men orsaken drar nu på flexen; den byter namn under Inställningar.

   **Startdatumet sätts under Anställda** (ändrat 2026-10-13, var borttaget
   ur panelen 2026-10-10). Det ligger i `balance_opening_date`, och flexen
   räknas från och med den dagen. Ingående flex sätts fortfarande med
   Justera flexsaldo. Ingående komptid sätts inte, se ovan.

   **Frånvaroorsakerna är kundens egna rader** (ändrat 2026-10-01), i
   `absence_reasons`, och läggs upp under Inställningar. Var en enum i koden,
   vilket betydde att en kund som behövde "arbetsskada" fick vänta på en
   driftsättning. Orsakerna följer deras verksamhet och deras kollektivavtal,
   inte vår kod.

   Den enda av dem som betyder något för räkningen är `counts_as_comp`, som i
   panelen heter **Drar på flexsaldot**: frånvaro på en sådan orsak täcker
   inte den planerade tiden, utan minskar flexen. Kolumnen behåller sitt namn
   från komptiden, eftersom ett namnbyte kräver en migration i två steg och
   ingenting kunden ser ändras. Alla övriga orsaker är etiketter, och
   `payroll.ts` summerar dem per namn utan att veta vad de heter.

   En orsak RADERAS aldrig, den avaktiveras. En post från i mars ska gå att
   läsa i oktober, och databasen vägrar dessutom (`onDelete: Restrict`). Samma
   princip som att ordrar och moment med registrerad tid stängs i stället för
   att raderas, se regel 1.

   Nya arbetsytor får de vanliga åtta vid registreringen, inte vid första
   sidvisningen. En läsning som skriver skulle falla i supportläget, som
   avvisar varje skrivande operation, se § 4 punkt 5.

   **Saldon lagras aldrig, de härleds.** Ett cachat saldo och en uppsättning
   poster är två ställen som säger samma sak. `employees.flex_opening_minutes`
   finns för kunder som flyttar in med befintliga timmar, och är sedan
   2026-10-01 också vägen in för en **manuell rättelse**: administratören
   skriver vad saldot ska vara idag, och servern lägger skillnaden mot det
   framräknade på det ingående saldot. Nuvärdet räknas fram på servern och
   skickas aldrig in från rutan — ett tal webbläsaren räknat på hinner bli
   gammalt medan rutan står öppen.

   **Saldot idag och en periods flex räknas utan tidrapporten runt omkring**
   (ändrat 2026-10-20). `currentFlexMinutes` byggde en hel tidrapport från
   startdatumet till idag, och ATF-underlaget en för förra månaden, för att få
   fram ett tal var. Tidrapport blev långsammare för varje vecka personen
   arbetat. Nu räknar `flexBetween` i `payroll.ts` dem, samma väg som det
   ingående saldot: samma formel dag för dag, men bara med tiderna och
   frånvaron. `tests/flex-time.test.ts` fäller en räkning som börjar säga
   något annat än tidrapporten.

   **Saldot räknas från STARTDATUMET (`balance_opening_date`), och är det tomt
   från personens FÖRSTA STÄMPLING** (tillagt 2026-10-01). Dagen avgörs på ett ställe,
   `balanceStart` i `payroll.ts`, eftersom två vägar in i samma saldo hann
   säga olika saker: tidrapporten utelämnade all historik före perioden, så
   saldot blev periodens egen flex, medan stämplingsskärmen räknade ett år
   bakåt och gav en nyanställd minus för varje schemalagd dag innan hen fanns.
   Rutan som justerar saldot visade det ena talet och ändrade det andra, och
   ett inskrivet 0 lämnade tvåtusen timmar kvar.

   Den som aldrig stämplat har inget härlett saldo. Då står det ingående
   ensamt, vilket är noll för alla utom den som flyttat in med timmar.

   **Dagar före startdatumet har varken planerad tid eller flex** (tillagt
   2026-10-13), även i tidrapporten för en period som börjar tidigare. Till
   dess räknade tidrapporten varje schemalagd dag i perioden, medan
   stämplingsskärmen började vid startdagen, och en vecka där någon börjat på
   onsdagen gav minus för måndag och tisdag på det ena stället men inte på det
   andra. Stämplingar och frånvaro före startdatumet visas som vanligt, och en
   heldagsfrånvaro där står med schemats timmar: löneunderlaget behöver dem
   även när flexen inte räknas. Utan startdatum och utan stämplingar räknas
   ingen dag alls.

   **Den anställde ser sitt eget saldo på stämplingsskärmen** (tillagt
   2026-10-01), efter att ha angett en personlig kod som administratören satt
   under Anställda. Vägen dit är ett **i uppe till höger**, bredvid Avbryt,
   och syns först när man tryckt på sitt namn. Knappen låg en kort tid som en
   egen rad i åtgärdsrutnätet, bredvid Stämpla ut och Byt jobb, och tog lika
   mycket plats som de — fast den inte är en stämpling. Koden ligger som bcrypt-hash, går inte att läsa tillbaka
   och bromsas av samma räknare som inloggningarna.

   Att STÄMPLA kräver fortfarande ingen kod, och det är hela skillnaden: ett
   tryck ska räcka för att registrera tid, annars slutar folk stämpla. Ett
   flexsaldo är något annat — en uppgift om en namngiven person, på en skärm
   i en verkstad där vem som helst går förbi.

   Därför visas saldot inte heller som kvitto efter "Stämpla ut allt"
   (ändrat 2026-10-05). Det gjorde det en tid, sex sekunder och utan kod.

   **Allt i det här stycket är modulens, och ingenting av det finns utan
   modulen** (tillagt 2026-10-01). Koden i rutan under Anställda, knappen på
   stämplingsskärmen, rutten som svarar med saldot och sidan med
   frånvaroorsaker: alla fyra är grindade, och rutten svarar 404 även om
   knappen av något skäl skulle visas. Se § 3.1 om varför grinden ligger i
   koden och inte i menyn.

   Även dataskyddstexten under Inställningar följer modulen. Den påstod att
   ingen frånvaro eller sjukdom registreras, vilket är sant för en kund utan
   löneunderlaget och fel för en kund med det — och just den texten är den
   kunden visar sina anställda.

   Facit för hela räkningen är kundens egen tidrapport från Monitor, avskriven
   som fixtur i `tests/payroll.test.ts`: 33,75 närvaro mot 34,00 planerat ger
   −0,25 i flex, varav 0,17 produktivt och 33,58 improduktivt.

8. **Planeringen: stationer, tidslinje och planerade rutor**
   (tillagt 2026-10-04).

   Ett tillval, se § 3.1. Svarar på frågan som ligger mellan beräkningen och
   stämplingen: **när** ska jobbet köras, och **på vilken maskin**. Verkstaden
   vet vad ordern är beräknad att ta per arbetsmoment (regel 6) och i efterhand
   vad den tog (stämplingarna). Steget däremellan låg på en whiteboard.

   **PLANERAD TID ÄR VARKEN ARBETAD ELLER FAKTURERBAR TID.** Den är en avsikt,
   och når ALDRIG ett fakturaunderlag, en efterkalkyl, en rapport eller en
   tidrapport. Började fakturasidan läsa planen vore det en tidsfråga innan
   någon fakturerade en order på vad den var *tänkt* att ta, och kunden skulle
   betala för arbete som inte utförts. Det är samma fel som motiverar gränsen
   mot löneunderlaget, bara åt andra hållet.

   `planning.ts`, `plan-calendar.ts` och `plan-live.ts` importeras därför aldrig
   av `order-export.ts`, `order-calc.ts`, `order-price.ts`, `pdf.ts`,
   `calc-pdf.ts`, `report.ts`, `report-pdf.ts` eller exportrutterna. Bevisas av
   `tests/planning-boundary.test.ts`.

   **Planeringen läser stämplingen, aldrig tvärtom.** Ingen fil i modulen
   skriver till `time_entries`, och kiosken rörs inte alls. En plan som skriver
   om sig själv när verkligheten avviker går inte att lita på, och en plan som
   kan flytta en stämplad timme vore ett fakturafel.

   **En station gör ETT arbetsmoment; ett arbetsmoment kan finnas på flera
   stationer.** Momentet är maskinen (regel 2), men en verkstad har ofta två
   fräsar. Villkoret `block.momentId === station.momentId` kan inte uttryckas i
   databasen (`db push` saknar CHECK) och vaktas i `planning.ts`, som är enda
   vägen in — samma konstruktion som `clock.ts` har för `kind`.

   Stationens arbetsmoment går inte att byta när rutor finns: varje ruta skulle
   annars tyst börja peka på en annan beräkningsrad.

   **Att STÄNGA och att TA BORT en station är olika saker** (ändrat
   2026-10-04). Stänga är "maskinen finns men ska inte planeras på just nu":
   den försvinner från tavlan, går att öppna igen, och kräver att den saknar
   rutor från idag och framåt. Ta bort är "den här stationen skulle aldrig ha
   funnits" — rutorna följer med, och deras tid dyker upp i Oplacerat igen
   eftersom den oplacerade tiden härleds.

   Att radering tillåts alls är ett avsteg från regel 1, där ordrar och moment
   bara stängs. Skälet är att de bär något stationen inte bär: registrerad tid,
   alltså underlag för en faktura och en lön. En station bär PLANER, och en
   plan som visade sig vara fel ska gå att ta bort.

   **En rutas minuter är ARBETSMINUTER, inte väggklockans.** En ruta på fyra
   timmar som börjar 10:00 på en station med lunch 12:00–12:40 slutar 14:40 men
   är 4:00 arbete. Regeln i en mening: **bara stationens egna raster hoppas
   över.** Tid utanför öppettiderna räknas som arbete — det är själva
   innebörden av överbokning. `plan-calendar.ts` äger hela den räkningen, och
   `tests/plan-calendar.test.ts` fäller den.

   Slutet lagras aldrig; det är start plus minuter enligt stationens kalender.
   Ingen ruta korsar midnatt: dras den dit kapas den, och återstoden ligger kvar
   som oplacerad.

   **INGEN TID FÅR FALLA BORT.** Modulens enda hårda krav mot användaren: summan
   av en orders planerade rutor plus dess oplacerade tid är ALLTID den beräknade
   tiden. Därför lagras den oplacerade tiden ingenstans — den härleds vid varje
   läsning, av samma skäl som orderns totala beräkning aldrig lagras (regel 6).
   Krymper man en ruta kommer minuterna tillbaka av sig själva.

   **Överbokning tillåts och varnas för i gult.** Två rutor i varandra, eller
   mer planerat än dagen rymmer, markeras men avvisas inte. Administratören vet
   ibland att maskinen ska gå över kvällen, och en plan som vägrar är en plan
   man slutar använda. Systemet stoppar aldrig planering för att en beräkning
   överskrids, lika lite som det stoppar stämpling.

   **Tavlan visar utfallet, aldrig tvärtom.** `plan-live.ts` läser `time_entries`
   och märker en ruta som pågående när någon står instämplad på dess order och
   moment. Tillskrivningen är medvetet förenklad: **en stämpling bär ingen
   station**, eftersom kiosken inte känner några — ligger två rutor för samma
   order och moment samtidigt på olika stationer räknas samma minuter på båda.
   Siffran svarar på om jobbet körs, inte på vad som ska faktureras. Den sanna
   summan finns i rapporterna, och `tests/plan-live.test.ts` spikar fast regeln
   så att en ändring av den kräver ett beslut.

   Summeringen är rå (`minutesBetween`), aldrig `mainMinutes`: tavlan frågar om
   maskinen gick, inte om personen var på jobbet.

   **Stationernas arbetstider ligger i EGNA tabeller**, inte i
   `work_schedules`. Modulerna säljs var för sig, och en kund kan ha
   planeringen utan löneunderlaget — en stationssida som krävde lönemodulen
   vore ett riktigt fel. Priset är att den som har båda matar in arbetstider två
   gånger, och det är rätt pris. Formuläret de ändå delar bor i
   `src/lib/weekly-hours.ts`, som är **neutral och ska förbli det**: den läses
   från båda hållen, precis som `modules.ts` och `brand.ts`.

   `src/lib/schedule.ts` exporterar om den delen, så att lönekoden läser sitt
   schema där den alltid gjort det.

   **Momenten har en ORDNING på ordern** (`order_budgets.sort_order`, tillagt
   2026-10-04). Svetsningen före lackeringen. Ordningen är orderns egen och
   inte global: samma två moment kan komma i olika följd på två jobb, och ett
   företagsgemensamt flöde hade därför varit fel.

   Den kommer ur radernas ordning i formuläret och inte ur ett eget fält —
   webbläsaren skickar fälten som de står. Pilarna som flyttar en rad visas
   bara med modulen, men ordningen SPARAS för varje kund: den som köper
   planeringen ett halvår senare har då en ordning redan i stället för en tom
   uppgift på varje order.

   Styr tre saker: raderna i orderrutan, ordningen i Oplacerat, och pilarna
   mellan rutorna på tavlan.

   **Pilarna finns i två sorter.** Mellan moment, enligt ordningen ovan. Och
   mellan DELARNA av samma moment: sex timmars fräsning delad på fyra timmar
   måndag och två på tisdag är ett arbete, och utan pil såg det ut som två
   orelaterade jobb med samma ordernummer. Delarna kedjas i starttidsordning
   oavsett station, eftersom ett moment delat mellan två fräsar hör ihop lika
   mycket som ett delat över två dagar.

   Bara pilar mellan MOMENT kan bli gula. Två fräsar som kör samma fräsning
   samtidigt är inte otakt utan två maskiner på samma jobb. Den **spärrar ingenting** — att planera
   lackeringen före svetsningen går utmärkt, och tavlan ritar då pilen gul och
   streckad. Att se att något är i otakt är mer värt än att hindras.

   **Stationer med samma arbetsmoment ligger bredvid varandra** på tavlan.
   Två fräsar är utbytbara mot varandra och inget annat, och den som letar en
   ledig lucka tittar på dem i samma ögonkast. Grupperna kommer i
   bokstavsordning på momentets namn, och pilarna i stationsregistret flyttar
   en station inom sin grupp. Momentnamnet är den enda stabila nyckeln:
   ordningen momenten görs i är ORDERNS, inte företagets.

   **Överplanering tillåts men syns.** Sju timmar på ett moment beräknat till
   sex går igenom, av samma skäl som systemet aldrig stoppar stämpling för att
   en beräkning överskrids (regel 6). Raden står då kvar i Oplacerat med "Över
   beräknat" i gult. Till 2026-10-04 filtrerades den bort i stället, och
   överplanering var därmed helt osynlig.

   **Leveransdatumet på ordern** (`orders.planned_due_date`) hör till modulen
   och visas i orderrutan bara när den är på. Utan det vet planeraren inte vad
   som brådskar, och Oplacerat har ingen annan ordning än ordernummer.

   **Planerade rutor är inte personuppgifter.** En ruta bär station, order,
   arbetsmoment och tid — ingen person. Personalpassen gör det, se
   planeringsläget nedan. Vem som körde jobbet framgår bara av
   stämplingarna, som redan har sin GDPR-väg. Anonymiseringen i § 4 punkt 8
   behöver därför inte röras, till skillnad från löneunderlagets poster.

   Kiosken är **orörd**. Ett tryck ska räcka.

   **PLANERINGSLÄGET: PRODUKTION ELLER TJÄNST** (beslutat 2026-10-14,
   issue #21, produktägarens val). Planeringen passade bara verkstäder, och en
   elfirma som planerar människor på jobb hade inga stationer att lägga något
   på. Läget väljs per företag under Inställningar, Planeringsläge, och ligger
   i `companies.planning_mode`. Det är ETT tillval och inte två: det kunden
   betalar för är detsamma, att lägga ordrarnas beräknade tid ut i veckan.

   | Läge | Vyer på tavlan | Räknar av beräkningen |
   |---|---|---|
   | Produktion (förval) | Stationer | stationernas rutor |
   | Tjänst | Personal | personalens pass |

   **Exakt EN resurs räknar av orderns beräknade tid.** Räknade både stationen
   och personen av samma timme vore den planerad två gånger, och regeln att
   ingen tid får falla bort vore bruten. I Produktion är personalen därför
   bemanning på stationens rutor, och dess pass räknas inte mot beräkningen:
   maskinens körtid och operatörens arbetstid skiljer sig, som när en CNC kör
   sex timmar obemannad på en timmes ställtid.

   **Förvalet är Produktion**, så att varje befintlig kund har kvar det
   planeringen alltid varit. Att byta läge rör ingen planerad tid: stationerna
   och rutorna står kvar och syns igen om läget byts tillbaka.

   Lägena står i `src/lib/planning-modes.ts`, som inte har några importer. En
   ny verksamhetstyp är ett värde i enumen `PlanningMode` och en rad där.
   `tests/planning-modes.test.ts` fäller ett register och ett schema som
   glidit isär.

   **ARBETSTIDERNA ÄR ARBETSYTANS, INTE ETT TILLVALS** (beslutat 2026-10-17,
   produktägarens val, ersätter "personalens arbetstider blir planeringens
   egna" från 2026-10-14). Löneunderlaget mäter flexen mot dem och planeringen
   gråmarkerar och varnar efter dem, och båda läser SAMMA tider. Planeringen
   fick under en dag en egen uppsättning, och samma människors tider på två
   ställen blev rörigt.

   - **Företagets tider** står under Inställningar, Arbetsytan, **Arbetstider**,
     och **egna tider** under Anställda, i personens ruta. Båda syns med
     löneunderlaget eller planeringen, eller båda (`WORK_HOURS_MODULES` i
     `modules.ts`, `requireWorkHours` i `company-modules.ts`). Rasttyperna för
     stämplingsskärmen är löneunderlagets och står kvar där, under **Rasttyper**.
   - **En enda läsare**, `src/lib/work-hours.ts`, som är neutral som
     `weekly-hours.ts`. `schedule.ts` och `staff-hours.ts` läser båda därifrån,
     och `tests/planning-boundary.test.ts` fäller ett annat bibliotek som
     läser tabellerna direkt. Gränsen mellan tillvalen står kvar: planeringen
     importerar ingenting från löneunderlaget.
   - **Bara regeln om den timanställda skiljer.** I löneunderlaget har hen
     inget schema. I planeringen får hen företagets tider, så att tavlan visar
     när verkstaden är öppen.
   - **Frånvaro syns inte i planeringen.** Den är känslig och löneunderlagets.
   - Tabellerna `staff_days` och `staff_breaks` från fas 3 togs bort i samma
     PR, innan de nått `dev`: migrationen som skapade dem står kvar och nästa
     tar bort dem, så att labbets historik stämmer.
   - **Stationernas öppettider är kvar i egna tabeller.** En maskin är ingen
     anställd.

   Byggs i faser: läget och vyerna (fas 1), personalpassen (fas 2),
   personalens arbetstider och tillgänglighet (fas 3) och passen mot
   stämplingen (fas 4). Alla fyra är gjorda.

   **PERSONALPASSEN** (tillagt 2026-10-14, fas 2). Ett pass är en anställd på
   en order och ett arbetsmoment, med start och längd, i `staff_blocks`. Enda
   vägen in är `src/lib/staff-planning.ts`. Tavlan är densamma som för
   stationerna, med en rad per aktiv anställd: `PlanBoard` ritar "resurser",
   där en station kör ett moment och en anställd tar vilket som helst.

   - **I Tjänst** placeras passen från Oplacerat, med samma två tryck som
     stationernas rutor, och räknar av orderns beräknade tid.
   - **PRODUKTION HAR INGEN PERSONALFLIK** (ändrat 2026-10-17, produktägarens
     beslut). Fliken visade bemanningen per person, men det gick inte att
     planera något där, bara att se och flytta. Den togs bort, och tavlan i
     Produktion är bara stationerna. Ett bokmärke till `?vy=personal` leder
     till stationerna. Bemanningen finns kvar i stationsrutan, nedan.
   - **I Produktion** är passen bemanning. De läggs från stationsrutans dialog
     med knappen **Bemanna**, bär rutans id (`planned_block_id`), och start
     och längd föreslås ur rutan men går att ändra. De räknas inte mot
     beräkningen.
   - **Flyttas stationsrutan följer bemanningen med**, lika långt, i samma
     transaktion (`moveBlock`). Bemanningen hör till körningen.
   - **Tas stationsrutan bort ligger passet kvar** utan koppling
     (`onDelete: SetNull`). En persons planerade dag ska inte försvinna för att
     maskinplanen ändrades.
   - **Två pass samtidigt för samma person varnas i gult**, och avvisas inte.
     En operatör kör ibland två maskiner (regel 2). I Tjänst syns det på
     personalvyn, i Produktion i Bemanna, se arbetstiderna nedan.

   **PERSONALENS TILLGÄNGLIGHET** (tillagt 2026-10-17, fas 3). Vems tider som
   gäller och vad som ligger utanför dem räknas i `src/lib/staff-hours.ts`,
   med tiderna ur `work-hours.ts`, se arbetstiderna ovan.

   - **Egna tider går före företagets**, hela veckan. Saknas båda finns inga
     tider, och då gäller väggklockan och dagen ritas vit. Tavlan säger då
     "Personalen har inga arbetstider", med en länk till Arbetstider. "Inga
     tider" och "ledig den dagen" är olika svar.
   - **Ett pass räknas i arbetsminuter**, som en stationsruta: personens
     raster hoppas över, och passet kapas vid midnatt med dem inräknade.
   - **I Tjänst ritar tavlan personens tider**: stängd tid och raster i Lav
     (`CLOSED_CLASS` i `PlanBoard`, samma som förklaringen), och gult "över"
     när mer är planerat än dagen rymmer.
   - **I Produktion varnar Bemanna** för pass utanför arbetstid och för pass
     som ligger i ett annat av personens pass, även på en annan station
     (`passWarnings`). Varningar, aldrig hinder.

   **PLANERAT MOT STÄMPLAT PER PERSON** (tillagt 2026-10-17, fas 4).
   `plan-live.ts` räknar utfallet för ett pass med `employeeId`: bara
   personens egna stämplingar på passets order och moment, inom passet. Det är
   exakt, till skillnad från en stationsruta, där tavlan inte vet vid vilken
   maskin någon stod.

   - **Passet** blir grönkantat när personen står instämplad, och visar
     stämplat mot planerat, som stationsrutorna.
   - **Raden för varje anställd** i Tjänst visar veckans "Planerat · Stämplat",
     summan av passen och av det som stämplats inom dem (`laneTotals`).
     Stämplat utanför ett pass räknas inte där; det syns i rapporterna.
   - **Bemanna** visar det stämplade per bemannat pass.
   - **En vecka som varit hämtar utfallet en gång**, utan pollning. Till
     2026-10-17 visades utfallet bara för den pågående veckan, och planerat mot
     stämplat gick inte att se i efterhand.
   - Fortfarande råa minuter per jobb, aldrig `mainMinutes`. Vad personen
     arbetat räknar tidrapporten, och planeringen delar ingen kod med den.

   **TIDSLINJEN** (ändrat 2026-10-17). Var dagarna ligger, vad ett tryck
   träffar och var klockslagen står räknas på ETT ställe,
   `src/lib/plan-geometry.ts`, för rubriken, rutnätet och träffytan. De räknade
   var för sig förut: klockslagen stod bredvid sina linjer, och slutet av varje
   dag kapades eftersom skiljelinjen räknades utanför dagen men ritades
   innanför. `tests/plan-geometry.test.ts` fäller det.

   - **Axeln visar alltid minst 06–18** och en timme kring resursernas tider
     (`dayWindow`). Den slutade där stationen stängde, och då gick det inte att
     trycka in ett jobb 17:00, fast överbokning är tillåten.
   - **Helgen är dold som standard och visas med knappen Visa helg**
     (beslutat 2026-10-17, produktägarens val). Valet står i adressfältet som
     `helg=visa`, följer med mellan veckor och dagar, och är borta nästa gång
     tavlan öppnas. Inte i en kaka: integritetspolicyn räknar upp systemets
     kakor, och ett visningsval hör inte dit. Är något planerat i en dold helg
     står antalet i gult på knappen. Dagvyns pilar hoppar över en dold helg.
   - **En helg som visas är hela dagar**, med tidslinje. En tom helgdag stod en
     kort tid som en smal kolumn, och den såg avkapad ut bredvid en hel dag.
   - **Vecka och Dag ersätter zoomknapparna.** Dag lägger en dag i full bredd
     och står i adressfältet som `dag`. Ett tryck på en dag i rubriken öppnar
     den, och pilarna går över veckans kant.
   - **Linjen för nu går på webbläsarens klocka**, och syns därför i båda
     vyerna och för personalen.
   - **Veckan ryms i skärmens bredd.** Golvet för skalan är lågt
     (`WEEK_SCALE_FLOOR`, 0,12 pixlar per minut), dagarnas bredder avrundas
     nedåt och det som blir över delas ut en pixel per dag. Med 0,25 behövde
     sju dagar med axeln 06–18 1 400 pixlar, och söndagen hamnade utanför
     kanten. Den som behöver läsa timmarna byter till Dag.

   **ETT PERSONALPASS ÄR EN PERSONUPPGIFT**, till skillnad från en
   stationsruta: det säger var en namngiven person ska vara och när.
   Anonymiseringen raderar passen och registerutdraget lämnar ut dem, även när
   planeringen är avstängd, av samma skäl som frånvaron (§ 3.1).


Multi-tenant-isolering byggs i appens kod: **varje databasfråga går via ett
gemensamt lager** i Prisma som alltid filtrerar på inloggad användares
`company_id`. Ett enda ställe i koden, inte utspritt — och testat automatiskt.

**Lagret prövar också det som skrivs** (tillagt 2026-10-18,
säkerhetsgranskningen). En ändring får inte sätta ett annat `companyId`, och
nästlade skrivningar på kunddata är begränsade till nya rader som själva bär
rätt `companyId`, som schemats och stationernas raster. Kopplingar
(`connect`) och nästlade ändringar vägras: en koppling sätts som ett id-fält,
efter att raden slagits upp genom `forCompany()`. Bevisas av
`tests/tenant-writes.test.ts`.

### 3.1 Tillval — moduler kunden betalar extra för (beslutat 2026-09-27)

**Basen är stämpling mot order**: kioskskärmen, rapporterna och
fakturaunderlaget. Den är alltid på.

**Löneunderlaget är ett tillval.** Det byggdes för att en pilotkund behövde
det och ingick från början gratis, men det är ungefär en tredjedel av
systemet — och kunden som bara vill fakturera rätt fick en panel full av
menypunkter hen aldrig öppnar. Läggs allt i basen blir Tikkr ett affärssystem
till priset av en stämpelklocka, och prislappen går inte längre att förklara.

**Planeringen är det andra tillvalet** (tillagt 2026-10-04), se § 3 regel 8.
Den är en egen arbetsyta med stationsregister och tidslinje, och den kund som
bara vill fakturera rätt har ingen nytta av någon av dess sidor.

Att den gick att lägga till utan att röra arkitekturen är kvittot på att
grinden sitter rätt: en nyckel i registret, ett värde i enumen, fyra tabeller
i `tenant.ts`, en artikel hos Stripe. `price-book.ts`, Stripe-uppslagen,
prenumerationssidan, plattformspanelen och menyfiltreringen var redan
generiska över `MODULE_KEYS` och behövde inte en rad. **Säljsidan var det enda
som inte var det**, och är nu en slinga över modulerna i stället för en
handskriven rad om löneunderlaget.

`src/lib/modules.ts` är registret. **Filen har inga importer och ska inte få
några**: både fakturasidan och lönesidan läser den, och drog den in något
från endera hållet skulle `tests/payroll-boundary.test.ts` falla.

**Raden ÄR tillståndet.** `company_modules` har en rad per påslagen modul, och
avstängning raderar den. Ingen boolean och inget `disabled_at` — ett läge som
går att uttrycka på två sätt hinner alltid sluta säga samma sak, samma skäl
som att orderns totala beräkning aldrig lagras (regel 6 ovan).

**Att stänga av rör ALDRIG kundens data.** Scheman, raster, frånvaro och
komprader ligger kvar orörda och står där igen om modulen slås på. Samma
princip som att stämplingen aldrig slutar fungera: en obetald faktura får
inte kosta någon registrerad tid, för den tiden går inte att rekonstruera.

**Grinden ligger i koden, inte i menyn**, och det är den enda punkten som
verkligen är säkerhet. Prenumerationslåset lärde oss varför: det låg som en
gren i panelens layout, och rutterna under `/api` renderas aldrig genom den.
Därför gäller regeln att **varje sida, server action och rutt som rör en
modul ska kalla `requireModule()` respektive `hasModule()`**. Menyn döljer
bara — sidan bakom svarar 404 oavsett vad menyn visar.

Bevisas av `tests/module-coverage.test.ts`. Den viktiga kontrollen där är
inte listan över filer utan den som **härleder** vilka filer som rör modulen,
ur deras importer och tabellnamn, och fäller en ny sida ingen kommit ihåg att
grinda.

Testet är **en tabell med en rad per modul** sedan 2026-10-04, inte en fil
skriven för löneunderlaget. Det fungerade så länge det fanns en modul, och
hade därefter betytt att den andra inte hade något skyddsnät alls — precis den
sortens tysta hål resten av filen finns för att stoppa. En egen kontroll fäller
dessutom en modul som lagts till i registret utan att få en rad i tabellen.

Undantag, uttryckligen: GDPR-anonymiseringen i
`installningar/actions.ts` raderar frånvaro, raster och komprader **även när
modulen är av**. Annars vore avstängning ett sätt att göra personuppgifter
oåtkomliga för rätten att bli glömd.

Två kopplingar kapas medvetet inte: `spans.ts` är inte lönespecifik
(veckovyn och översikten använder `mainMinutes()`), och `clock.ts` fortsätter
kalla `endOpenBreak()` vid varje instämpling — den är idempotent, och en kund
som stänger av modulen mitt på dagen ska inte lämna en rast öppen för alltid.

**En prenumeration har flera rader nu, och ordningen är inte given.**
Tidigare hade varje prenumeration exakt en rad, och koden läste
`items.data[0]` för att få antalet skärmar. Ligger löneunderlaget först
skulle antalet licenser sättas till 1 — tyst, utan felmeddelande. Rader slås
därför alltid upp på pris-id, via `priceRole()`, `screenItemOf()` och
`moduleItemsOf()` i `stripe.ts`. Bevakas av `tests/stripe-items.test.ts`.

**Har företaget en prenumeration är Stripes rader HELA sanningen** om vilka
tillval de har. `syncModulesFromSubscription()` lägger till det som finns där
och tar bort det som inte gör det, vid varje besked och vid varje visning av
prenumerationssidan. Regeln är avsiktligt total: plattformspanelen vägrar
redan ändra tillval för ett företag med prenumeration, så det finns ingen
modul vid sidan av fakturan att städa bort av misstag. En enklare regel med
färre lägen slår en klok regel med flera.

En avslutad prenumeration är ett eget fall: Stripe skickar med raderna även i
det beskedet, så där raderas modulerna uttryckligen.

**Beloppet för en ändring räknas av Stripe, aldrig av oss.** Kunden ser en
förhandsberäkning innan de bekräftar. Går den inte att hämta stoppas inte
köpet — då visas bara den löpande avgiften. Att vägra sälja för att en
förhandsvisning inte gick att hämta vore fel avvägning.

**Allt som ändrar vad kunden betalar sker i Tikkr, i två steg** (ändrat
2026-09-27). Både antal licenser och tillval: reglage eller fält, Stripes
egen beräkning, bekräfta.

Licensantalet ändrades tidigare på Stripes egen sida. Det gick inte att göra
likadant med tillvalen, och det är inte ett val vi gjorde: **Stripes
kundportal kan ändra antal och byta pris på en befintlig rad, men inte lägga
till en ny produktrad.** En Checkout-session skapar i stället en ny
prenumeration, alltså två parallella. Kunden mötte därför två olika sätt att
ändra samma faktura beroende på vad de ändrade.

Med licensändringen hemtagen försvann också portalkonfigurationen som måste
skrivas om för att modulernas produkter skulle släppas in — ungefär 200 rader
som fanns enbart för att Stripes sida skulle fungera.

**Kort, kvitton och uppsägning ligger kvar hos Stripe.** Det är sådant vi inte
ska bygga själva. Ändrar kunden ändå antalet den vägen följer vår siffra med:
webhooken skriver den, och `getBillingOverview` stämmer av vid varje visning
av prenumerationssidan.

**En ökning ska inte gå att missa.** Bekräftelserutan visar avgiften före och
efter, skillnaden, och vad nästa faktura landar på. En siffra som bara ändras
i ett fält är inget beslut kunden fattat.

Att lägga till en modul: en nyckel i registret, ett värde i enumen
`CompanyModuleKey`, en artikel hos Stripe. Ingenting annat i arkitekturen
behöver röras.

### 3.2 Underlagen på papper (beslutat 2026-09-29)

Kunden skriver ut. Det låter självklart, men systemet byggdes som om allt
skulle sparas som filer, och skillnaden är fyra steg varje gång: ladda ner,
leta rätt på filen, öppna, skriva ut, rensa mappen.

**Utskrift går direkt till skrivaren.** `PrintButton` laddar dokumentet i en
dold ram och ber webbläsaren skriva ut ramen. Exportrutten lämnar då ut det
för VISNING (`visa=1`) och inte som nedladdning — en fil som kommer som
`attachment` hamnar i nedladdningsmappen i stället för i skrivardialogen.
Reservvägen är en ny flik, eftersom en knapp som inte gör någonting alls är
det enda utfall som inte får inträffa.

**Båda dokumenten går att både skriva ut och ladda ner** (ändrat
2026-10-08). Knapparna hette "Skriv ut efterkalkyl", "Efterkalkyl" och
"Underlag", och det gick varken att se att de två sista var nedladdningar
eller att underlaget också gick att skriva ut. Nu står dokumentets namn som
etikett med verben under: Efterkalkyl → Skriv ut · Ladda ner, Underlag →
Skriv ut · Ladda ner. Skiljelinjen mellan grupperna står kvar, eftersom
efterkalkylen är intern och underlaget är kundens.

**Flera markerade ordrar ger EN FIL PER ORDER**, i ett zip-arkiv. Tidigare gavs
ett dokument med en sida per order, med skälet att tio filer blir tio bilagor
att hålla reda på. Det var fel håll: underlagen bifogas tio OLIKA fakturor
till tio olika kunder, så den som fakturerar fick klippa isär dokumentet varje
gång. Arkivet packas upp en gång. `src/lib/zip.ts` är egen kod och inget
beroende, se kommentaren där.

**Undantaget är utskrift.** Ska pappret till skrivaren är ett sammanhållet
dokument hela poängen, och då gäller en sida per order som förut.

**Efterkalkylen går att ta ut för flera ordrar**, inte bara en i taget. Den låg
bara i menyn på en enskild order, vilket betydde tjugo besök i tjugo menyer
för en vecka av färdiga jobb.

**Att ta ut en efterkalkyl frågar om ordern ska avslutas**, med en kryssruta i
samma meny. En efterkalkyl tas ut när jobbet är klart, och då är nästa
handling nästan alltid att stänga ordern. Frågan går genom samma åtgärd som
knappen längre ner i menyn och därmed genom samma mellansteg: står någon
instämplad ändras ingenting förrän administratören sett vilka.

**Tidrapport föregående vecka: en person per sida.** Knappen hette Förra veckan
per anställd till 2026-10-30. Utskriften delas ut till var och en, och flöt personerna ihop gick den inte att dela ut utan att någon fick
läsa någon annans rader. Därför finns heller ingen slutsumma sist — den skulle
hamna på den sista personens papper och påstå att raden ovanför gäller hen.
Periodens totaler står på förstasidan.

**Knappen är tillbaka, och hämtar nu TIDRAPPORTEN** (ändrat 2026-10-08).
Den togs bort dagen innan på kundens begäran, och kunden ändrade sig: utskriften
behövdes, men med summeringen per person — planerad tid, närvarotid och flex.

Den summeringen är löneunderlagets, och `report-pdf.ts` får aldrig läsa
löneunderlaget. Utskriften kan alltså inte vara stämplingslistan med en
summering påklistrad; den måste VARA tidrapporten. Rutten
`/api/admin/export/timesheet` tog redan hela personalen när ingen anställd
pekas ut, en per sida, så bytet var en adress och inte en ny PDF.

Konsekvensen är att knappen hör till lönemodulen. Den sitter på Tidrapport,
som redan är grindad, och inte på Rapporter. En kund utan löneunderlaget har
ingen summering att skriva ut.

**Löneunderlag föregående månad: samma papper med bara frånvaron** (tillagt
2026-10-13, kundens begäran, hette Förra månaden per anställd till
2026-10-30). Knappen bredvid veckans går till lönen. Raderna
visar frånvaron dag för dag, utan stämplingar och raster, och summan under
dem är frånvarons. Summeringen längst ner är densamma som i veckans. En månad
av stämplingar per person är flera sidor som lönen inte läser, och det lönen
behöver ur raderna är just frånvaron.

Det är samma rutt och samma PDF med `rader=franvaro`, inte ett eget
dokument. Två utskrifter av samma tidrapport som byggs var för sig hinner
alltid börja räkna olika.

**Pappret heter Löneunderlag** (ändrat 2026-10-30, kundens begäran): rubriken,
dokumenttiteln, foten och filnamnet. Veckans papper heter fortfarande
Tidrapport, och sidan och menyn likaså. Underskriftsraden står orörd, med
Tidrapport ok, eftersom den är kundens egen blankett.

**Löneunderlag vald period** (tillagt 2026-10-30, kundens fråga) tar perioden
ur Från och Till på sidan. Månadsknappen når bara föregående månad, och en
äldre månad gick inte att ta ut. Hela personalen kommer med även om en person
är vald, som på månadsknappen. ATF står med när perioden är en hel
kalendermånad.

**Hela personalen är de aktiva OCH den som har tid i perioden** (ändrat
2026-10-30). Det gäller båda utskrifterna, se `employeesForTimesheet` i
`payroll.ts`. Med en vald period saknades annars den som slutat i april på
underlaget för mars, utan att något på pappret sa det. En anonymiserad person
får en sida under sitt anonyma namn.

**En äldre månad räknas om, den är ingen kopia av det som skrevs ut då.**
Arbetstiderna har ingen historik, och en justering av flexsaldot ligger på det
ingående saldot. Planerad tid, flex och ATF följer alltså dagens värden. Det
står i hjälpen.

**Underlaget och efterkalkylen finns BARA som PDF** (ändrat 2026-10-01). Båda
fanns också som Excel-ark, och kunden använde dem inte: det ena bifogas en
faktura, det andra läses på ett bord, och ett kalkylark är varken det ena eller
det andra. Rapportexporten är kvar som Excel, eftersom den är till för att
räkna vidare i. `calc-excel.ts` är borttagen.

**Efterkalkylen visar ingen timkostnad** (ändrat 2026-10-01). Kolumnen kr/tim
och raden "person 350 + maskin 500" är borta; kvar står tid och kostnad per
rad, delsumma per arbetsmoment och totalen.

Det är ett avsteg från regel 4 ovan, som ville att beloppet skulle gå att bryta
ned. Skälet väger tyngre: pappret rör sig. En efterkalkyl skrivs ut, läggs på
ett bord och läses av fler än den som tog ut den, och **en anställd ska aldrig
se sin egen timpeng** — eller kunna räkna ut den ur en maskinkostnad bredvid.
Uppdelningen finns kvar i databasen och i panelen, för den som ska försvara ett
pris.

**Att ta ut en efterkalkyl ställer en fråga, inte en kryssruta** (ändrat
2026-10-01). När kalkylen är uttagen frågar systemet om ordern ska avslutas.
Det gäller en enskild order och flera markerade lika. En kryssruta kräver att
man bestämt sig innan man tryckt, och den som missade den fick aldrig veta att
valet fanns.

Flera ordrar avslutas i ett svep, men ordrar med PÅGÅENDE stämplingar hoppas
över och svaret säger hur många. Den enskilda ordern har ett mellansteg som
visar VILKA som står instämplade innan de stämplas ut; den listan går inte att
visa för tio ordrar på ett begripligt sätt, och att stämpla ut folk tyst i bulk
vore att göra precis det mellansteget finns för att förhindra.

**Stämplingar går att ta bort igen** (ändrat 2026-10-13, kundens begäran;
var borttaget 2026-09-29). Skälet att ta bort knappen var att en raderad post
lämnade ett hål ingen kunde förklara. Det föll med ändringsloggen
(2026-10-05): `deleteEntryManually` i `clock.ts` skriver hela posten som den
såg ut och vem som tog bort den, i samma transaktion som borttagningen. Bara
avslutade poster, av samma skäl som de är de enda som går att ändra: en
pågående stämpling tillhör någon som står vid en skärm. Ska en persons tid
bort helt finns fortfarande GDPR-raderingen i inställningarna.

**Improduktiv tid går att lägga in för hand** (ändrat 2026-10-13). Ny
stämpling lade bara in ordertid, med skälet att glömd improduktiv tid hellre
stämplas på skärmen. Med löneunderlaget är den saknade städtimmen någons
arbetstid, och utan vägen bokades den på en order, vilket gör ordern dyrare
än den var (§ 1).

### 3.3 Hjälpcentret (beslutat 2026-10-11, issue #8)

Ett publikt hjälpcenter på `tikkr.se/support`, med säljsidans meny, fot och
mörka band. Steg-för-steg-guider per område, sökning, vanliga frågor och
vägen till support. Nås från **frågetecknet i menyns fot** och från en
**Hjälp**-länk vid rubriken på sidorna den gäller. Båda öppnar en ny flik.

**Guiderna ligger i koden**, i `src/lib/help/guides.ts`, och inte i
databasen. En guide beskriver produkten och ska ändras i samma commit som
knappen den nämner. Låg texten i en tabell kunde guiden och knappen säga olika
saker utan att någon granskning såg det. Priset är att en textändring kräver
en driftsättning. Knappnamn skrivs exakt som på skärmen.

**En länk till en guide som inte finns ska inte gå att bygga.** `PageHeader`
och `CardHeader` tar `help="<guide>"`, typat som `GuideSlug`, och
`tests/help.test.ts` letar dessutom upp varje `/support/...` i källkoden. Det är
samma sorts skydd som `GuideSlug`, för det som skrivits som en vanlig sträng.

`HelpLink` importerar bara TYPEN, aldrig guiderna. Den dras in via
designsystemet, som även stämplingsskärmen använder, och all guidetext hade
annars följt med till varje skärm i verkstaden.

**Sökningen körs i webbläsaren** (`src/lib/help/search.ts`), utan beroende och
utan server. Å, ä och ö jämförs som a och o, eftersom en surfplatta utan
svenskt tangentbord annars aldrig hittar "stämpla". Varje sökord måste träffa
början av ett ord i guiden.

**Hjälpcentret hör till säljsidan, inte till portalen** (ändrat 2026-10-11).
Länkarna i panelen är relativa, `/support/<guide>`, och på portaladressen
skickar `middleware.ts` vidare till samma guide på säljsidan. Visades guiden
på portal.tikkr.se ledde Tikkr-märket i säljsidans meny till `/`, och därmed
tillbaka in i panelen i stället för till startsidan. En egen adress,
support.tikkr.se, byggdes och valdes bort samma dag: den krävde DNS, proxy
och en miljövariabel för något som säljsidan redan bär.

`src/lib/help/areas.ts` är listan över områden, och den är avsedd att bära
även formuläret för fel och förslag i steg 2 av issuen: ett meddelande märkt
"Planering" ska betyda samma sak i hjälpcentret och i plattformens inkorg.

Inga öppettider för support står utskrivna. Inga är bestämda.

**Fel, förslag och synpunkter skickas från panelen** (tillagt 2026-10-11,
steg 2 av issue #8, förenklat samma dag). En **pratbubbla i menyns fot**
öppnar en liten ruta, **Lämna feedback**: typ (Fel, Förslag, Synpunkt),
område och meddelande. Underrubriken säger att rutan är för förslag och
mindre fel, att inget svar skickas, och länkar till hjälpcentret för den som
behöver hjälp.
Bara inloggade, och företaget och avsändaren tas ur sessionen, aldrig ur
formuläret. Sidan man stod på följer med, förväljer området ur `areaForPath`
i `help/areas.ts` och sparas med meddelandet.

**Kunden får ingen återkoppling** (ändrat 2026-10-11, produktägarens val).
Första versionen var en egen sida, Support, med arbetsytans skickade
meddelanden, våra svar, status och en prick i menyn. Den blev ett
supportärende i stället för en brevlåda, och togs bort samma dag. Ingen
mejlavisering åt något håll.

**Nyheter, Butik, Hjälp och pratbubblan är ikoner i menyns fot**, bredvid
Tikkr-märket, och inte rader i menyn. De handlar om Tikkr och inte om
arbetsytan, och den nedre delen av menyn ska bara bära kontot, Inställningar
och Logga ut. Versionen står inte i foten, utan på sidan Nyheter.

**Vi hanterar dem i plattformens Inkorg** (`/plattform/inkorg`), med en
siffra för det som inte är klarmarkerat. Att klarmarkera kräver en
anteckning om vad som gjordes, och meddelandet ligger sedan i Arkiv.
`done_at` ÄR tillståndet, utan en statuskolumn bredvid, samma skäl som
`company_modules` i § 3.1. Klarmarkeringen skrivs i plattformens
händelselogg.

Tabellen är kundens data och står i `TENANT_SCOPED_MODELS`. Kunden skriver
genom sin egen klient; inkorgen läser och arkiverar via `unsafeGlobalPrisma`,
som för `CompanyPrice`. Supportläget kan inte skicka, se § 4 punkt 5. Tas en
användare bort står meddelandet kvar med den kopierade adressen. All logik
ligger i `src/lib/feedback.ts`, och `tests/feedback.test.ts` fäller den.

### 3.4 Butiken (beslutat 2026-10-20, flyttad 2026-10-21)

Vi säljer hårdvara till kunderna, med **stämplingsskärmen** som första
produkt: pekskärm 23,6 tum i pulverlackerat stativ, uppsatt och provad före
leverans. Hårdvaran och dess öppna punkter står i `docs/kioskskarm.md`.

**Butiken är en egen sida, `/admin/butik`, och nås från en ikon i menyns
fot** bredvid Nyheter och Hjälp (ändrat 2026-10-21, produktägarens val). Den
låg en dag under Inställningar, Tillbehör, och formuläret var det första man
såg. Ett köp är inte en inställning, och en utbildning är inte ett tillbehör.
Foten bär det som handlar om Tikkr och inte om arbetsytan (§ 3.3), och en
butik är just det. En egen rad i vänstermenyn valdes bort: menyn bär det man
öppnar varje dag eller vecka. Den gamla adressen skickas vidare till
Beställningar i `next.config.ts`, eftersom de första mejlen länkade dit.

- **Butik, varukorg, kassa.** Produkterna visas som kort, grupperade som
  varor och tjänster, med Lägg till. Varukorgen står i adressen
  (`?stamplingsskarm=2`, se `src/lib/shop/cart.ts`) och behöver ingen
  lagring. Kassan är en egen sida med sammanställningen och uppgifterna.
  Beställningarna är en egen flik.
- **Ingångar där behovet uppstår:** en länk på Stämplingsskärmar och i Kom
  igång, båda till kassan med en skärm i korgen. Säljsidans Beställ leder
  dit genom inloggningen.
- **Vara eller tjänst** (`kind` på produkten). Kassan frågar efter
  leveransadress bara när något ska skickas. Med bara tjänster är adressen
  fakturaadressen, och märkning och frakt finns inte. Ingen tjänst säljs än;
  tjänsternas egna lägen (bokad, genomförd) byggs när den första finns.

**I allt kunden ser heter det BESTÄLLNING, aldrig order.** En order är
kundens arbetsorder, det allt annat i Tikkr hänger på. I koden heter det
`Shop…`.

- **Produkterna läggs upp under Produkter i plattformspanelen** (ändrat
  2026-10-21, produktägarens val; låg som en katalog i koden till dess).
  De ligger i `shop_products` och `shop_product_images`: namn, texter,
  typ, pris, moms, högsta antal, leveranstext, garanti, fördelar, vad som
  ingår, vad kunden behöver, specifikationer och bilder. En ny produkt är
  dold tills den kryssas i för **butiken** och/eller **säljsidan**.
  Skälet är att butiken ska kunna bära utbildningar och annat utan att varje
  produkt kräver en driftsättning. Priset är att texterna inte längre
  granskas i en PR innan de syns, och att ingen test längre stoppar
  tillverkarens namn; det valde produktägaren bort.
- **Allt läser produkterna genom `products.ts`**: säljsidan, butiken,
  kassan, servern som räknar beställningen och mejlen. Säljsidan och kassan
  kan därför aldrig visa olika pris. Priserna är exklusive moms, och momsen
  räknas bara i `pricing.ts`, per rad som fakturan i Fortnox. Säljsidans
  priser står annars bara i prisavsnittet; skärmens engångspris står på
  produktsidan, inte på startsidan, och startsidans avsnitt om skärmen
  visas bara när produkten `stamplingsskarm` syns på säljsidan.
- **Nyckeln sätts en gång.** Den bildas ur adressen när produkten skapas
  (`stamplingsskarm` → `STAMPLINGSSKARM`) och ändras aldrig, eftersom
  beställningsraderna pekar på den. Adressen får ändras.
- **En beställd produkt raderas aldrig, den döljs.** En som aldrig
  beställts går att ta bort, samma avvägning som för improduktiva moment.
- **Bilderna laddas upp i plattformen** och ligger i databasen, som
  kundernas logotyper, så att de följer med i backupen. Uppladdningen går
  genom en egen rutt, `/api/plattform/produkter/bild`, eftersom
  serveråtgärder tar emot högst 1 MB; gränsen där är 5 MB, och typen prövas
  på filens innehåll. `/api/butik/bild/<id>` lämnar ut bilderna, och bara
  för produkter som syns. Stämplingsskärmens illustrationer ligger kvar som
  filer under `public/` och pekas ut med `static_path`.
- `shop_prices` läses inte längre men ligger kvar (§ 0 punkt 7), och tas
  bort i en senare release. Migrationen tog priset därifrån.
- **Bara ägaren beställer**, av samma skäl som prenumerationen (§ 1,
  Adminflöde): en beställning ändrar vad kunden betalar. Alla
  administratörer ser butiken och beställningarna. Leverans- och
  fakturauppgifterna står under Inställningar, Företag, och får ändras av
  varje administratör. **E-post för faktura står alltid i formuläret**,
  valfri och skild från den separata fakturaadressen (ändrat 2026-10-21):
  många kunder har en egen adress för fakturor men ingen för post. Systemet
  skickar ingenting dit; den står på beställningen för fakturan i Fortnox.
- **Säljsidans Beställ går genom inloggningen** med `?till=/admin/...`
  (`safeAdminNext` i `login-ticket.ts`) till kassan, och den som redan är
  inloggad går rakt igenom.
- **En beställning är en ögonblicksbild**: köparens uppgifter, adresserna och
  varje rads pris kopieras dit. En ändring i företagets uppgifter eller i
  priset rör aldrig en lagd beställning. Beloppen lagras, till skillnad från
  orderns beräknade tid, eftersom de är vad fakturan skrivs på; de räknas
  bara ur raderna och frakten.
- **Samma formulär två gånger ger en beställning.** Formuläret bär en nyckel
  som är unik per företag i databasen.
- **Betalningen sker utanför systemet** (produktägarens val). Fakturan
  skrivs i Fortnox **vid leverans**, och betalstatusen sätts för hand i
  plattformen: Ej fakturerad, Fakturerad, Betald, Krediterad. Fakturerad
  kräver fakturanummer och datum, så att systemet aldrig påstår att en
  faktura finns. Stripe används inte för tillbehör.
- **Frakten tillkommer** och varierar. Den står som "Tillkommer" tills vi
  satt den på beställningen, och totalen räknas då om. Den går inte att
  ändra efter fakturering.
- **Orderstatus och betalstatus är skilda.** Mottagen, Bekräftad, Under
  tillverkning, Klar för leverans, Skickad, Levererad, Avbruten och Kräver
  åtgärd. Framåt, aldrig bakåt; ett fel går via Kräver åtgärd. En skickad
  beställning avbryts inte. Systemet sätter aldrig Skickad eller Levererad
  självt. Varje byte prövas mot läget det utgår från. Reglerna i
  `status.ts`.
- **Kunden får mejl** vid Mottagen, Bekräftad, Under tillverkning, Skickad,
  Avbruten och Kräver åtgärd, varje besked en gång per beställning utom
  Kräver åtgärd. Mejlet skickas efter att ändringen sparats; går det inte
  iväg står felet i historiken och kan skickas igen. Se `notify.ts`.
- **Interna anteckningar** ligger i `shop_order_notes`, utan relation till
  kunddata, av samma skäl som `PlatformNote`. Historiken kunden ser bär
  aldrig vem hos oss som ändrade något.
- **Garantin är tre år på skärm och stativ**, från leveransen (produktägarens
  val). Tillverkarens garanti räknas från deras faktura till oss, så glappet
  bär vi; köp därför in när kunden beställt.
- **Bilderna är illustrationer** tills det finns foton, och märks så. Byt
  filerna i `public/tillbehor/<produkt>/` och sätt `illustration: false`.
- **Bara leverans inom Sverige**, moms 25 %. En kund i ett annat EU-land
  kräver omvänd skattskyldighet och är inte byggt.
- Ett företag med en beställning som inte är levererad eller avbruten går
  inte att radera.

## 4. Kritiska säkerhetskrav

1. **Multi-tenant-isolering** — all databasåtkomst via det gemensamma
   filtreringslagret. Automatiska tester ska bevisa att kund A aldrig kan se
   kund B:s data.
2. **Kiosk-token, inte PIN** — varje fysisk skärm får en lång, slumpad,
   återkallningsbar, company-scopad token vid uppsättning. Utan giltig token
   accepteras ingen stämpling.

   **Kopplingskoden bromsas bara per IP-adress** (beslutat 2026-10-18,
   produktägarens val, säkerhetsgranskningen). Fem fel per adress och kvart.
   En gemensam spärr på hundra fel för hela installationen togs bort, eftersom
   vem som helst kunde stänga skärmkopplingen för alla kunder med ett skript
   mot `/kiosk`. Koden är kvar på sex siffror och gäller i fem minuter, och
   priset är uttryckligt: den som gissar från många adresser får fem försök
   per adress.

   **En lyckad koppling nollställer inte räknaren** (ändrat 2026-10-30,
   säkerhetsgranskningen). Vem som helst kan skapa en arbetsyta och få egna
   giltiga koder, och varje sådan kod gav fem nya gissningar mot andra kunders.
   Räkningen löper ut en kvart efter senaste felet. Priset är att den som
   sätter upp flera skärmar och skriver fel fem gånger får vänta, och felfria
   kopplingar räknas inte alls.

   **Bromsarna ligger i databasen** (ändrat 2026-10-18), i `login_throttles`,
   och inte i minnet. En räknare i minnet nollades vid varje driftsättning.
   Nyckeln, alltså e-postadressen eller IP-adressen, sparas som SHA-256, och
   rader som löpt ut raderas löpande. Koden i steg två räknas nu också per IP,
   både i adminpanelen och i plattformspanelen. Se `login-throttle.ts`.
3. **Fullständig audit-logg** — varje stämpling sparar tidsstämpel, kiosk-ID och
   IP, så admin i efterhand kan se och manuellt korrigera en felaktig stämpling.

   **Ändringsloggen** (tillagt 2026-10-05). Varje ändring av något som är
   underlag för faktura eller lön skrivs i `audit_events` med värdet före och
   efter och vem som gjorde den: manuella stämplingar, granskning, automatisk
   utstämpling, frånvaro, komp, saldon, timkostnad, påslag och roller. Bara
   tillägg, i samma transaktion som ändringen. Loggen bär aldrig namn, nummer
   eller foto, och anonymiseringen tar bort raderna om personens frånvaro och
   komp. Historik går inte att skriva i efterhand, och därför fanns den före
   första kunden. Se `src/lib/audit.ts`.

   **Länkar och IP-adresser kommer aldrig ur anropet** (tillagt 2026-10-05).
   Mejlade länkar byggs ur `APP_URL`, eftersom `X-Forwarded-Host` skrivs av
   klienten och en återställningslänk annars kunde peka till en angripare.
   Klientens IP är SISTA värdet i `X-Forwarded-For`, det vår egen proxy satte.
   Se `app-url.ts` och `client-ip.ts`.

   **Sessionen gäller sju dagar** (ändrat 2026-10-06, var trettio dagar). Ett
   lösenordsbyte eller "Logga ut på alla enheter" under Ditt konto gör äldre
   sessioner ogiltiga.

   **De sju dagarna räknas från INLOGGNINGEN, och återkallelsen prövas mot
   samma tid** (ändrat 2026-10-18, säkerhetsgranskningen). Prövningen låg mot
   `iat`, som Auth.js sätter om varje gång `/api/auth/session` signerar om
   sessionen. Den som hade en stulen cookie behövde därför bara göra ett anrop
   efter utloggningen för att vara inne igen, och en session som användes
   minst en gång i veckan gick aldrig ut. Nu bär token `authTime`, som sätts
   bara vid inloggningen, och `currentAdmin()` nekar en session utan den. Se
   `auth-callbacks.ts`. Konsekvensen är att alla loggar in en gång till efter
   versionen, och därefter var sjunde dag oavsett hur ofta panelen används. **E-postadressen bekräftas** med en länk vid
   registreringen; det spärrar ingenting, men panelen visar en remsa tills
   det är gjort, och en obekräftad adress går att rätta själv. Registreringen
   tar högst fem nya arbetsytor per kvart och IP-adress. Se `account.ts` och
   `email-verification.ts`.
   **DET EGNA KONTOT LIGGER FÖR SIG** (ändrat 2026-10-08). Namn,
   telefonnummer, e-postadress och lösenord ligger på `/admin/konto`, som nås
   från adressen längst ner i menyn. De låg under Inställningar, Användare,
   ovanför inbjudningarna och listan över vilka som har åtkomst.

   Skälet är att det är två olika frågor. "Mina uppgifter" hör till den som är
   inloggad; "vilka andra kommer in" är en inställning för arbetsytan. Den som
   skulle bjuda in en kollega möttes först av sitt eget lösenordsfält, och den
   som sökte sitt lösenord letade under en rubrik om användare.

   Sidan vaktas som alla andra: varje åtgärd tar sitt id ur sessionen och
   aldrig ur formuläret, så ingen administratör kan ändra någon annans
   uppgifter den vägen. Nollställning av tvåsteg står kvar under Användare,
   eftersom den gäller någon annan.

   **FÖRNAMN OCH EFTERNAMN I VARSITT FÄLT** (ändrat 2026-10-11, issue #16).
   Var ett enda `name`, och kunderna skrev då förnamnet och ingenting mer. En
   arbetsyta med två administratörer som båda heter Anna går inte att skilja
   åt, varken på kundkortet i plattformspanelen eller av den som ringer
   supporten.

   Båda krävs av den som registrerar en arbetsyta, båda är frivilliga för den
   som bjuds in. Visningsnamnet slås ihop av `fullName()` i
   `src/lib/person-name.ts` och **lagras aldrig** — ett sammanslaget fält
   bredvid de två hinner alltid sluta säga samma sak, samma skäl som att
   orderns beräknade tid aldrig lagras (§ 3 regel 6).

   `name` ligger kvar i databasen som en **död kolumn**, oläst och oskriven.
   Migrationen delade de befintliga namnen vid sista mellanslaget och lämnade
   `name` orörd, så att den föregående versionen av appen fungerar mot den nya
   databasen (§ 0 punkt 7). Kolumnen tas bort i en senare release, som fälten
   för ingående komptid.

   **REGISTRERINGEN GÅR I TRE STEG** (ändrat 2026-10-11, issue #16): personen,
   lösenordet, arbetsytan, med en stegmätare överst. Sju fält under varandra
   betydde att den som skapade en arbetsyta på en telefon mötte ett formulär
   som fortsatte nedanför skärmkanten.

   **Ordningen är vald och inte given.** Lösenordet låg först på samma steg som
   företagets namn, och "Företagets namn" följt av "Lösenord" lästes som ett
   lösenord FÖR FÖRETAGET. Allt som är personen står därför före arbetsytan.
   Att företagsnamnet blev ett eget steg med ett enda fält är inte en förlust:
   det är sista steget, knappen står direkt under, och "vad heter företaget" är
   en fråga man svarar på utan att läsa.

   **Det är ETT formulär**, och alla stegens fält ligger kvar i DOM:en hela
   tiden. Tre formulär efter varandra hade krävt att de tidigare stegen
   lagrades någonstans mellan dem, och det någonstans är antingen en server som
   får halva uppgifter eller en lagring i webbläsaren med personuppgifter i.

   Ett fel vet vilket steg det hör till och skickar formuläret dit, eftersom
   servern vet vilket fält som brast och webbläsaren inte gör det. Fälten får
   sina värden tillbaka, utom lösenorden: React nollställer ett formulär som
   skickats med `action`, och utan ekot vore ett felstavat telefonnummer
   detsamma som att skriva om allting.

   Utan JavaScript finns inga steg, och ingenting går förlorat: en stil i
   `noscript` visar alla stegen och gömmer mätaren. Kvar står formuläret som
   fanns före ändringen.

4. **Anomali-varningar** (senare fas, ej MVP-kritiskt) — flagga t.ex. ett jobb
   som pågått orimligt länge, eller en person med fler parallella jobb än hen
   rimligen hinner sköta. Däremot INTE "instämplad på två ställen samtidigt" —
   det är numera ett giltigt läge, se regel 2 i § 3.
5. **Supportläge är LÄSNING, och lämnar spår** (beslutat 2026-09-25).
   Plattformspanelen har en knapp som öppnar en kunds adminpanel utan kundens
   lösenord. Tre saker gör det försvarbart, och alla tre ska finnas kvar:

   - **Egen cookie, eget namn.** `tikkr_support` bär plattformskontots adress,
     aldrig ett lånat `adminUser`-konto. Annars skulle kundens egen logg påstå
     att *de* gjorde något. Trettio minuters livslängd.
   - **Läsläget vaktas i koden, inte i gränssnittet.** `forCompany(..., {
     readOnly: true })` avvisar varje skrivande operation. Men det räcker inte
     ensamt: `clock.ts`, `admin-users.ts` och `quick-order.ts` bygger egna
     klienter ur ett `companyId`, och `Company` nås via `unsafeGlobalPrisma`.
     Därför gäller regeln att **varje serveråtgärd i panelen som kallar
     `requireAdmin()` också ska kalla `assertWritable(session)`**. Bevisas av
     `tests/support-coverage.test.ts`.
   - **Varje besök skrivs ner** i `support_visits` innan cookien sätts, och
     visas på kundens sida i plattformspanelen.
   - **Behörigheten prövas vid varje anrop** (tillagt 2026-10-18). En adress
     som tagits bort ur `PLATFORM_ADMIN_EMAILS` förlorar supportläget direkt,
     inte när cookien går ut.

   Supportläget släpps igenom prenumerationslåset — en obetald faktura är
   oftast precis varför kunden ringer.

   **Tvåstegsinloggning är obligatorisk för alla** (beslutat 2026-10-06):
   kundernas ägare och administratörer och plattformspanelen, med samma
   flöde. Steg ett är lösenordet, som bara lämnar en signerad lapp i tio
   minuter (`login-ticket.ts`). Steg två visar en QR-kod första gången och
   frågar sedan efter koden (TOTP, `totp.ts`, `two-step.ts`). Sessionen
   skapas först när koden godkänts, och inbjudan och återställning går samma
   väg. `currentAdmin()` släpper inte in ett konto utan bekräftad app.
   Nycklarna lagras krypterade med `AUTH_SECRET`.

   **REGISTRERINGEN ÄR UNDANTAGET, PÅ EN ENDA SESSION** (ändrat 2026-10-11,
   produktägarens beslut). Den som skapar en arbetsyta mötte en QR-kod innan
   hen sett en enda sida av produkten, och ett krav man inte förstår skälet
   till är ett krav man avbryter på.

   Nu skapas sessionen av registreringen själv. Beviset är lappen: signerad,
   tio minuter, satt i samma webbläsare i samma begäran, och märkt `fresh`.
   `auth.ts` tar emot den under sättet `signup` och märker sessionen
   `mfaDeferred`; `currentAdmin()` släpper in ett konto utan app **bara** när
   det märket finns. Märket går inte att be om och följer inte med vidare:
   nästa inloggning utfärdar en ny session, och den går genom inloggningssidan,
   som möter ett konto utan app med QR-koden. Tvånget vid nästa inloggning
   krävde därför ingen ny kod.

   **I stället spärrar E-POSTADRESSEN.** Den nyregistrerade kommer inte in i
   panelen förrän länken i välkomstmejlet använts, och skickas så länge till
   `/admin/bekrafta-adressen`. Med tvåsteget flyttat är adressen det enda som
   binder arbetsytan till en människa vi kan nå, och ett stavfel där upptäcks
   annars den dag lösenordet ska återställas. Sidan ligger utanför `(panel)`,
   eftersom en spärrsida inuti den layout som skickar dit hade skickat vidare
   till sig själv, och den bär en väg att **rätta adressen** — utan den vore en
   felskriven adress detsamma som en arbetsyta ingen kommer in i.

   Spärren är ett flödessteg och inte en säkerhetsgräns: arbetsytan är
   personens egen. Därför räcker kontrollen i layouten, till skillnad från
   modulgrinden i § 3.1, som måste ligga i varje rutt.

   **Panelen tjatar till dess appen är kopplad.** En remsa högst upp, av samma
   slag som den om e-postadressen, med en knapp som leder till Ditt konto med
   rutan öppen. Uppsättningen bor i `TwoStepEnrollment`, som inloggningen och
   panelen delar: instruktionen är det som gör uppsättningen möjlig för den som
   aldrig gjort den förut, och två texter som glider isär hade låst ute folk.

   Priset är uttryckligt: ett stulet lösenord räcker aldrig för att komma in,
   men den FÖRSTA webbläsarens cookie räcker i upp till sju dagar för ett konto
   som inte hunnit koppla appen. **Inbjudna administratörer omfattas inte** —
   de tvingas direkt, som förut.

   **Två lättnader för kunderna, ingen för plattformen** (beslutat
   2026-10-07, eftersom pilotkunden tyckte koden var jobbig). Appen sätts
   alltid upp först. Därefter finns **Inloggningsalternativ** under
   kodfältet, som Microsofts, där en kod via e-post kan väljas — bara med
   bekräftad adress och aldrig direkt efter en återställning via mejl, annars
   räckte en kapad inkorg för både lösenord och kod. Och rutan **Kom ihåg den
   här datorn**, som hoppar över koden i 30 dagar med en signerad cookie
   (`trusted-device.ts`). Ingen tabell: lösenordsbyte, "Logga ut på alla
   enheter" och nollställning flyttar redan de tidpunkter cookien prövas
   mot. Plattformspanelen ser alla kunder och kräver appen varje gång.

   Nollställning sker åt ett håll i taget: ägaren nollställer
   administratörer i sin arbetsyta (`resetTwoStepByOwner`), och vi
   nollställer ägare från plattformspanelen, efter att ha kontrollerat vem
   som ringer. En ägare kan inte nollställa en annan ägare — då kunde den som
   kommit åt ett ägarkonto ta över de andra också. Båda loggas i kundens
   ändringslogg, plattformens dessutom hos oss. Plattformens nollställs med `scripts/platform-user.sh
   <adress> --kod`. En spärr på IP-adress i Caddy övervägdes och valdes
   bort: den krävde en fast adress hos den som administrerar.

   Kvarstående glapp, uttryckligen: `$queryRaw`/`$executeRaw` går inte att
   blockera i en Prisma-extension. Ingen adminåtgärd använder rå SQL.

   **Utanför koden:** även läsning av en kunds anställda är behandling av
   personuppgifter. Integritetspolicyn och PUB-avtalet ska nämna att support
   kan se data.
6. **Fysisk säkerhet är en förutsättning** — modellen bygger på att skärmen
   sitter på arbetsplatsen, precis som en fysisk stämpelklocka. Var transparent
   om detta mot kunden.
7. **HTTPS + kort request-timeout** — stämpling ska kännas omedelbar men gå
   krypterat.

   **Content-Security-Policy på grundnivå** (beslutat 2026-10-18,
   produktägarens val, säkerhetsgranskningen), i `next.config.ts`. Allt från
   egen adress, inga plugins, `base-uri` och `frame-ancestors` låsta, och
   formulär bara hit och till Stripes kassa och kundportal. Inline-skript
   tillåts, eftersom en nonce kräver att varje sida renderas vid varje anrop,
   även säljsidan. Policyn sätts inte på `/api`, där ett PDF-svar annars kan
   sluta visas i webbläsarens egen PDF-visare. Bevisas av
   `tests/security-headers.test.ts`. Versionen i `/api/health` står kvar, se
   § 5.
8. **GDPR** — adminpanelen ska stödja export och radering av en anställds data
   (rätt att bli glömd). PUB-avtal hanteras utanför koden, men bygg
   funktionaliteten.
9. **Frånvaro är känsliga personuppgifter** (tillagt 2026-09-26). Att någon är
   sjuk eller vabbar säger något om hälsa och familj. Därför:
   - Registreras BARA i adminpanelen, aldrig på stämplingsskärmen. En skärm i
     verkstaden är fel plats att uppge varför man är borta.
   - Varje post bär `created_by_email`, så att den går att spåra till en
     administratör.
   - Tidrapporten är ett internt dokument och får aldrig skickas till en kund.
     PDF:en säger det i foten.
   - Anonymisering enligt punkt 8 ska ta med frånvaro, raster och komprader.

## 5. Drift

Alla kunder delar samma server, och en trasig driftsättning slår mot alla på
en gång. Därför (beslutat 2026-10-10):

```
gren → PR → CI → dev → labbet (release.sh dev) → PR dev → prod → tagg vX.Y.Z → produktionen (release.sh vX.Y.Z)
```

**`dev` och `prod`** (beslutat 2026-10-11, `prod` hette `main` till dess).
`dev` är det labbet kör, och dit går varje PR. `prod` är det som släpps, och
får nya funktioner bara genom att `dev` slås ihop i den — det är det som gör
en version. Skälet är att `main` blandade två saker: det som provades och det
som var redo att släppas.

`dev` går till `prod` med en vanlig sammanslagning, aldrig squash, och `prod`
får inga egna commits utom en akut rättelse, som sedan slås ihop tillbaka i
`dev`. Då har `prod` exakt det innehåll labbet provat, och taggen sätts utan
en ny omgång i labbet.

- **CI** (`.github/workflows/ci.yml`) kör typkontroll, alla tester mot en egen
  Postgres, ett bygge av Docker-imagen och en kontroll av compose-filerna på
  varje PR och push till `dev` och `prod`. Den driftsätter ingenting.
- **Säkerhetskontrollerna** (`.github/workflows/security.yml`, infört
  2026-10-18) körs på samma händelser och dessutom varje måndag:
  `npm audit` (produktionens beroenden fäller vid hög, alla vid kritisk),
  gitleaks över hela historiken (repot är publikt), semgrep (fäller vid
  ERROR) och trivy mot imagen (fäller vid kritisk med rättelse). Verktygen
  är låsta på versioner som är minst två veckor gamla. Dependabot föreslår
  uppdateringar som PR:er mot `dev` (`.github/dependabot.yml`). Inget slås
  ihop av sig självt.
- **ZAP mot labbet** (`zap-baseline.yml`) startas bara för hand, efter en
  driftsättning i labbet, och vägrar en annan adress än `test.tikkr.se`.
- **Labbet är staging.** Ingen tredje miljö, se § 9.
- **Produktionen kör bara taggar**, och taggen sätts på `prod` när labbet kört
  samma innehåll på `dev`. Driftsättningen är ett kommando som användaren själv kör på
  servern; det är godkännandet. Ingen automatisk driftsättning, och inga
  SSH-nycklar hos GitHub.
- **Imagen bär versionen** (`tikkr-app:v1.2.0`), som visas i `/api/health`.
  Den förra ligger kvar, så att backa koden är att starta den igen.
- **Databasen backas inte med koden.** Migrationer lägger till och tar inte
  bort, så att den förra versionen fungerar mot den nya databasen.

Rutinen står i `docs/release.md`, servern i `docs/drift.md` punkt 8. Bygget
sker på servern; appen startar om som en enda container, vilket är ett avbrott
på några sekunder som skärmarnas offline-kö täcker.

**Nyheterna följer med koden** (beslutat 2026-10-10, issue #6). Under
Nyheter i panelen står vad som ändrats i varje version, och texten ligger i
`src/lib/release-notes.ts`, inte i databasen. Den granskas därmed som koden,
och syns när versionen installeras utan att någon trycker på något.
`news.ts` gömmer dessutom poster för versioner som är nyare än den som kör,
eftersom en rättelse kan taggas på en `prod` där nästa versions text redan
ligger. Punkter som bara rör ett tillval visas bara för kunder som har det.

Pricken vid Nyheter, i hörnet på ikonen i menyns fot, är per
administratör: `admin_users.news_seen_version` håller den senaste versionen
personen sett, och sidan skriver den när den öppnas. Den skrivs bara framåt, så att en backad version inte tänder pricken
igen. Versionen som kör står på sidan Nyheter, och inte i menyn (ändrat
2026-10-11).

Produktionsservern kör Caddy framför appen (`deploy/Caddyfile`,
`docker-compose.prod.yml`), och dess `.env` sätter `COMPOSE_FILE` så att
varje `docker compose` tar med båda filerna.

Måste finnas stöd för:

- **Backuper** — säkerhetskopia av databasen tre gånger per dygn och före
  varje driftsättning, krypterad till **separat plats, inte samma server**
  (Glesys Object Storage). Kritiskt: det är kundernas tidsdata.
- **Säkerhetsuppdateringar** — OS och Docker-images uppdateras regelbundet
  (`unattended-upgrades`).
- **Uptime-övervakning** — enkel gratis monitor (t.ex. UptimeRobot) pingar tjänsten.

Kostnadsbild: VPS ca 150–350 kr/mån hos svensk leverantör, Postgres 0 kr,
Caddy 0 kr, Stripe 0 kr fast (bara procent per transaktion), domän ca
100–150 kr/år.

## 6. Faser

Originalplanen från 2026-08-10, kvar som historik. Fas 0–3 är byggda, delvis
på andra sätt än här (ingen auto-deploy, två containrar och inte tre). Läget
står i § 5 och § 9.

| Fas | Vecka | Innehåll | Resultat |
|---|---|---|---|
| **0 — Grundstruktur** | 1 | VPS + Docker, Next.js-projekt containerisat, Postgres + Prisma-migration, Caddy/HTTPS, multi-tenant-lagret, GitHub Actions (bygg → staging → SSH-deploy), backup-skript + uptime-monitor, `CLAUDE.md` + README | Tomt skal, tre containrar, driftsatt med auto-deploy, offsite-backup, övervakning |
| **1 — Kiosk** | 2–3 | Device-token-länk (engångssetup), namnrutnät med stora touchknappar, ett tryck → in/ut → order → moment, auto-utstämpling per moment, offline-kö, dokumentera kiosk-läge (Chrome Kiosk / Android) | Fungerande kioskskärm för en testkund |
| **2 — Adminpanel** | 4–5 | Admin-inloggning, CRUD anställda/ordrar/moment, rapportvy (filter order/person/datum, totaltid), Excel-export (ev. PDF) | Admin sköter verksamheten själv |
| **3 — Multi-tenant & onboarding** | 6 | Signup-flöde, onboarding-wizard, Stripe-prenumeration krävs för åtkomst | Ny kund registrerar sig utan användarens inblandning |
| **4 — Polish & lansering** | 7–8 | Designgenomgång, prestandatest (optimistisk UI), supportsida/dokumentation | Lansering |

Total uppskattning: ca 8 veckor kontinuerligt arbete.

## 7. Så jobbar vi — regler för Claude

Användaren kan **inte koda särskilt mycket själv**. Claude driver det tekniska.

1. **En fas i taget.** Visa filstruktur och plan innan kod skrivs i en ny fas —
   och vänta på godkännande.
2. **Testbart efter varje fas.** Användaren ska kunna testa i webbläsaren (gärna
   på riktig touchskärm) innan nästa fas.
3. **Automatiska tester** för kritisk logik — särskilt automatisk utstämpling,
   offline-synk och multi-tenant-isolering.
4. **Git från dag 1** med tydliga commits, så användaren alltid kan backa.
5. **Förklara tekniska val i vanligt språk** när de görs. **Fråga om något är
   oklart innan du antar.**
6. **Skriv på svenska** i UI och i förklaringar till användaren. Kod, variabel-
   och funktionsnamn på engelska.

### 7.1 Språket i gränssnittet (bestämt 2026-09-26)

Gäller ALL text kunden och kundens kund ser: sidor, knappar, rutor, tabeller,
felmeddelanden, PDF och Excel. Inte kodkommentarer — de är för utvecklaren och
får gärna vara utförliga.

**`TONE-OF-VOICE.md` LÄSES INNAN NY TEXT SKRIVS** (infört 2026-10-04). Reglerna
nedan är beslutet; den filen är den praktiska versionen av det — ordlistan som
avgör att en sak heter samma sak överallt, mönstren för knappar, kvittenser,
tomma tillstånd och fel, och orden som aldrig skrivs. Den lades till eftersom
reglerna nedan är principer, och en princip utan ordlista räcker inte: samma
sak hade redan börjat heta två saker på två sidor. Ändras ett beslut ändras det
HÄR först, och filen följer efter.

**Kort och sakligt. Tikkr är ett verktyg, inte en handledare.**

1. **Skriv ingen beskrivning som inte behöver finnas.** Standardläget är
   INGEN text. En beskrivning skrivs bara när den hindrar ett konkret fel
   eller säger något som inte går att se på skärmen. Ett filter, en kolumn
   eller en knapp med ett begripligt namn förklaras aldrig.

2. **Aldrig beskriva det som redan syns.** "Aktiva först" ovanför en lista
   där aktiva står först, "senaste först", "mest först" — bort. Läsaren ser
   det.

3. **Aldrig motivera systemets val för användaren.** "Det är dem man har en
   fråga om", "Håll listan kort", "Fem till tio moment ger överskådliga val"
   — bort. Skälen hör hemma i den här filen och i kodkommentarer, inte i
   gränssnittet.

4. **Inget prat.** Inga tilltal i stil med "så går de att välja när…", inga
   tankstreck som lägger till en eftertanke, ingen ton av att förklara för
   någon som inte förstår sitt eget yrke.

5. **Rubriker är substantiv.** "Ordrar", inte "Här är dina ordrar".
   Knappar är verb i imperativ: "Lägg till", "Spara", "Koppla om".

6. **Fälthjälp bara vid format eller konsekvens**, i en kort mening utan
   punkt om den är ofullständig: "Timmar, t.ex. 7,5", "Minst 10 tecken",
   "Kan inte ångras". Inte varför fältet finns.

7. **Felmeddelanden säger vad som är fel och vad som rättar det.** Ett led,
   inte tre.

8. **TID SKRIVS ALLTID SOM DECIMALTIMMAR** (ändrat 2026-10-14, ersätter
   "tid skrivs alltid som tim:min" från 2026-10-01). "8,5", aldrig "8:30".
   Nollor i slutet faller bort, så "8" är åtta timmar och 33,75 sticker ut
   bland en spalt runda tal. Saldon får sitt tecken utskrivet: "+2,25",
   "−0,75", "0".

   Gäller varje yta kunden ser: panelen, kioskskärmen, varenda PDF,
   Excel-arket och säljsidans produktbilder.

   Kunden bad om det, och skälet är deras eget: lönekörningen och de
   efterkalkyler de räknat på i tio år står i decimaltimmar. Den som läste ett
   tal i panelen för att skriva in det någon annanstans räknade om varje gång,
   och en omräkning i huvudet är en felkälla systemet lagt dit själv.

   **DET ÄR NU ETT FORMAT OCH INTE TVÅ, och det är hela vinsten.** Buggen som
   gav tim:min sin regel var inte att decimaltimmar är svårlästa, utan att två
   format stod på samma sida om samma dag: tidrapporten i decimaltimmar,
   tabellen under den i tim:min, och "1,99" lästes som 1:59 — fyra minuter
   fel. Med ett enda format finns ingenting att läsa fel, och Excel-arkets
   dubbla tidkolumn kunde tas bort: en text att jämföra med skärmen och ett
   tal att summera är samma tal nu, och talet är det som står kvar.

   **ETT KLOCKSLAG ÄR INTE EN LÄNGD.** En in- och utstämpling, en rast
   11:30–12:15, schemats dag och en beräknad sluttid är klockslag och skrivs
   med kolon. Bara tid som RÄKNAS är decimal. Den som blandar ihop det gör
   tabellen obegriplig åt andra hållet.

   Fälten där tid skrivs in tar BÅDA formen, så att "7:30" på ett gammalt
   papper går att skriva av: "7,5" och "7:30" ger samma sak. Bara kolon
   skiljer timmar från minuter — "7.30" är sju timmar och arton minuter.

   `src/lib/format.ts` äger formatet, och `tests/format.test.ts` fäller en ny
   sida som visar tim:min.

Där något verkligen är svårt — GDPR-radering, fast pris kontra påslag — får
en mening stå kvar. Den ska då vara skriven för en verkstadschef, inte för en
nybörjare.

### 7.2 Utseendet (Tikkr brand guidelines v1.0, infört 2026-10-02)

Gäller ALLT kunden och kundens kund ser: adminpanelen, kioskskärmen,
säljsidan, plattformspanelen, varje PDF och varje mejl.

Hela materialet ligger i **`brand/`** med `brand/README.md` som ingång, och
riktlinjerna i sin helhet i `brand/Tikkr-brand-guidelines.pdf`. Mappen är
källan och ändras inte för hand — kommer en ny version byts den ut, och
kopiorna i `public/` kopieras om.

**SEX FÄRGER, OCH INGA FLER.**

| Namn | HEX | Roll |
|---|---|---|
| Fjord | `#0E1A2B` | Primär. Text, logotyp, mörka ytor, knappar |
| Tick | `#2ED196` | Accent på mörkt |
| Tick Deep | `#0F9E68` | Accent på ljust: ikoner, markerat läge |
| Snö | `#F5F6F2` | Ljus bakgrund |
| Skiffer | `#5B6573` | Sekundär text |
| Lav | `#D9DDD6` | Linjer, ramar, tysta ytor |

**Länkad text är `text-link`, ett steg mörkare än Tick Deep** (beslutat
2026-10-30, produktägarens val, UX-granskningen). Tick Deep ger 3,44:1 mot vitt
och `neutral-400` 3,37:1, och båda stod på text som ska läsas. WCAG begär 4,5:1.
Länkar ligger nu på `emerald-700` (5,09:1) och läsbar sekundär text på Skiffer.
Tick Deep och `neutral-400` står kvar på ikoner, ytor och linjer. Det är ett
litet avsteg från guiden, som anger Tick Deep för länkar. Bevisas av
`tests/contrast.test.ts`.

Fjord och Snö bär de flesta ytorna. **Grönt är accent och aldrig huvudfärg** —
det är den enda regeln i guiden som står utskriven som ett förbud, och skälet
att Fjord och inte grönt bär knapparna.

Färgreglerna som gäller överallt, oförändrade i betydelse:

```
Fjord = något går att göra här   (knappar, markerat läge, kryssrutor)
grön  = pågår just nu            (instämplad, sparat, positivt saldo)
gul   = kräver din uppmärksamhet
röd   = går inte att ångra
```

Gult och rött har ingen motsvarighet i guiden och är kvar som funktionella
färger. En varning som ser ut som allt annat är ingen varning.

**Ett fält man kan skriva i har en SYNLIG kant** (tillagt 2026-10-07). Kanten
stod på Lav, som är guidens linjefärg, och mot vitt ger den 1,38:1 — ett fält
såg ut som en vit yta, och kunden hörde av sig om att det inte gick att se vad
som gick att fylla i. Den ligger nu på `neutral-400`, drygt 3:1, vilket är vad
WCAG 1.4.11 begär för kanten på en kontroll man ska kunna urskilja.

Lav är kvar som linje mellan rader och runt kort. Där är den rätt: en linje som
delar av är inte en kant man ska träffa med fingret.

**Fokusringen ritas en gång, inte två.** Fälten släcker webbläsarens egen
fokusram med `focus:outline-hidden`. Utan den ritade Chrome sin `outline: auto`
ovanpå vår tvåpixelsring, och ett fält man klickat i fick en svart ram runt
hela rutan. `outline-hidden` och inte `outline-none`: den förra lämnar kvar en
genomskinlig ram, som blir synlig i Windows högkontrastläge, där vår ring inte
ritas alls.

**Paletten ägs av två filer, och de ska hållas i takt.**
`src/app/globals.css` har tokens för gränssnittet; `src/lib/brand.ts` har
samma sex färger som TypeScript, för dokumenten som ritas av pdfkit och inte
kan läsa en stilmall. `brand.ts` har **inga importer och ska inte få några** —
både fakturasidan och lönesidan läser den, precis som `modules.ts`, se
avgränsningen överst.

**Tailwinds skalor `neutral-*`, `blue-*` och `emerald-*` är omskrivna** till
gråskalan Snö→Fjord, till Fjord respektive till Tick. Namnet `blue-600`
beskriver alltså inte längre en blå färg. Skälet står i globals.css: de tre
skalorna används på drygt niohundra ställen, och nya värden rebrandar allt på
en gång utan niohundra ändringar som inte går att bygga på den här maskinen.
Ny kod använder hellre `text-fjord`, `bg-tick-deep` och de andra
varumärkesnamnen.

**RÖRELSE OCH LADDNING** (beslutat 2026-10-20, produktägarens godkännande).
Gäller adminpanelen och plattformspanelen. Kort, liten och bara när något
kommer in, aldrig medan man arbetar i en vy:

- **Sidbyte:** nytt innehåll tonas in fyra pixlar (`.panel-content > *`).
  Menyn står still, och den klickade punkten markeras direkt med en prick
  medan sidan hämtas (`NavFeedback.tsx`).
- **Skelett** i sidans egen form (`Skeleton.tsx`, `loading.tsx`), först
  efter 150 ms, så att en snabb sida inte blinkar förbi ett. När samma sida
  hämtas om står det gamla kvar tills det nya kommit.
- **Staplar växer fram** när de ritas, med `scale` så att ingenting runt
  dem flyttar sig (`.animate-grow-*`). Produktägarens önskan.
- **Ett tal som ändras medan sidan står öppen lyser upp** (`LiveValue`).
- **Ingen rörlig bakgrund i panelerna.** Säljsidans ljus passar inloggningen
  men konkurrerar med siffrorna i en arbetsyta.
- **`prefers-reduced-motion` stänger av allt**, och skelettet står då stilla.

Stämplingsskärmen behåller sitt korta vybyte och sin tryckkvittens, på samma
tidsvariabel (`--motion-fast`). Den får inga skelett: ett tryck ska kännas
omedelbart, och den laddar ingenting som motiverar ett.

**Typsnittet är Geist**, och ingenting annat. Laddas av `next/font` i
`src/app/layout.tsx`, som packar filerna med bygget — en kioskskärm utan nät
ska inte tappa typsnittet, och säljsidans besökare ska inte lämna spår hos
Google. Konsekvens: **bygget behöver nå fonts.gstatic.com.** Semibold 600 för
rubriker, Medium 500 för knappar och etiketter, Regular 400 för brödtext.
Knipningen ligger i `--tracking-tight` (−3 %) och `--tracking-wider` (+8 %),
så de klasser som redan står i koden blir rätt.

**Sloganen är "Tiden tickar. Tikkr räknar."** (bytt 2026-10-03, var
tidigare "Stämpla in. Stämpla ut. Klart."). Två korta meningar med punkt efter
båda — guiden anger formen, och en slogan skriven med komma är inte längre
samma slogan. Den står som `SLOGAN` i `brand.ts` och skrivs inte av för hand:
den låg på två ställen vid bytet, och den sortens par hinner alltid sluta säga
samma sak.

**Ordmärket sätts ALDRIG som text.** Guiden förbjuder att det sätts om i ett
annat typsnitt, och vanlig text blir just det så fort Geist inte hunnit
laddas. `src/components/ui/Logo.tsx` ritar konturerna ur
`brand.ts`. Enda undantaget är mejlen, som inte får innehålla externa bilder
och inte kan hämta ett typsnitt — där står ordmärket som gement "tikkr" med
guidens knipning, och skälet står i `emails.ts`.

Logotypens mått **härleds** ur varumärkesfilerna och väljs inte: app-ikonens
rundning är 24 % av sidan och symbolen 60 % av bredden, det vågräta märkets
ordmärke 86 % av symbolens höjd med 34 % mellanrum. En handplockad siffra ger
en logotyp som nästan stämmer, vilket är svårare att upptäcka än en som är
uppenbart fel.

**INLOGGNING OCH REGISTRERING LIGGER PÅ SÄLJSIDANS YTA** (ändrat 2026-10-11,
issue #16). De sju sidorna som delar `AuthShell` låg på en platt ljusgrå yta,
och den som kom från säljsidans hero rakt in i registreringen bytte produkt
mitt i ett steg. Nu bär Fjord sidan: ljuset som driver, ritningsrutnätet,
symbolen och två produktbilder som svävar i kanterna. Se `AuthBackdrop`.

Lagren är säljsidans egna, ur `marketing/`, och det är hela skälet att filen
är kort. En andra uppsättning gradienter som är "ungefär likadana" är precis
vad `Atmosphere.tsx` finns för att slippa — mappen heter `marketing` efter var
de först användes, inte efter vem som får använda dem.

Rutan man skriver i är kvar vit. Ett fält på en mörk yta med ett ljus bakom är
ett fält man inte ser kanten på, och guiden säger att Fjord och Snö bär
ytorna. Produktbilderna syns först från `xl`, eftersom avståndet mellan rutan
och fönsterkanten under den bredden är mindre än en produktbild; en telefon
får ljuset och rutnätet, som bär ytan ändå.

Bevisas av **`tests/brand.test.ts`**: den fäller en färg utanför paletten, ett
token som glidit från guidens hexkod, och ett ordmärke som satts som text.
Samma sorts skyddsnät som `format.test.ts` och `ui-text.test.ts`, och av samma
skäl — Tailwind levererar tjugotvå färgskalor som alla är ett klassnamn bort,
och `bg-sky-600` ser lika rimlig ut i en kodgranskning som `bg-blue-600`.

## 8. Affärsmodell (kontext, inte kod)

### Pris (beslutat 2026-08-11)

**399 kr per aktiv stämplingsskärm och månad, exkl. moms.** Ingen grundavgift,
inget tak på anställda, ordrar eller stämplingar. **Ingen bindningstid.**
När appen finns räknas den som en skärm, se Appen är en stämplingsplats nedan.

**Årsbetalning: 3 990 kr per skärm och år** — tio månaders pris för tolv
månader. Frivilligt alternativ, inte bindning: kunden väljer själv och får
rabatten för att de betalar i förskott.

Per anställd övervägdes och valdes bort (2026-08-11). Skälet: kostar varje
anställd pengar får kunden ett skäl att inte lägga upp alla, och just den
tiden blir oregistrerad — vilket är precis problemet systemet ska lösa. Per
skärm hänger kostnaden på något fysiskt som ändå måste köpas in.

Motiv: ett pris är en siffra att förklara, två är en prislista. Antalet skärmar
följer kundens storlek av sig självt, eftersom folk annars köar vid den enda
skärmen. Jämförelse: System Andersson ligger på 25 000–50 000 kr/år, men är ett
helt affärssystem — Tikkr ska ligga tydligt under.

Höj inte priset för befintliga kunder i onödan; rabatt är lätt att ge, höjning
är det svåraste som finns. Saknas en nivå för stora kunder (femtio anställda,
två skärmar) läggs den till när den kunden dyker upp.

### Pris på tillval (beslutat 2026-09-27)

**Löneunderlaget: 499 kr per månad och FÖRETAG, exkl. moms.** Årsbetalning
4 990 kr, samma tio-för-tolv som basen. En kund med tre skärmar betalar tre
skärmpriser plus en modulavgift.

**Planeringen: 699 kr per månad och FÖRETAG, exkl. moms.** Årsbetalning
6 990 kr. Dyrare än löneunderlaget, eftersom den är en egen arbetsyta man står
i varje morgon och inte en beräkning med ett par sidor. En kund med tre skärmar
och båda tillvalen betalar 3 × 399 + 499 + 699 = 2 395 kr i månaden.

Per skärm valdes bort: löneunderlaget har ingenting med skärmar att göra, och
det är första frågan kunden ställer när de ser fakturan. Per anställd valdes
bort av samma skäl som basen gjorde det ovan.

**Siffran i koden styr ingenting.** Priset sätts på artikeln hos Stripe och
läses därifrån vid varje sidvisning, precis som skärmpriset —
`FALLBACK_PRICE_PER_SCREEN` och `MODULES[...].fallbackMonthly` används bara i
labbet och hos kunder som betalar mot faktura. En prisändring hos Stripe syns
i panelen och på säljsidan utan deploy, och det är hela poängen.

**Vilken artikel som är vad sätts i plattformspanelen**, under Artiklar, och
ligger i `stripe_prices`. `src/lib/price-book.ts` är enda stället som avgör
det: databasen först, miljövariabeln som reserv.

Numren stod först bara i miljövariabler. Det betydde att en ny artikel krävde
att någon redigerade en fil på servern och startade om appen — för att skriva
in en identifierare som inte ens är hemlig. Variablerna läses fortfarande, så
att en ny server går att sätta upp med bara en `.env` och så att en
installation vars databas inte hunnit fyllas kan ta betalt.

Namnen bildas ur nyckeln: `STRIPE_PRICE_<sak>_<MONTH|YEAR>`, där `SCREEN` är
skärmlicensen och resten heter som sin modulnyckel. De gamla namnen
(`STRIPE_PRICE_ID` med flera) läses också, så att en `.env` i drift fungerar
oförändrad. **Skriv inte ut variabelnamn i registret** — en ny modul ska inte
behöva döpa två variabler, och namn som skrivs var för sig glider isär, vilket
är precis vad som hände förut.

Numret kontrolleras mot Stripe när det sparas: att artikeln finns, att den är
återkommande, och att intervallet stämmer med fältet. Ett årspris i
månadsfältet ger en faktura tolv gånger för dyr, och det ska inte gå att
spara.

### Appen är en stämplingsplats (beslutat 2026-10-17, issue #19)

Appen är inte byggd. Beslutet tas före den, så att säljsidan och villkoren
inte lovar något som blir fel den dag den kommer, och så att ingen kund får
ett högre pris i efterhand.

**399 kr per STÄMPLINGSPLATS och månad, och en plats är en skärm eller
appen.** Appen kostar som en skärm, en gång per företag, för hela personalen.
Årsbetalning 3 990 kr, som skärmen. Tillvalen är oförändrade, 499 och 699 kr.

| Kund | Per månad |
|---|---|
| 1 skärm | 399 |
| Bara appen | 399 |
| 2 skärmar och appen | 1 197 |
| Appen och planeringen | 1 098 |

Skälet är kunden som inte har någon skärm. En elfirma i planeringsläget
Tjänst (§ 3 regel 8) står inte vid en skärm i en verkstad, och med ett pris
per skärm gick den kunden inte att ta betalt av alls. Att appen kostar som en
skärm gör att det fortfarande är ett pris att förklara.

**Prenumerationen kräver minst en plats: en skärm eller appen.** Det är
prenumerationens status som släpper in kunden (`subscription.ts`), inte
skärmen. Men betalningskoden förutsätter i dag minst en skärm, och fyra
ställen ändras i samma gren som appen:

- Kassan i `billing.ts` tar bara med skärmraden när kunden valt skärmar.
- `assertLicenseCount` tillåter noll skärmar när appen är på, och den första
  skärmen på en prenumeration utan skärm blir en ny rad hos Stripe.
- `screenItemOf` i `stripe.ts` tar aldrig en modulrad. Den faller i dag
  tillbaka på första raden, för prenumerationer från tiden före modulerna, och
  hade då skrivit appens antal som en skärmlicens. `tests/stripe-items.test.ts`
  får fallet "bara appen".
- Webhooken skriver noll skärmar när raden saknas.

**Stämplingen i appen slutar aldrig fungera**, lika lite som på skärmen. En
obetald faktura låser panelen och ger en varning i appen, men tiden
registreras (se Provperiod nedan).

Övervägt och bortvalt samma dag:

- **Storleksnivåer efter antal aktiva anställda**, med skärmar och app
  inkluderade. Det är pris per anställd i trappsteg, och skälet mot det står
  under Pris ovan.
- **Paket** (Start, Pro, Komplett, som bygger på varandra). Tillvalen är
  fristående i koden, och planeringen hade inte längre gått att köpa utan
  löneunderlaget.
- **Ett lägre pris på planeringen.** Ingen kund har köpt den än, och ett pris
  som är för högt syns på att kunderna provar och väljer bort den. Då går det
  att sänka, men ett höjt pris går inte att ta tillbaka. Följ hur många som
  slår på den under provperioden och behåller den efteråt.

Väntar tills en kund frågar: rabatt för båda tillvalen och ett lägre pris
från den femte skärmen. Båda går att lägga till utan att någon får ett högre
pris.

### Pris på stämplingsskärmen (beslutat 2026-10-20, tillfälligt)

**24 900 kr exklusive moms**, frakt tillkommer. Inköpet är ungefär 13 600 kr
för skärmen och 1 500 kr för stativet, och med förberedelse, emballage och en
reserv för garantiärenden landar självkostnaden kring 16 900 kr. Priset sätts
på produkten under Produkter i plattformspanelen och kan ändras innan lansering. Lagda
beställningar behåller sitt pris.

### Avtalat pris per kund (tillagt 2026-10-08)

Listpriset ovan gäller alla. `company_prices` säger vad vi kommit överens om
med ett ENSKILT företag: en pilotkund som får systemet gratis, en kund som
förhandlat ner skärmlicensen till 299.

En rad per prissatt artikel — `SCREEN` och varje modulnyckel, samma nycklar
som `stripe_prices`. **Saknas raden gäller listpriset, och noll är ett pris
som betyder gratis.** Det är hela skälet att beloppet ligger i en egen rad och
inte som ett nollbart fält på företaget: går "ej satt" och "noll kronor" inte
att skilja åt kan en gratiskund inte uttryckas.

Per artikel och inte som en justerad totalsumma. Totalen räknas ur raderna och
kan därmed aldrig säga emot dem — samma skäl som att orderns beräknade tid
aldrig lagras (§ 3 regel 6). Allt på noll ger en gratiskund.

**GÄLLER BARA FÖRETAG UTAN PRENUMERATION HOS STRIPE.** Dras kundens kort på
399 vore det en lögn att visa 299 på deras sida. Vakten sitter i
`setAgreedPriceManually` och i uppslaget: en kund med prenumeration får
listpriset oavsett vad som ligger i tabellen, eftersom raden kan ligga kvar
från tiden före kortet. Samma hållning som `setModule` redan har.

**Kunden ser rabatten.** Prenumerationssidan visar listpriset överstruket,
det avtalade beloppet och rabatten i procent. En gratiskund ser 0 kr och
100 %. Kunden ska förstå vad hen fått, inte bara se ett tal som avviker från
säljsidan.

Bara månadsbelopp, och årsbeloppen faller bort när en överenskommelse finns.
En plattformsstyrd kund har inget intervall hos Stripe, fakturan skrivs för
hand vid sidan om, och ett årsbelopp räknat på listpriset bredvid ett avtalat
månadspris vore ett tal kunden inte kan betala.

Dashboardens månadsintäkt räknar med de avtalade priserna. En gratiskund står
alltså kvar som ett betalande företag med noll i intäkt — hen ÄR en kund, och
att dölja raden vore att dölja en kund.

Under provperioden slår kunden på och av modulerna fritt. Vid köp blir de
påslagna modulerna rader på prenumerationen. En kund som redan betalar slår
på en modul själv och får se Stripes egen beräkning av vad resten av perioden
kostar innan de bekräftar. Samma flöde gäller antalet licenser, se § 3.1.

### Provperiod och utebliven betalning (beslutat 2026-08-11)

30 dagars provperiod, inget kort krävs. Varning sista veckan.

**Stämplingen slutar aldrig fungera** — se `src/lib/subscription.ts`. Istället
låses adminpanelen (rapporter och export) och en stor varning visas på
stämplingsskärmarna. Utebliven betalning ger tio dagars respit innan låsning.

Skälet: stämplar ingen går arbetstid förlorad och går inte att rekonstruera.
Den tiden är kundens fakturaunderlag mot sin kund, alltså pengar som försvinner
för någon som inte rår över att fakturan till oss är obetald.

**Låset sitter i `requireAdmin()`, inte i layouten** (ändrat 2026-10-30,
säkerhetsgranskningen). Det låg som en gren i panelens layout, som ritade
låsskärmen i stället för sidan. Det stoppade ingenting: Next kör sidan ändå och
skickar den i svaret, även när layouten aldrig ritar `children`, och
serveråtgärderna går inte genom en layout alls.

Nu skickar `requireAdmin()` en låst arbetsyta till `/admin/last`, en tom sida
där layouten ritar låsskärmen. En ny sida eller åtgärd är därmed låst utan att
någon behöver komma ihåg det. Undantagen kallar `requireAdminEvenIfLocked()` och
står med skäl i `tests/subscription-lock.test.ts`: betalningen, det egna kontot,
feedback, adressbekräftelsen, registerutdraget och anonymiseringen. De två
sista är de registrerades rättigheter, som inte kan hänga på en betald faktura.
Uttagen svarar 402 och prövar låset själva (`export-access.ts`). Supportläget är
aldrig låst, se § 4 punkt 5.

### Betalning vs bokföring

Stripe sköter prenumerationen och styr åtkomst automatiskt. Fortnox används
parallellt för bokföring och momsredovisning.

## 9. Miljöstatus (uppdatera vid ändring)

### Arbetssätt

Koden skrivs på laptopen, körs på servern. Användaren kör själv kommandon på
servern — Claude har **ingen** SSH-åtkomst och ska alltid leverera kommandon i
färdiga kodblock, ett i taget, med förklaring av vad de gör.

```
Laptop (gren, commit)  →  GitHub (PR, CI, dev, prod, tagg)  →  Server: ./scripts/release.sh <version>
```

### Utvecklingsdator

Windows 11, projektrot `C:\Projekt\Tikkr`, PowerShell. GitHub CLI (`gh`) är
installerat och inloggat, så Claude kan öppna PR:er och läsa CI.

| Verktyg | Status per 2026-10-10 |
|---|---|
| git | ✅ 2.50.1 |
| Node.js | ✅ 24 (npm 11). Docker-imagen och CI kör Node 22 |
| Docker Desktop | ❌ ej installerat |

Konsekvens: Claude kan **typkolla och bygga lokalt** (`npm ci`,
`npx prisma generate`, `npm run typecheck`, `npm run build`), men **inte köra
databastesterna** — de behöver Postgres, och den finns bara på servern och i
CI. Påstå aldrig att något fungerar innan det körts där.

**Testerna som inte behöver databas går att köra lokalt** (konstaterat
2026-10-11): `help`, `ui-text`, `seo`, `brand`, `format`, `module-coverage`
med flera, som bara läser källkoden. De körs mot en adress som inte svarar men
vars namn slutar på `_test`, så att spärren i `tests/setup.ts` släpper igenom
dem:

```
DATABASE_URL="postgresql://ingen:ingen@127.0.0.1:1/finns_inte_test" npx vitest run tests/<fil>
```

npm 11 kör inte paketens installationsskript utan godkännande och varnar för
det vid `npm ci`. Det är ofarligt här: `npx prisma generate` hämtar det som
behövs, och imagen byggs med Node 22, där skripten körs som vanligt.

### Testserver (labbmiljö — INTE produktion)

`tf-docker01-test`, Ubuntu/Debian, Docker + Compose finns.

All utveckling sker här. Ingen riktig kunddata får läggas in. Produktion är en
separat server som sätts upp senare, mot tikkr.se.

| Sak | Status |
|---|---|
| Port 80/443 | 🔴 upptagna av **Nginx Proxy Manager** — rör dem inte |
| Port 3000 | ✅ Tikkr, men bara `127.0.0.1` — all trafik går via proxyn |
| Adress | ✅ `https://www.tikkr.se` och `portal.tikkr.se` via NPM, tills produktionen tar över dem |
| Gren | `dev`. En gren under arbete kan provas här före sammanslagning, och `prod` vid en akut rättelse |
| Övrigt på servern | kör andra tjänster — kontrollera alltid innan portar tas |

### Miljöerna (beslutat 2026-10-10)

| Miljö | Adress | Innehåll |
|---|---|---|
| Produktion | `www.tikkr.se`, `tikkr.se` (säljsida), `portal.tikkr.se` (systemet) | Alla kunder, även pilotkunden |
| Labbet = staging | `test.tikkr.se` | Bara testdata. Får slås sönder |

Ingen tredje miljö. **Pilotkunden Vänertekno AB kör i produktionen** och
börjar om med tom arbetsyta vid lanseringen; testdatan i labbet flyttas inte.
De får nya versioner först genom att vara först, inte genom en egen instans —
alla kunder delar samma version. Funktionskontrollen efter en driftsättning
görs på en intern kontrollkund i produktionen, aldrig i Vänerteknos
arbetsyta: ett provtryck där blir en stämpling i deras faktura- och
löneunderlag.

Adresserna byts samma kväll som produktionen tar över dem. Länkarna i mejl
byggs ur `APP_URL`, så den ska ändras i labbets `.env` vid bytet.

**Kioskens cookie är knuten till adressen och servern.** Vid bytet måste
varje skärm kopplas om med en ny kod.

### Ej på plats än

| Sak | Status |
|---|---|
| GitHub-repo | ⚠ `TERAFALK/Tikkr` finns men är **publikt**. Ska bli privat; gratisplanen kan då inte skydda `prod` |
| Produktionsserver | ⏸ Glesys-VPS, senare. Föreslaget: 2 vCPU, 4 GB RAM, 50 GB, Ubuntu 24.04 |
| Offsite-backup (rclone-mål) | ⏸ Glesys Object Storage, köps till. `BACKUP_REMOTE` sätts före lansering |
| Uptime-övervakning | ⏸ sätts upp mot produktionens adress |

### Databasen ändras bara med migrationer (beslutat 2026-10-10)

Till 2026-10-10 byggdes databasen direkt ur `prisma/schema.prisma` vid varje
start (`prisma db push --accept-data-loss`). Det gick så länge allt var
testdata, men raderar det som ändrats — med kunddata vore det ett fel som inte
går att ångra.

Nu ligger migrationerna i `prisma/migrations/`, med baslinjen `0_init`, och
`scripts/migrate.sh` kör bara `prisma migrate deploy`. **Vägen med `db push` är
borttagen ur migrate.sh, inte avstängd**, och saknas mappen stoppar den.
`release.sh` vägrar dessutom en produktionsversion utan migrationer.

Migrationer skapas på LAPTOPEN med `node scripts/new-migration.mjs <namn>`,
som jämför schemat mot senaste commit utan att behöva en databas. Servern
skriver fortfarande aldrig till GitHub. CI kör alla migrationer mot en tom
databas och fäller en PR där de inte ger samma databas som schemat.

`.gitignore` ignorerar `*.sql` (databasdumpar) men gör ett undantag för
`prisma/migrations/**/migration.sql`. Utan undantaget hade migrationerna tyst
hamnat utanför git.

Undantag: `scripts/test.sh` bygger labbets testdatabas med `db push`. Den
databasen raderas av testerna själva och innehåller aldrig något att förlora.

**Spärrar innan skarp drift** (se `docs/drift.md` punkt 7): offsite-backup
satt, repot privat, seed aldrig körd i produktionen, en release övad i labbet,
och `./scripts/status.sh` utan röda punkter.
