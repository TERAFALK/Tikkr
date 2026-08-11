# Drift — vad som måste vara på plats

Kör driftkontrollen när du undrar hur det står till. Den ändrar ingenting.

```bash
./scripts/status.sh
```

Nedan står hur varje punkt åtgärdas, i den ordning de spelar roll.

---

## 1. Migrationerna i git

**Varför det spelar roll:** migrationsfilerna beskriver hur databasens tabeller
byggs upp. Finns de bara på servern går databasen inte att återskapa någon
annanstans — inte på en produktionsserver, inte om labbservern går förlorad.
Det är den enda punkten som är obotlig om det går fel.

Servern behöver kunna skriva till GitHub. Ge den en egen nyckel som bara gäller
det här repot:

```bash
ssh-keygen -t ed25519 -C "tf-docker01-test" -f ~/.ssh/id_ed25519 -N "" && cat ~/.ssh/id_ed25519.pub
```

Kopiera raden som skrivs ut → GitHub → repots **Settings → Deploy keys → Add
deploy key** → klistra in → kryssa i **Allow write access** → spara.

> Klistra bara in `.pub`-raden. Den hemliga halvan ligger kvar på servern och
> ska aldrig lämna den.

Byt sedan till nyckeln och skicka upp migrationerna:

```bash
git remote set-url origin git@github.com:TERAFALK/Tikkr.git
git config user.name "Adrian Falk" && git config user.email "adrian@terafalk.com"
git add prisma/migrations && git commit -m "Migrationer" && git push
```

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

## 6. Innan riktig kunddata

- [ ] Repot satt till **privat** på GitHub
- [ ] Adminlösenordet från testdatan (`tikkr123`) borttaget eller bytt
- [ ] Testskärmens fasta token (`demo-labb-token-…`) återkallad under Skärmar
- [ ] Punkt 1–5 ovan gröna i `./scripts/status.sh`

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
