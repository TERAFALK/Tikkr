# Tikkr — projektkontext för Claude Code

> Denna fil läses automatiskt i varje ny session. Den är den enda källan till
> projektkontext — uppdatera den när beslut ändras.

## 1. Vad Tikkr är

Ett molnbaserat **stämplingssystem för touchskärm** som svenska verkstads- och
tillverkningsföretag använder för att registrera arbetstid per **order** och
**arbetsmoment**. Domän: **tikkr.se**.

### Avgränsning — läs denna först

**Tikkr är underlag för FAKTURERING. Inte för lön.** All tid som registreras
hör till en kundorder som ska faktureras. Systemet ska aldrig utökas med
lönearter, övertidsregler, frånvaro, semester eller interna ordrar för
städning och möten — den tiden hör inte hemma här överhuvudtaget.

Konsekvenser att hålla fast vid:
- Order är alltid obligatorisk. Inget "Ingen order"-val, inga interna ordrar.
- Rapporterna svarar på "hur mycket ska kunden faktureras", inte "hur mycket
  har personen jobbat".
- En felaktig stämpling är ett fakturafel, inte ett lönefel. Allvarligt, men
  hanteras genom att admin rättar posten i efterhand.

### Kärnflöde (kiosk)

En anställd går fram till en touchskärm, trycker på sitt namn, stämplar in/ut,
väljer order och arbetsmoment (t.ex. "Svetsning"). Stämplar personen in på ett
nytt jobb stämplas hen **automatiskt ut** från det förra.

**Ingen PIN-kod. Ingen bekräftelseruta.** Ett tryck ska räcka och det ska kännas
omedelbart (optimistisk UI-uppdatering).

### Adminflöde

Administratör loggar in separat i en adminpanel, hanterar anställda/ordrar/
moment och tar ut rapporter (tid per order, person, moment) med export till
Excel/PDF.

### Multi-tenant

Flera kundföretag delar samma app-instans, men deras data är **helt isolerad**
via `company_id`-filtrering i koden.

### MVP-omfattning

- Stämplingsskärm (touch): välj namn → stämpla in/ut → välj order → välj moment
- Automatisk utstämpling vid byte av jobb
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
employees      — id, company_id, name, active
orders         — id, company_id, order_number, customer_name, status
work_moments   — id, company_id, name
time_entries   — id, company_id, employee_id, order_id, moment_id,
                 clock_in_at, clock_out_at, source,
                 needs_review, review_note, kiosk_device_id, source_ip
admin_users    — id, company_id, email, password_hash, role
kiosk_devices  — id, company_id, name, device_token, active, last_seen_at
```

### Beslutade regler för stämpling (bestämt 2026-08-10)

1. **Order och moment är obligatoriska.** All registrerad tid hör till en
   kundorder som ska faktureras — se avgränsningen överst. Inget "Ingen
   order"-val, inga interna ordrar. Konsekvens: `time_entries.order_id` och
   `moment_id` är NOT NULL, och ordrar/moment med registrerad tid går inte att
   radera (`onDelete: Restrict`) — de stängs istället.
2. **Glömd utstämpling stängs vid ett fast klockslag OCH flaggas.**
   `companies.auto_close_at` (standard "18:00", per företag) styr när. Posten
   får `source = AUTO_CLOSE`, `needs_review = true` och en `review_note` i
   klartext. Systemet gissar aldrig tyst — admin får en lista att rätta.
   Tidszon per företag, annars glider klockslaget mellan sommar- och vintertid.

Multi-tenant-isolering byggs i appens kod: **varje databasfråga går via ett
gemensamt lager** i Prisma som alltid filtrerar på inloggad användares
`company_id`. Ett enda ställe i koden, inte utspritt — och testat automatiskt.

## 4. Kritiska säkerhetskrav

1. **Multi-tenant-isolering** — all databasåtkomst via det gemensamma
   filtreringslagret. Automatiska tester ska bevisa att kund A aldrig kan se
   kund B:s data.
2. **Kiosk-token, inte PIN** — varje fysisk skärm får en lång, slumpad,
   återkallningsbar, company-scopad token vid uppsättning. Utan giltig token
   accepteras ingen stämpling.
3. **Fullständig audit-logg** — varje stämpling sparar tidsstämpel, kiosk-ID och
   IP, så admin i efterhand kan se och manuellt korrigera en felaktig stämpling.
4. **Anomali-varningar** (senare fas, ej MVP-kritiskt) — flagga t.ex.
   "instämplad på två skärmar samtidigt" för granskning.
5. **Fysisk säkerhet är en förutsättning** — modellen bygger på att skärmen
   sitter på arbetsplatsen, precis som en fysisk stämpelklocka. Var transparent
   om detta mot kunden.
6. **HTTPS + kort request-timeout** — stämpling ska kännas omedelbar men gå
   krypterat.
7. **GDPR** — adminpanelen ska stödja export och radering av en anställds data
   (rätt att bli glömd). PUB-avtal hanteras utanför koden, men bygg
   funktionaliteten.

## 5. Drift

Alla kunder delar samma server → **en** deploy-pipeline:

1. Kodändring pushas till Git
2. GitHub Actions bygger Docker-image automatiskt
3. Deploy till liten **staging-miljö** för snabb kontroll — viktigt, en trasig
   deploy slår annars mot *alla* kunder samtidigt
4. Efter godkänd staging: SSH till produktion, `docker compose pull && docker compose up -d`
5. Alla kunder har nya versionen inom sekunder, utan driftstopp (rolling restart)

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
| **1 — Kiosk** | 2–3 | Device-token-länk (engångssetup), namnrutnät med stora touchknappar, ett tryck → in/ut → order → moment, auto-utstämpling, offline-kö, dokumentera kiosk-läge (Chrome Kiosk / Android) | Fungerande kioskskärm för en testkund |
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

| Verktyg | Status per 2026-08-10 |
|---|---|
| git | ✅ 2.50.1 |
| Node.js | ❌ ej installerat — appen körs på servern istället |
| Docker Desktop | ❌ ej installerat |

Konsekvens: Claude kan **inte köra tester, bygga eller typkolla lokalt**. All
verifiering sker på servern. Påstå aldrig att något fungerar innan det körts där.

### Testserver (labbmiljö — INTE produktion)

`tf-docker01-test`, Ubuntu/Debian, Docker + Compose finns.

All utveckling sker här. Ingen riktig kunddata får läggas in. Produktion är en
separat server som sätts upp senare, mot tikkr.se.

| Sak | Status |
|---|---|
| Port 80/443 | 🔴 upptagna av **Nginx Proxy Manager** — rör dem inte |
| Port 3000 | ✅ Tikkr, men bara `127.0.0.1` — all trafik går via proxyn |
| Adress | ✅ `https://tikkr.terafalk.com` med Let's Encrypt-certifikat |
| Övrigt på servern | kör andra tjänster — kontrollera alltid innan portar tas |

Domänen blir `portal.tikkr.se` i produktion. Ingenting i koden är knutet till en
adress — kopplingslänkar och omdirigeringar byggs ur inkommande anrop — så ett
byte är ett nytt proxy host plus omkopplade kioskskärmar, ingen kodändring.

**Kioskens cookie är knuten till adressen.** Byter en kund adress måste varje
skärm öppna sin kopplingslänk på nytt.

### Ej på plats än

| Sak | Status |
|---|---|
| GitHub-repo | ⏸ ska skapas av användaren (privat, namn `tikkr`) |
| Produktionsserver | ⏸ separat från testservern, senare |
| Domän tikkr.se | ⏸ ej köpt |
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
