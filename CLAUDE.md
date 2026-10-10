# Tikkr — projektkontext för Claude Code

> Denna fil läses automatiskt i varje ny session. Den är den enda källan till
> projektkontext — uppdatera den när beslut ändras.

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
planerad tid, närvarotid, flex, komp och frånvaro. Vad timmarna är värda i lön
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
companies      — id, name, subscription_status, created_at
employees      — id, company_id, name, active, cost_rate_ore,
                 schedule_id?, flex_opening_minutes, flex_code_hash?, hourly
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
admin_users    — id, company_id, email, name?, phone?, password_hash, role,
                 password_changed_at?, sessions_revoked_at?, email_verified_at?
email_verifications — id, user_id, token_hash, email, expires_at, used_at
audit_events   — id, company_id, actor_email, entity, entity_id, action,
                 before, after, subject_employee_id
kiosk_devices  — id, company_id, name, device_token, active, last_seen_at
support_visits — id, company_id, email, started_at, last_seen_at

  — löneunderlaget, se regel 7 —
work_schedules   — id, company_id, name, is_default
schedule_days    — id, company_id, schedule_id, weekday, start_minute, end_minute
schedule_breaks  — id, company_id, schedule_day_id, start_minute, end_minute
break_types      — id, company_id, name, active, sort_order
break_entries    — id, company_id, employee_id, break_type_id,
                   started_at, ended_at, source, needs_review
absence_reasons  — id, company_id, name, active, sort_order, counts_as_comp
absences         — id, company_id, employee_id, date, reason_id, minutes,
                   note, created_by_email
comp_adjustments — id, company_id, employee_id, date, minutes,
                   note, created_by_email, absence_id

  — planeringen, se regel 8 —
stations         — id, company_id, name, moment_id, active, sort_order
station_days     — id, company_id, station_id, weekday, start_minute,
                   end_minute
station_breaks   — id, company_id, station_day_id, start_minute, end_minute
planned_blocks   — id, company_id, station_id, order_id, moment_id,
                   starts_at, minutes, note, created_by_email

  — tillvalen, se § 3.1 —
company_modules  — id, company_id, module, source, stripe_item_id,
                   enabled_by, enabled_at

company_prices   — id, company_id, item, monthly_ore, updated_by_email

  — plattformens egna tabeller, aldrig kundens —
stripe_prices    — item, month_price_id, year_price_id, updated_by_email
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
   faktureras eller blir komp, och en post som ingen tittat på hinner annars
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

