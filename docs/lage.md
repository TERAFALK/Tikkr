# Läget mot originalplanen

Uppdaterad 2026-08-12. Jämförelse mellan uppdraget som beskrevs från början och
vad som faktiskt finns byggt.

---

## Fas 0 — Grundstruktur

| Planerat | Läge |
|---|---|
| Docker + Postgres + Prisma | ✅ |
| Next.js containeriserat | ✅ |
| Datamodellen som migration | ✅ men migrationer medvetet avstängda, se `drift.md` punkt 1 |
| Multi-tenant-lagret med tester | ✅ |
| `CLAUDE.md` + README | ✅ |
| Backup-skript | ⚠️ skrivet, offsite-mål ej satt |
| HTTPS | ✅ via NPM mot `tikkr.terafalk.com`. Caddy planerad först i produktion |
| GitHub Actions → staging → SSH-deploy | ❌ ersatt av `git pull` + `docker compose up -d` |
| Uptime-övervakning | ❌ nu möjlig, publik adress finns |

## Fas 1 — Kiosk

| Planerat | Läge |
|---|---|
| Engångslänk med device-token | ✅ token hashas, flyttas till cookie |
| Namnrutnät, ett tryck, order, moment | ✅ |
| Automatisk utstämpling vid jobbyte | ✅ med tester |
| Offline-kö | ✅ med tester |
| Service worker (omladdning utan nät) | ✅ fungerar sedan HTTPS finns |
| Dokumenterat kiosk-läge | ✅ `docs/kiosk-lage.md` |

## Fas 2 — Adminpanel

| Planerat | Läge |
|---|---|
| Admin-inloggning | ✅ |
| CRUD anställda, ordrar, moment | ✅ |
| Rapportvy med filter | ✅ med tester |
| Excel-export | ✅ |
| PDF-export | ✅ underlag per order, med kundens logotyp |

## Fas 3 — Multi-tenant och onboarding

| Planerat | Läge |
|---|---|
| Signup-flöde | ✅ |
| Onboarding-guide | ✅ fyra steg, status räknas ur databasen |
| Stripe-prenumeration | ✅ kassa, kundportal, webhook och licenser per skärm |

## Fas 4 — Polish och lansering

Ej påbörjad. Designgenomgången är i praktiken redan gjord (vänsternavigering,
designsystem, kioskens formspråk). Kvar: prestandatest på riktig touchskärm och
en supportsida.

---

## Byggt utöver planen

Ungefär en tredjedel av dagens system stod inte i originaluppdraget. Det mesta
kom ur ett upptäckt hål snarare än en idé:

- **Granskningsvy** för poster systemet stängt automatiskt
- **Manuell inmatning av stämplingar** med överlappskontroll — behövdes när
  någon glömt stämpla IN, då finns ingen post att rätta
- **Flera administratörer** via inbjudningslänk — med ett konto är kunden
  utelåst för alltid om lösenordet tappas
- **Plattformspanel** med egen inloggning, siffror per kund och åtgärdslogg
- **Mejlabstraktion** förberedd för Microsoft Graph
- **Prenumerationslogik** med provperiod, respit och låsning
- **Licenser per stämplingsskärm**, där ändrat antal bekräftas hos Stripe
- **Intäktsöversikt** i plattformspanelen
- **Driftkontroll** `status.sh` och driftmanual
- **Spärrar** mot att köra tester mot skarp databas

---

## Säkerhetskraven

| Krav | Läge |
|---|---|
| 1. Multi-tenant-isolering med tester | ✅ |
| 2. Kiosk-token, återkallbar | ✅ |
| 3. Fullständig audit-logg | ✅ tidpunkt, skärm, IP |
| 4. Anomali-varningar | ⏸ markerat "senare fas" redan i originalet |
| 5. Fysisk säkerhet dokumenterad | ✅ |
| 6. HTTPS + kort request-timeout | ✅ HTTPS via NPM, åtta sekunders timeout på stämplingar |
| 7. GDPR export och radering | ✅ anonymisering plus export via rapport |

---

## Luckorna som spelar roll, i ordning

**1. Ingen staging, ingen deploy-pipeline.** Originalplanens motiv står kvar —
en trasig deploy slår mot alla kunder samtidigt. Ofarligt idag med noll kunder,
men det är den lucka som blir farligast snabbast när de första dyker upp.

**2. Ingen offsite-backup, ingen övervakning.** Medvetet uppskjutet i labbmiljö.
Övervakning är nu möjlig eftersom en publik adress finns. Båda måste vara lösta
före första kunden.

**3. Ingen tvåfaktorsautentisering.** Varken för kundadministratörer eller för
plattformskontot, som ser alla kunders driftuppgifter.

**4. Ingen lösenordsåterställning via e-post.** Mejlabstraktionen finns, men
Microsoft Graph är inte inkopplat. Tills det är gjort återställs lösenord
manuellt.

---

## Löst sedan förra genomgången

**HTTPS** (2026-08-11). Via Nginx Proxy Manager mot `tikkr.terafalk.com`, med
**Force SSL** — okrypterade anrop besvaras med `301` till HTTPS istället för att
serveras. Stängde säkerhetskrav 6 och gjorde offline-funktionen komplett:
service workern registreras inte över vanlig http, så kiosken klarade tidigare
inte en omladdning under nätavbrott.

Appen nås inte längre okrypterat på något sätt: `APP_BIND=127.0.0.1` gör att
porten bara är öppen inifrån servern, och proxyn omdirigerar http till https.

Att omdirigeringen behövdes var inte kosmetik. Cookies är märkta `Secure` i
produktionsläge, och webbläsaren vägrar spara dem över okrypterad anslutning —
en kioskskärm som öppnat kopplingslänken på `http://` hade fått "inte kopplad"
hur många gånger den än försökte, utan att något felmeddelande förklarade varför.

**Kort request-timeout** på stämplingar, åtta sekunder. En långsam server kan
inte längre få skärmen att hänga sig — trycket hamnar i kön istället.

**Tester för offline-kön** (2026-08-11). Kön lever i webbläsarens egen databas
och gick tidigare inte att testa utanför en webbläsare. Med `fake-indexeddb`
täcks nu det som måste hålla: ett tryck försvinner aldrig när servern inte
svarar, det skickas aldrig två gånger, tryck levereras i den ordning de gjordes,
och ett permanent avvisat tryck fastnar inte och blockerar resten av kön.
