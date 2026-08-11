# Läget mot originalplanen

Uppdaterad 2026-08-11. Jämförelse mellan uppdraget som beskrevs från början och
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
| Offline-kö | ✅ **men utan automatiska tester** |
| Service worker (omladdning utan nät) | ✅ fungerar sedan HTTPS finns |
| Dokumenterat kiosk-läge | ✅ `docs/kiosk-lage.md` |

## Fas 2 — Adminpanel

| Planerat | Läge |
|---|---|
| Admin-inloggning | ✅ |
| CRUD anställda, ordrar, moment | ✅ |
| Rapportvy med filter | ✅ med tester |
| Excel-export | ✅ |
| PDF-export | ⏸ medvetet uppskjutet till Fas 4 |

## Fas 3 — Multi-tenant och onboarding

| Planerat | Läge |
|---|---|
| Signup-flöde | ✅ |
| Onboarding-guide | ✅ fyra steg, status räknas ur databasen |
| Stripe-prenumeration | ❌ all åtkomstlogik klar, betalflödet väntar på konto |

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

**3. Offline-kön saknar automatiska tester.** Den enda kritiska logiken som bara
testats för hand, och den hanterar just den situation där tid annars går
förlorad.

**4. Ingen tvåfaktorsautentisering.** Varken för kundadministratörer eller för
plattformskontot, som ser alla kunders driftuppgifter.

---

## Löst sedan förra genomgången

**HTTPS** (2026-08-11). Via Nginx Proxy Manager mot `tikkr.terafalk.com`. Stängde
säkerhetskrav 6 och gjorde offline-funktionen komplett — service workern
registreras inte över vanlig http, så kiosken klarade tidigare inte en
omladdning under nätavbrott.

Appen nås inte längre okrypterat: `APP_BIND=127.0.0.1` gör att porten bara är
öppen inifrån servern, och all trafik måste gå via proxyn.

**Kort request-timeout** på stämplingar, åtta sekunder. En långsam server kan
inte längre få skärmen att hänga sig — trycket hamnar i kön istället.