7. **Löneunderlaget: schema, raster, flex, komp och frånvaro**
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

   **TIMANSTÄLLD MÄTS INTE MOT NÅGOT SCHEMA** (tillagt 2026-10-07).
   `employees.hourly` stänger av planerad tid, flexsaldo och komptid för den
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
   saldot och åtgärden för godkänd komptid avvisar personen på servern, inte
   bara i menyn.

   **ATF är inte byggt** (2026-10-07). Hur många timmar någon tjänar in står i
   kollektivavtalet, och det räknar Tikkr aldrig. Blir det aktuellt är formen
   given av komptiden: ett saldo kontoret fyller på, och uttag genom en
   frånvaroorsak som drar på det.

   **Rasterna STÄMPLAS** (kundens val), och ett rasttryck stänger ALLA
   pågående jobb. Därmed faller rasten bort ur närvarotiden av sig själv, och
   varken rapporterna eller fakturaunderlaget behöver veta att raster finns.

   Rasterna har ett EGET register, `break_entries`, av samma skäl som
   improduktiv tid fick ett: improduktiv tid är arbete som inte faktureras,
   en lunch är inte arbete alls. En rastpost har varken order, moment eller
   timkostnad och kan därför inte faktureras ens av misstag.

   **Flexformeln, som bara räknas i `src/lib/payroll.ts`:**

   ```
   flex(dag) = arbetad tid + frånvarotid − planerad tid − intjänad komp
   ```

   | Fall | Arbetad | Frånvaro | Planerad | Komp | Flex |
   |---|---|---|---|---|---|
   | Normal dag | 8,5 | 0 | 8,5 | 0 | 0 |
   | Sjuk hel dag | 0 | 8,5 | 8,5 | 0 | 0 |
   | Övertid, 2 h godkänd komp | 10,5 | 0 | 8,5 | 2 | 0 |
   | Tar ut komp hel dag | 0 | 8,5 | 8,5 | 0 | 0 |

   Frånvaron TÄCKER den planerade tiden — annars gav en sjukvecka minus
   fyrtio timmar. Intjänad komp dras bort, annars räknades samma övertid två
   gånger.

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
   andra gången. Frånvaro och komprader, som dateras vid dygnets början,
   försvann helt från första dagen.

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

   **Intjänad komp uppstår aldrig av sig själv.** Tid utöver schemat är flex
   till dess att en människa beslutat att den är övertid. Uttagen komp är en
   frånvaroorsak som också drar på komptidssaldot.

   **Frånvaroorsakerna är kundens egna rader** (ändrat 2026-10-01), i
   `absence_reasons`, och läggs upp under Inställningar. Var en enum i koden,
   vilket betydde att en kund som behövde "arbetsskada" fick vänta på en
   driftsättning. Orsakerna följer deras verksamhet och deras kollektivavtal,
   inte vår kod.

   Den enda av dem som betyder något för räkningen är `counts_as_comp`: står
   den ikryssad skriver frånvaron samtidigt ett uttag i komptidsboken. Utan
   den kopplingen räknades en uttagen komptimme två gånger, en gång som
   frånvaro och en gång som ett saldo som aldrig minskade. Alla övriga orsaker
   är etiketter, och `payroll.ts` summerar dem per namn utan att veta vad de
   heter.

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

   **Saldot räknas från `balance_opening_date`, och är den tom från personens
   FÖRSTA STÄMPLING** (tillagt 2026-10-01). Dagen avgörs på ett ställe,
   `balanceStart` i `payroll.ts`, eftersom två vägar in i samma saldo hann
   säga olika saker: tidrapporten utelämnade all historik före perioden, så
   saldot blev periodens egen flex, medan stämplingsskärmen räknade ett år
   bakåt och gav en nyanställd minus för varje schemalagd dag innan hen fanns.
   Rutan som justerar saldot visade det ena talet och ändrade det andra, och
   ett inskrivet 0 lämnade tvåtusen timmar kvar.

   Den som aldrig stämplat har inget härlett saldo. Då står det ingående
   ensamt, vilket är noll för alla utom den som flyttat in med timmar.

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
   arbetsmoment och tid — ingen person. Vem som körde jobbet framgår bara av
   stämplingarna, som redan har sin GDPR-väg. Anonymiseringen i § 4 punkt 8
   behöver därför inte röras, till skillnad från löneunderlagets poster.

   Kiosken är **orörd**. Ett tryck ska räcka.


Multi-tenant-isolering byggs i appens kod: **varje databasfråga går via ett
gemensamt lager** i Prisma som alltid filtrerar på inloggad användares
`company_id`. Ett enda ställe i koden, inte utspritt — och testat automatiskt.

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
verkligen är säkerhet. Prenumerationslåset lärde oss varför: det ligger som
en gren i panelens layout, och rutterna under `/api` renderas aldrig genom
den. Därför gäller regeln att **varje sida, server action och rutt som rör en
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

**Förra veckan per anställd: en person per sida.** Utskriften delas ut till var
och en, och flöt personerna ihop gick den inte att dela ut utan att någon fick
läsa någon annans rader. Därför finns heller ingen slutsumma sist — den skulle
hamna på den sista personens papper och påstå att raden ovanför gäller hen.
Periodens totaler står på förstasidan.

**Knappen är tillbaka, och hämtar nu TIDRAPPORTEN** (ändrat 2026-10-08).
Den togs bort dagen innan på kundens begäran, och kunden ändrade sig: utskriften
behövdes, men med summeringen per person — planerad tid, närvarotid, flex och
komp.

Den summeringen är löneunderlagets, och `report-pdf.ts` får aldrig läsa
löneunderlaget. Utskriften kan alltså inte vara stämplingslistan med en
summering påklistrad; den måste VARA tidrapporten. Rutten
`/api/admin/export/timesheet` tog redan hela personalen när ingen anställd
pekas ut, en per sida, så bytet var en adress och inte en ny PDF.

Konsekvensen är att knappen hör till lönemodulen. Den sitter på Tidrapport,
som redan är grindad, och inte på Rapporter. En kund utan löneunderlaget har
ingen summering att skriva ut.

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

**Stämplingar går inte att radera** (ändrat 2026-09-29). Knappen fanns för
felregistreringar. En felaktig stämpling rättas i stället genom att skrivas om:
tiden är både faktura- och löneunderlag, en ändrad post bär spår av vem som
ändrade den, och en raderad post lämnar bara ett hål ingen kan förklara i
efterhand. Ska en persons tid bort helt finns GDPR-raderingen i
inställningarna.

## 4. Kritiska säkerhetskrav

