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

Installera rclone och koppla en objektlagring. Backblaze B2 är billigast för
den här mängden data; Hetzner Storage Box fungerar lika bra.

```bash
sudo apt update && sudo apt install -y rclone && rclone config
```

`rclone config` ställer frågor. Svara `n` för nytt mål, döp det till `b2`, välj
Backblaze B2, och klistra in nyckeln du skapat hos leverantören.

Skriv sedan in målet i `.env`:

```bash
echo 'BACKUP_REMOTE=b2:tikkr-backups' >> .env
```

Testa att det fungerar, och schemalägg:

```bash
./scripts/backup.sh
```

```bash
crontab -e
```

```
0 3 * * * /home/administrator/Tikkr/scripts/backup.sh >> /var/log/tikkr-backup.log 2>&1
```

> **Öva återläsning då och då.** En backup ingen provat att läsa tillbaka är
> bara en förhoppning. `./scripts/restore.sh <fil>` gör det — men den skriver
> över databasen, så gör det i en testmiljö.

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
- [ ] Offsite-backup satt upp (punkt 3)
- [ ] E-post kopplad och åtkomstpolicyn kontrollerad (punkt 6)
- [ ] Repot satt till **privat** på GitHub
- [ ] Adminlösenordet från testdatan (`tikkr123`) borttaget eller bytt
- [ ] Testskärmens fasta token (`demo-labb-token-…`) återkallad under Skärmar
- [ ] `./scripts/status.sh` utan röda punkter

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
