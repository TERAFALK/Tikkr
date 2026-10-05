# Drift — vad som måste vara på plats

Kör driftkontrollen när du undrar hur det står till. Den ändrar ingenting.

```bash
./scripts/status.sh
```

Nedan står hur varje punkt åtgärdas, i den ordning de spelar roll.

---

## 1. Hur databasen byggs

Under utvecklingen byggs databasen **direkt ur `prisma/schema.prisma`**, som
ligger i repot och skrivs på laptopen. Servern behöver därför aldrig skriva
något till GitHub — flödet går bara åt ena hållet, och en komprometterad
labbserver kan inte ändra i koden.

Priset: ändras schemat försvinner det som ändrats i databasen. Det gör inget så
länge datan är testdata — kör `seed` igen:

```bash
docker compose run --rm migrate node prisma/seed.mjs
```

### Före produktion: lås fast med en migration

`schema.prisma` beskriver hur databasen **ska** se ut. En migration beskriver
**vägen dit**, och skillnaden får betydelse först när det finns data att
förlora.

Byter vi namn på en kolumn ser ett verktyg som bara jämför nuläge mot önskat
läge att den gamla kolumnen är borta och en ny tillkommit. Slutsatsen blir:
radera den ena, skapa den andra — och innehållet försvinner. En migration säger
uttryckligen "döp om", och datan följer med.

Så här går övergången till, en gång, innan första riktiga kunden:

1. Ta bort raden `prisma/migrations/` ur `.gitignore`
2. Skapa baslinjen: `./scripts/create-migration.sh init`
3. Checka in `prisma/migrations/` — den måste ligga i repot härifrån och framåt
4. Därefter: en migration vid varje schemaändring, annars tappas data

Från och med då kör systemet migrationerna i tur och ordning vid varje start,
helt av sig självt. Ingen inställning behöver ändras — `scripts/migrate.sh`
byter gren så fort mappen finns.

> Ligger migrationerna bara på servern går databasen inte att återskapa någon
> annanstans. `./scripts/status.sh` säger ifrån om det blir så.

---

## 2. Automatisk utstämpling

**Varför det spelar roll:** utan det schemalagda jobbet stängs glömda
stämplingar aldrig. En post som ingen stämplat ut räknas upp i evighet, och
granskningslistan i adminpanelen förblir tom trots att den inte borde vara det.
Felet märks först när en rapport visar någon med 400 timmar.


Skapa loggfilen först. `/var/log` ägs av root, så cron-raden misslyckas annars
med "Permission denied" — och då finns ingen logg att felsöka i, vilket är
precis när den behövs:

```bash
sudo install -o "$USER" -g "$USER" -m 644 /dev/null /var/log/tikkr-autoclose.log
```

```bash
crontab -e
```

Lägg till raden (byt sökväg om projektet ligger någon annanstans):

```
*/15 * * * * /home/administrator/Tikkr/scripts/auto-close.sh >> /var/log/tikkr-autoclose.log 2>&1
```

Prova direkt utan att vänta:

```bash
./scripts/auto-close.sh
```

---

## 3. Säkerhetskopior till annan plats

**Varför det spelar roll:** det är kundernas tidsdata. En kopia på samma server
skyddar mot råkade raderingar, men inte mot att servern dör, blir hackad eller
krypteras — och det är just då man behöver den.

Installera rclone och koppla en objektlagring. Integritetspolicyn anger att
data lagras i Sverige — välj ett mål inom EU, helst svenskt (t.ex. Glesys
Object Storage eller Hetzner Storage Box), så att även kopiorna stämmer med
det som utlovats. Leverantören blir ett underbiträde och ska stå i
förteckningen.

```bash
sudo apt update && sudo apt install -y rclone && rclone config
```

`rclone config` ställer frågor. Gör det **två gånger**:

1. Ett mål för själva lagringen. Döp det till `lagring` och klistra in
   nyckeln du skapat hos leverantören.
2. Ett krypterat mål ovanpå. Svara `n`, döp det till `tikkr-krypterad`, välj
   typen **crypt**, ange `lagring:tikkr-backups` som remote och låt rclone
   slumpa båda lösenorden.

**Spara de två lösenorden i lösenordshanteraren, utanför servern.** Går
servern förlorad är de enda vägen in i kopiorna — utan dem är varje backup
oläsbar, även för dig.

Skriv sedan in målet i `.env`:

```bash
echo 'BACKUP_REMOTE=tikkr-krypterad:' >> .env
```

