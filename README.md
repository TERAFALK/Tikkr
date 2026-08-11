# Tikkr

Molnbaserat stämplingssystem för touchskärm. Anställda stämplar in och ut på
order och arbetsmoment med ett enda tryck. Byggt för svenska verkstads- och
tillverkningsföretag.

Teknisk projektkontext finns i [CLAUDE.md](CLAUDE.md).

---

## Så körs det

Två containrar: **appen** och **databasen**.

HTTPS sköts av den **Nginx Proxy Manager** som redan kör på servern. Ingen egen
Caddy alltså — NPM gör samma jobb och äger redan port 80/443. Två program kan
inte dela de portarna.

```
Din laptop  →  GitHub  →  Servern: git pull + docker compose up -d
 (skriva kod)   (kodens hem)        (här kör det på riktigt)
```

---

## Första uppsättningen på servern

Kräver Docker och Docker Compose. Kör allt i den mapp du vill ha projektet i.

**1. Hämta koden**

```bash
git clone <repo-url> tikkr && cd tikkr
```

**2. Skapa inställningsfilen**

```bash
cp .env.example .env
```

**3. Sätt ett riktigt databaslösenord**

```bash
sed -i "s|byt-ut-mig|$(openssl rand -base64 32 | tr -d '/+=')|g" .env && grep POSTGRES_PASSWORD .env
```

**4. Starta**

```bash
docker compose up -d --build
```

Första bygget tar några minuter. Därefter går det på sekunder.

**5. Kontrollera att det lever**

```bash
curl -s localhost:3000/api/health
```

Ska svara `{"status":"ok","database":"ok"}`. Svarar den `unreachable` når appen
inte databasen — kolla `docker compose logs db`.

**6. Lägg in testdata**

```bash
docker compose run --rm migrate node prisma/seed.mjs
```

`migrate`-containern innehåller alla utvecklingsverktyg och används för
engångskommandon. Appcontainern är medvetet avskalad och har dem inte.

Öppna sedan `http://<serverns-ip>:3000` i webbläsaren.

---

## Koppla in en domän via Nginx Proxy Manager

När Tikkr ska nås på en riktig adress med HTTPS istället för `IP:3000`:

Tikkr ansluter till NPM:s Docker-nätverk `npm_proxy`, så proxyn når appen på
containernamnet `tikkr-app`. Databasen ligger inte på det nätet och är därmed
onåbar därifrån.

1. Peka domänens DNS (A-post) mot serverns IP-adress
2. Öppna Nginx Proxy Manager → **Hosts → Proxy Hosts → Add Proxy Host**
3. **Domain Names:** din adress · **Scheme:** `http` · **Forward Hostname:**
   `tikkr-app` · **Forward Port:** `3000`
4. Slå på **Block Common Exploits** och **Websockets Support**
5. Fliken **SSL** → *Request a new SSL Certificate*, kryssa i **Force SSL**

Heter NPM:s nätverk något annat hos dig, ändra `npm_proxy` längst ner i
`docker-compose.yml`. Hitta namnet med:

```bash
docker inspect <npm-container> -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

När domänen fungerar: sätt `APP_BIND=127.0.0.1` i `.env` och kör
`docker compose up -d`. Då måste all trafik gå via HTTPS och appen kan inte
längre nås okrypterad på `IP:3000`.

---

## Uppdatera till senaste versionen

```bash
git pull && docker compose up -d --build
```

Databasmigrationer körs automatiskt när appen startar — inget extra steg.

---

## Drift

Vad som måste vara på plats — migrationer i git, schemalagd autoutstämpling,
offsite-backup, HTTPS och övervakning — står i [docs/drift.md](docs/drift.md).

Se läget just nu:

```bash
./scripts/status.sh
```

---

## Vanliga kommandon

| Vad | Kommando |
|---|---|
| Se loggar | `docker compose logs -f app` |
| Starta om appen | `docker compose restart app` |
| Stoppa allt | `docker compose down` |
| Öppna databasen | `docker compose exec db psql -U tikkr -d tikkr` |
| Köra testerna | `./scripts/test.sh` |
| Lägga in testdata | `docker compose run --rm migrate node prisma/seed.mjs` |

---

## Lockfilen

`package-lock.json` låser fast exakta versioner av alla beroenden, så att
bygget blir identiskt varje gång. Den skapas vid första bygget. Hämta ut den
och checka in den en gång:

```bash
docker compose exec app cat package-lock.json > package-lock.json && git add package-lock.json && git commit -m "Lås beroendeversioner"
```

---

## När behöver jag bygga om?

Koden kopieras in i imagen när den byggs. Ändrar du en fil efteråt kör
containern den gamla kopian tills du bygger om.

| Vad du ändrat | Bygga om? |
|---|---|
| `src/` eller `tests/`, och kör `./scripts/test.sh` | Nej — mapparna monteras in |
| `src/`, och vill se det i webbläsaren | Ja |
| `prisma/schema.prisma` | Ja |
| `package.json` | Ja |

```bash
docker compose up -d --build
```

**Vid ändrad datamodell** räcker samma kommando. Databasen byggs om ur schemat
vid uppstart, och det som ändrats töms — lägg tillbaka testdatan efteråt:

```bash
docker compose run --rm migrate node prisma/seed.mjs
```

Det gäller under utvecklingen. Före produktion låses databasen fast med
migrationer, se [docs/drift.md](docs/drift.md).

---

## Säkerhet

Två saker är kritiska och ska aldrig ändras utan eftertanke:

**Multi-tenant-isolering.** Alla kundföretag delar samma databas. All
databasåtkomst går via `forCompany()` i [src/lib/tenant.ts](src/lib/tenant.ts),
som tvingar på filtrering per företag. Skriv aldrig databasfrågor utanför det
lagret. `tests/tenant-isolation.test.ts` bevisar att det håller.

**Lägger du till en ny tabell** med `company_id` i `prisma/schema.prisma` måste
den också läggas till i `TENANT_SCOPED_MODELS` i `src/lib/tenant.ts`. Glömmer du
det går testet `tenant-coverage.test.ts` sönder — avsiktligt.

---

## Status

| Fas | Innehåll | Status |
|---|---|---|
| 0 | Grundstruktur, databas, multi-tenant-lager, Docker | pågår |
| 1 | Stämplingsskärm (kiosk) | ej påbörjad |
| 2 | Adminpanel och rapporter | ej påbörjad |
| 3 | Självregistrering och Stripe | ej påbörjad |
| 4 | Design och lansering | ej påbörjad |
