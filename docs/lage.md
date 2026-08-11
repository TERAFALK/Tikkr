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
| Caddy + HTTPS mot tikkr.se | ❌ NPM används i labbet, HTTPS saknas helt |
| GitHub Actions → staging → SSH-deploy | ❌ ersatt av `git pull` + `docker compose up -d` |
| Uptime-övervakning | ❌ kräver publik adress |

## Fas 1 — Kiosk

| Planerat | Läge |
|---|---|
| Engångslänk med device-token | ✅ token hashas, flyttas till cookie |
| Namnrutnät, ett tryck, order, moment | ✅ |
| Automatisk utstämpling vid jobbyte | ✅ med tester |
| Offline-kö | ✅ **men utan automatiska tester** |
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
| 6. HTTPS + kort request-timeout | ❌ ingendera |
| 7. GDPR export och radering | ✅ anonymisering plus export via rapport |

---

## Luckorna som spelar roll, i ordning

**1. Ingen HTTPS.** Uttalat säkerhetskrav, och det blockerar offline-funktionen:
service workern registreras inte över vanlig http, så kiosken klarar inte en
omladdning under nätavbrott. Förutsättning för både övervakning och
Stripe-webhookar.

**2. Ingen staging, ingen deploy-pipeline.** Originalplanens motiv står kvar —
en trasig deploy slår mot alla kunder samtidigt. Ofarligt idag med noll kunder.

**3. Ingen offsite-backup, ingen övervakning.** Medvetet uppskjutet i labbmiljö.
Måste vara löst före första kunden.

**4. Offline-kön saknar automatiska tester.** Den enda kritiska logiken som bara
testats för hand, och den hanterar just den situation där tid annars går
förlorad.