Kopior äldre än 30 dagar tas bort även där (`BACKUP_REMOTE_KEEP_DAYS`).
Integritetspolicyn ska ange samma siffra.

### Larm när jobben tystnar

Skapa två gratiskontroller hos Healthchecks.io: en för backupen (förväntad
en gång per dygn) och en för den automatiska utstämplingen (var 15:e minut).
Koppla larm till din telefon. Skriv in adresserna:

```bash
echo 'BACKUP_PING_URL=https://hc-ping.com/<din-kod>' >> .env
```

```bash
echo 'CRON_PING_URL=https://hc-ping.com/<din-andra-kod>' >> .env
```

Skripten pingar när allt gått bra och skickar `/fail` när något gått fel.
Uteblir pingen larmar tjänsten — det är så ett jobb som slutat köra upptäcks.

Testa att det fungerar, och schemalägg:

```bash
./scripts/backup.sh
```


Skapa loggfilen först. `/var/log` ägs av root, så cron-raden misslyckas annars
med "Permission denied" — och då finns ingen logg att felsöka i, vilket är
precis när den behövs:

```bash
sudo install -o "$USER" -g "$USER" -m 644 /dev/null /var/log/tikkr-backup.log
```

```bash
crontab -e
```

```
0 3 * * * /home/administrator/Tikkr/scripts/backup.sh >> /var/log/tikkr-backup.log 2>&1
```

> **Öva återläsning då och då.** En backup ingen provat att läsa tillbaka är
> bara en förhoppning. `./scripts/restore.sh <fil>` gör det — men den skriver
> över databasen, så gör det i en testmiljö. Skriptet skriver ut hur lång tid
> det tog; anteckna siffran, den är svaret på "hur länge står vi still".
>
> Hämta en kopia från det krypterade målet till labbet och läs tillbaka den:
>
> ```bash
> rclone copy tikkr-krypterad: ./backups --include 'tikkr_*.sql.gz' --max-age 2d
> ```

---

## 4. HTTPS via Nginx Proxy Manager

**Varför det spelar roll:** utan HTTPS registreras inte kioskens service worker,
och skärmen klarar då inte en omladdning under nätavbrott. Stämplingar går inte
förlorade — de ligger i kön — men skärmen visar webbläsarens felsida tills nätet
är tillbaka.

1. Peka domänens DNS (A-post) mot serverns IP
2. NPM → **Hosts → Proxy Hosts → Add Proxy Host**
3. **Scheme:** `http` · **Forward Hostname:** `tikkr-app` · **Forward Port:** `3000`
4. Slå på **Block Common Exploits** och **Websockets Support**
5. Fliken **SSL** → *Request a new SSL Certificate* + **Force SSL**

DNS måste peka rätt **innan** certifikatet begärs — Let's Encrypt besöker
adressen för att kontrollera att du äger den.

Stäng sedan den okrypterade vägen in:

```bash
sed -i 's/^APP_BIND=.*/APP_BIND=127.0.0.1/' .env && docker compose up -d
```

---

## 5. Övervakning

**Varför det spelar roll:** annars är det kunden som upptäcker att systemet
ligger nere, mitt i ett arbetspass.

Kräver publik adress (punkt 4). Skapa ett gratiskonto hos UptimeRobot eller
liknande och lägg upp en monitor mot:

```
https://DIN-ADRESS/api/health
```

Kontrollera var femte minut. Adressen svarar `200` bara när både appen och
databasen fungerar — en app som lever men inte når databasen är lika trasig ur
kundens synvinkel, och ska larma.

---

## 6. E-post

**Varför det spelar roll:** utan utskick är en kund som tappat sitt lösenord
utelåst tills någon går in i databasen åt dem. Inbjudningar till nya
administratörer måste också kopieras för hand.

Skickas via Microsoft Graph från en delad postlåda i Terafalks tenant.
Avsändaren är `noreply@tikkr.se`, svar styrs till `support@tikkr.se`.

```bash
MAIL_PROVIDER=graph
GRAPH_TENANT_ID=...
GRAPH_CLIENT_ID=...
GRAPH_CLIENT_SECRET=...
GRAPH_SENDER=noreply@tikkr.se
MAIL_REPLY_TO=support@tikkr.se
```

Lämnas `MAIL_PROVIDER` på `log` skrivs mejlen i loggen i stället för att
skickas. Det är rätt läge i labbet — inga mejl går ut av misstag till adresser
i testdata, och länken går att hämta ur loggen:

```bash
docker compose logs app | grep -A6 "E-POST"
```

### Appen får bara skicka som en enda brevlåda

