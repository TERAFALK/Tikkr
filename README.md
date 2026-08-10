# Tikkr

Molnbaserat stämplingssystem för touchskärm. Anställda stämplar in och ut på
order och arbetsmoment med ett enda tryck. Byggt för svenska verkstads- och
tillverkningsföretag.

Teknisk projektkontext finns i [CLAUDE.md](CLAUDE.md).

---

## Så körs det

Hela systemet är tre containrar: **appen**, **databasen** och **Caddy** (HTTPS).
Caddy tillkommer när domänen är på plats — just nu är det två.

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
docker compose exec app npx tsx prisma/seed.ts
```

Öppna sedan `http://<serverns-ip>:3000` i webbläsaren.

---

## Uppdatera till senaste versionen

```bash
git pull && docker compose up -d --build
```

Databasmigrationer körs automatiskt när appen startar — inget extra steg.

---

## Vanliga kommandon

| Vad | Kommando |
|---|---|
| Se loggar | `docker compose logs -f app` |
| Starta om appen | `docker compose restart app` |
| Stoppa allt | `docker compose down` |
| Öppna databasen | `docker compose exec db psql -U tikkr -d tikkr` |
| Köra testerna | `docker compose exec app npm test` |

---

## Lockfilen

`package-lock.json` låser fast exakta versioner av alla beroenden, så att
bygget blir identiskt varje gång. Den skapas vid första bygget. Hämta ut den
och checka in den en gång:

```bash
docker compose exec app cat package-lock.json > package-lock.json && git add package-lock.json && git commit -m "Lås beroendeversioner"
```

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