1. **Multi-tenant-isolering** — all databasåtkomst via det gemensamma
   filtreringslagret. Automatiska tester ska bevisa att kund A aldrig kan se
   kund B:s data.
2. **Kiosk-token, inte PIN** — varje fysisk skärm får en lång, slumpad,
   återkallningsbar, company-scopad token vid uppsättning. Utan giltig token
   accepteras ingen stämpling.
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
   sessioner ogiltiga. **E-postadressen bekräftas** med en länk vid
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

   Supportläget släpps igenom prenumerationslåset — en obetald faktura är
   oftast precis varför kunden ringer.

   **Tvåstegsinloggning är obligatorisk för alla** (beslutat 2026-10-06):
   kundernas ägare och administratörer och plattformspanelen, med samma
   flöde. Steg ett är lösenordet, som bara lämnar en signerad lapp i tio
   minuter (`login-ticket.ts`). Steg två visar en QR-kod första gången och
   frågar sedan efter koden (TOTP, `totp.ts`, `two-step.ts`). Sessionen
   skapas först när koden godkänts, och registrering, inbjudan och
   återställning går samma väg. `currentAdmin()` släpper inte in ett konto
   utan bekräftad app. Nycklarna lagras krypterade med `AUTH_SECRET`.

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

Alla kunder delar samma server → **en** deploy-pipeline:

**Målbilden** (inte byggd än, se nedan):

1. Kodändring pushas till Git
2. GitHub Actions kör testerna och bygger Docker-image automatiskt
3. Deploy till liten **staging-miljö** för snabb kontroll — viktigt, en trasig
   deploy slår annars mot *alla* kunder samtidigt
4. Efter godkänd staging: SSH till produktion, `docker compose pull && docker compose up -d`

**Så går det till i dag** (konstaterat 2026-10-05): ingen CI, ingen staging
utöver labbet. Koden byggs på servern med `git pull && docker compose up -d
--build`, och appen startar om som en enda container — ett kort avbrott, inte
en rullande omstart. Labbet är staging tills vidare: en gren provas där innan
den slås ihop med `main`.

Produktionsservern kör Caddy framför appen (`deploy/Caddyfile`,
`docker-compose.prod.yml`).

Måste finnas stöd för:

- **Backuper** — daglig automatisk säkerhetskopia av databasen till **separat
  plats, inte samma server** (objektlagring). Kritiskt: det är kundernas tidsdata.
- **Säkerhetsuppdateringar** — OS och Docker-images uppdateras regelbundet
  (`unattended-upgrades`).
- **Uptime-övervakning** — enkel gratis monitor (t.ex. UptimeRobot) pingar tjänsten.

Kostnadsbild: VPS ca 150–350 kr/mån hos svensk leverantör, Postgres 0 kr,
Caddy 0 kr, Stripe 0 kr fast (bara procent per transaktion), domän ca
100–150 kr/år.

## 6. Faser

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
   punkt om den är ofullständig: "Tim:min, t.ex. 7:30", "Minst 10 tecken",
   "Kan inte ångras". Inte varför fältet finns.

7. **Felmeddelanden säger vad som är fel och vad som rättar det.** Ett led,
   inte tre.

8. **TID SKRIVS ALLTID SOM TIM:MIN** (bestämt 2026-10-01). "8:30", aldrig
   "8,50". Gäller varje yta kunden ser: panelen, kioskskärmen och varenda
   PDF. Saldon får sitt tecken utskrivet: "+2:15", "−0:45", "0:00".

   Decimaltimmar finns kvar, men BARA i Excel-arket. En kolumn som ska
   summeras eller multipliceras med en timpeng kan inte stå i tim:min, och
   arket finns just för att räkna vidare i. Där står båda formaten bredvid
   varandra, tim:min först.

   Skälet är en bugg: tidrapporten stod i decimaltimmar medan tabellen under
   den stod i tim:min, på samma sida om samma dag, och "1,99" lästes som 1:59
   — fyra minuter fel. Flexsaldot gick dessutom inte att justera, eftersom
   rutan visade ett format och räknade i ett annat.

   Fälten där tid skrivs in tar BÅDA formen, så att ingen behöver räkna om
   det hen just läst: "7:30" och "7,5" ger samma sak. Bara kolon skiljer
   timmar från minuter — "7.30" är sju timmar och arton minuter.

   `src/lib/format.ts` äger båda formaten, och
   `tests/format.test.ts` fäller en ny sida som visar decimaltimmar.

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
| Tick Deep | `#0F9E68` | Accent på ljust: länkar, markerat läge |
| Snö | `#F5F6F2` | Ljus bakgrund |
| Skiffer | `#5B6573` | Sekundär text |
| Lav | `#D9DDD6` | Linjer, ramar, tysta ytor |

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