`Mail.Send` som applikationsbehörighet ger rätt att skicka som **vilken
postlåda som helst** i tenanten. Hemligheten ligger i `.env` på servern — utan
begränsning skulle ett intrång där räcka för att skicka mejl i hela
organisationens namn.

Begränsningen är en åtkomstpolicy i Exchange Online, satt en gång från
laptopen:

```powershell
New-ApplicationAccessPolicy -AppId <program-id> -PolicyScopeGroupId "tikkr-utskick@tikkr.se" -AccessRight RestrictAccess -Description "Tikkr far bara skicka som noreply@tikkr.se"
```

Kontrollera att den sitter. Det första ska svara `Granted`, det andra `Denied`:

```powershell
Test-ApplicationAccessPolicy -Identity "noreply@tikkr.se" -AppId <program-id>
```

### Leverans

SPF, DKIM och DMARC måste vara satta för `tikkr.se`, annars hamnar
återställningsmejlen i skräpposten och funktionen är värdelös. DKIM slås på i
`security.microsoft.com`, inte i vanliga admin center.

---

## 7. Innan riktig kunddata

- [ ] Baslinjemigration skapad och incheckad (punkt 1)
- [ ] Lockfilen incheckad och `npm audit` utan allvarliga fynd (punkt 9)
- [ ] Offsite-backup satt upp, krypterad, och en återläsning övad (punkt 3)
- [ ] Larm för backup och automatisk utstämpling kopplade (punkt 3)
- [ ] E-post kopplad och åtkomstpolicyn kontrollerad (punkt 6)
- [ ] `APP_URL` satt till systemets adress (annars går inga återställningsmejl ut)
- [ ] Organisationsnummer och postadress ifyllda i `src/lib/legal.ts`
- [ ] Rättsliga sidorna lästa och godkända av jurist
- [ ] Adresserna till villkor och integritetspolicy inlagda i betaltjänstens
      kundportal
- [ ] Repot satt till **privat** på GitHub
- [ ] Adminlösenordet från testdatan (`tikkr123`) borttaget eller bytt
- [ ] Testskärmen från seed-datan (fast kopplingskod `123456`) raderad under Skärmar
- [ ] Produktionsservern med Caddy och `PLATFORM_ALLOWED_IPS` (punkt 8)
- [ ] `./scripts/status.sh` utan röda punkter

---

## 8. Produktionsservern

Produktionen kör Caddy framför appen, på en egen Ubuntu-server. Hela
konfigurationen ligger i `deploy/Caddyfile` och `docker-compose.prod.yml`.

1. Peka DNS för `www.tikkr.se`, `tikkr.se` och `portal.tikkr.se` mot servern
2. Installera Docker och klona repot
3. Skapa nätet appen och Caddy delar:

```bash
docker network create npm_proxy
```

4. Fyll i `.env` utifrån `.env.example`. Utöver labbets värden krävs
   `ACME_EMAIL`, `PLATFORM_ALLOWED_IPS`, `APP_URL=https://portal.tikkr.se`,
   `MARKETING_HOST=www.tikkr.se,tikkr.se`, `PORTAL_HOST=portal.tikkr.se` och
   `APP_BIND=127.0.0.1`
5. Starta:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Caddy hämtar certifikaten själv första gången. Plattformspanelen svarar 404
för alla adresser utom de i `PLATFORM_ALLOWED_IPS`.

---

## 9. Lockfilen

Utan `package-lock.json` i repot löser varje bygge versionerna på nytt. En
trasig eller komprometterad version av ett beroende går då rakt ut till alla
kunder, och det finns inget fast att granska med `npm audit`.

Skapa den på servern, där Node finns, och hämta hem den till laptopen:

```bash
docker compose run --rm --no-deps -v "$PWD:/work" -w /work migrate npm install --package-lock-only
```

```bash
docker compose run --rm --no-deps -v "$PWD:/work" -w /work migrate npm audit --omit=dev
```

Från laptopen, i projektmappen:

```powershell
scp administrator@tf-docker01-test:Tikkr/package-lock.json .
```

Checka sedan in filen. Dockerfilen använder `npm ci` så fort den finns.

---

## Vardagliga kommandon

| Vad | Kommando |
|---|---|
| Driftkontroll | `./scripts/status.sh` |
| Uppdatera till senaste | `git pull && docker compose up -d --build` |
| Loggar | `docker compose logs -f app` |
| Kör testerna | `./scripts/test.sh` |
| Ny migration | `./scripts/create-migration.sh <namn>` |
| Säkerhetskopia nu | `./scripts/backup.sh` |