Bevisas av **`tests/brand.test.ts`**: den fäller en färg utanför paletten, ett
token som glidit från guidens hexkod, och ett ordmärke som satts som text.
Samma sorts skyddsnät som `format.test.ts` och `ui-text.test.ts`, och av samma
skäl — Tailwind levererar tjugotvå färgskalor som alla är ett klassnamn bort,
och `bg-sky-600` ser lika rimlig ut i en kodgranskning som `bg-blue-600`.

## 8. Affärsmodell (kontext, inte kod)

### Pris (beslutat 2026-08-11)

**399 kr per aktiv stämplingsskärm och månad, exkl. moms.** Ingen grundavgift,
inget tak på anställda, ordrar eller stämplingar. **Ingen bindningstid.**

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

### Betalning vs bokföring

Stripe sköter prenumerationen och styr åtkomst automatiskt. Fortnox används
parallellt för bokföring och momsredovisning.

## 9. Miljöstatus (uppdatera vid ändring)

### Arbetssätt

Koden skrivs på laptopen, körs på servern. Användaren kör själv kommandon på
servern — Claude har **ingen** SSH-åtkomst och ska alltid leverera kommandon i
färdiga kodblock, ett i taget, med förklaring av vad de gör.

```
Laptop (skriva kod)  →  GitHub  →  Server: git pull + docker compose up -d
```

### Utvecklingsdator

Windows 11 Pro, projektrot `C:\Projekt\Tikkr`, PowerShell.

| Verktyg | Status per 2026-10-10 |
|---|---|
| git | ✅ 2.50.1 |
| Node.js | ✅ 24 (npm 11). Docker-imagen och CI kör Node 22 |
| Docker Desktop | ❌ ej installerat |

Konsekvens: Claude kan **typkolla och bygga lokalt** (`npm ci`,
`npx prisma generate`, `npm run typecheck`, `npm run build`), men **inte köra
testerna** — de behöver Postgres, och den finns bara på servern och i CI.
Påstå aldrig att något fungerar innan det körts där.

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
| Adress | ✅ `https://www.tikkr.se` med Let's Encrypt-certifikat. **Det är adressen som gäller** — `tikkr.terafalk.com` var det tillfälliga labbnamnet |
| Övrigt på servern | kör andra tjänster — kontrollera alltid innan portar tas |

Systemet flyttar till `portal.tikkr.se` i produktion, medan `www.tikkr.se`
förblir säljsidan. Ingenting i koden är knutet till en
adress — kopplingslänkar och omdirigeringar byggs ur inkommande anrop — så ett
byte är ett nytt proxy host plus omkopplade kioskskärmar, ingen kodändring.

**Kioskens cookie är knuten till adressen.** Byter en kund adress måste varje
skärm öppna sin kopplingslänk på nytt.

### Ej på plats än

| Sak | Status |
|---|---|
| GitHub-repo | ⏸ ska skapas av användaren (privat, namn `tikkr`) |
| Produktionsserver | ⏸ separat från testservern, senare |
| Offsite-backup (rclone-mål) | ⏸ **medvetet uppskjutet** — labbmiljö utan kunddata. Skripten finns; `BACKUP_REMOTE` sätts före lansering. |
| Uptime-övervakning | ⏸ kräver publik URL först |

### Databasen byggs ur schemat, inte ur migrationer (beslutat 2026-08-11)

Under utvecklingen finns **inga migrationsfiler**. Databasen byggs direkt ur
`prisma/schema.prisma` vid varje start (`prisma db push`). Skälet: servern
behöver då aldrig skriva till GitHub — organisationen blockerar deploy keys,
och flödet laptop → GitHub → server går bara åt ett håll.

Konsekvens: ändras schemat töms det som ändrats. Kör seed igen efteråt.
`prisma/migrations/` ligger i `.gitignore`.

Före produktion skapas en baslinjemigration, raden tas bort ur `.gitignore`,
och därefter krävs en migration vid varje schemaändring. `scripts/migrate.sh`
byter gren automatiskt så fort mappen finns. Se `docs/drift.md` punkt 1.

**Spärrar innan skarp drift** (se `docs/drift.md` punkt 7): baslinjemigration
incheckad, offsite-backup satt, repot privat, demolösenordet `tikkr123`
borttaget, testskärmens fasta token återkallad, och `./scripts/status.sh` utan
röda punkter.
