# Release — från main till produktion

Hur en version går ut, och hur den tas tillbaka. Samma skript gör jobbet i
labbet och i produktionen: [`scripts/release.sh`](../scripts/release.sh).

```
gren → PR → CI grön → main → nyheterna → labbet → tagg vX.Y.Z → produktionen
```

**Produktionen kör aldrig något annat än en tagg.** Taggen sätts först när
labbet har kört samma commit, och det är den som är godkännandet.

---

## Versionsnummer

`vMAJOR.MINOR.PATCH`, till exempel `v1.4.2`.

| Del | Höjs när | Exempel |
|---|---|---|
| PATCH | en rättelse **utan** databasändring | fel summa i en PDF |
| MINOR | en ny funktion, **eller vilken migration som helst** | ny kolumn, ny sida |
| MAJOR | kunden måste göra något | skärmarna måste kopplas om |

Att en migration alltid ger MINOR är med flit: numret säger då redan om
releasen rör databasen, och det är den sortens release som behöver en backup
man vet var den ligger.

---

## 1. Nyheterna

Det kunden läser under **Nyheter** i panelen. Skrivs innan versionen går till
labbet, så att texten provläses där.

1. Be Claude skriva utkastet: *"skriv nyheterna för v1.4.0"*. Claude läser
   PR:erna sedan förra taggen och lägger en post överst i
   [`src/lib/release-notes.ts`](../src/lib/release-notes.ts), i en egen PR.
2. Läs PR:en. Stryk det kunden inte märker; ändra det som är oklart. När du
   slår ihop den har du godkänt texten.
3. Datumet är dagen versionen planeras ut i produktionen.

Det som bara rör ett tillval märks med tillvalet, och visas bara för kunder
som har det. En PATCH som kunden inte märker behöver ingen post.

Texten syns i produktionen först när versionen är installerad: filen följer
med imagen, och en post för en nyare version än den som kör visas aldrig.
I labbet syns alla poster, även för versioner som inte är taggade än.

---

## 2. Labbet först

När PR:en är ihopslagen och CI grön på `main`, på labbservern:

```bash
./scripts/release.sh main
```

Prova det som ändrats, och kärnflödet: stämpla in, byt jobb, stämpla ut, ta ut
ett underlag. Läs nyheterna under **Nyheter**. `/api/health` visar vilken commit som kör, t.ex.
`main-3f2a1c9`.

> I labbet ersätter skriptet `git pull`. Mappen står efteråt på en bestämd
> commit och inte på en gren, så `git pull` säger ifrån — det är meningen.

---

## 3. Tagga

När labbet ser bra ut får commiten sitt versionsnummer. Antingen i GitHub:
**Releases → Draft a new release → Choose a tag** (skriv `v1.4.0`, *Create new
tag on publish*) → **Target: main** → **Generate release notes** → **Publish**.

Eller från laptopen, med commiten labbet kör:

```bash
gh release create v1.4.0 --target <commit> --generate-notes
```

Releaseanteckningarna på GitHub byggs av PR-titlarna och är för oss. Lägg till
en rad överst om releasen har en migration eller kräver något av kunden. Det
kunden läser är nyheterna i steg 1.

---

## 4. Produktionen

**När:** vardagkväll efter 17. Inte fredag, och inte första eller sista
arbetsdagen i månaden — då tar kunderna ut tidrapporter till lönen.

```bash
./scripts/release.sh v1.4.0
```

Skriptet visar vad som kör och vad som kommer, och frågar efter versionen
innan det gör något. Därefter, i ordning:

1. **Backup** av databasen. Filnamnet skrivs ut sist — det är
   återställningspunkten.
2. **Bygge** medan den gamla versionen kör vidare. Går det sönder har ingenting
   ändrats.
3. **Migrationer**, och sedan den nya appen. Avbrottet är några sekunder;
   skärmarna köar trycken och skickar dem efteråt.
4. **Kontroll** att `/api/health` svarar med den nya versionen.

Skriptet vägrar i produktionen:
- en gren eller `main` — bara `vX.Y.Z`
- en tagg som inte ligger på `main`
- en version utan `prisma/migrations` — den skulle bygga om databasen ur
  schemat, med dataförlust
- ändrade filer i mappen på servern

---

## 5. Kontrollera — fem minuter

- [ ] `./scripts/status.sh` utan röda punkter
- [ ] Logga in i adminpanelen
- [ ] På **kontrollkunden**: stämpla in, byt jobb, stämpla ut. Posterna syns i
      Stämplingar
- [ ] Ta ut ett underlag som PDF (pdfkit har gått sönder i bygget förut)
- [ ] Vid nästa kvart: `tail -3 /var/log/tikkr-autoclose.log` visar ett svar

**Kontrollkunden** är ett eget företag i produktionen med en egen skärm, bara
för det här. Aldrig en riktig kund: ett provtryck hos dem blir en stämpling i
deras faktura- och löneunderlag.

---

## 6. Om något går fel

### Den nya versionen fungerar inte → backa koden

```bash
./scripts/release.sh v1.3.2
```

Den förra imagen ligger kvar, så det tar under en minut. Tre äldre versioner
sparas.

Databasen följer **inte** med tillbaka, och behöver det nästan aldrig: en
migration lägger till och tar inte bort (se regeln nedan), så den gamla koden
fungerar mot den nya databasen.

### Migrationen misslyckas

Skriptet stoppar, och **den gamla appen kör vidare**. Databasen kan däremot
vara delvis ändrad.

1. Läs felet: `docker compose logs migrate`
2. Kör inte samma version igen i hopp om att det går bättre.
3. Rätta migrationen i en ny PR och släpp en ny PATCH.
4. Är databasen i ett läge som inte går att förstå: läs tillbaka backupen från
   steg 1 (nästa stycke).

### Data har blivit fel → läs tillbaka backupen

Sista utvägen. **Allt som registrerats efter backupen försvinner**, och därför
görs driftsättningar på kvällen.

```bash
./scripts/restore.sh backups/tikkr_2026-10-14_1903.sql.gz
```

Backa därefter koden till versionen som hörde till backupen.

---

## 7. Akut rättelse

Samma väg, bara snabbare: gren `fix/...` → PR → CI → `main` → labbet →
`vX.Y.Z+1` → produktionen. Hoppa aldrig över labbet; det tar fem minuter, och
en rättelse som gör det värre slår mot alla kunder på en gång.

Ligger det osläppta funktioner på `main` som inte ska ut, säg till innan något
taggas. Det är ovanligt nog att lösas när det händer.

---

## Regeln för migrationer

En migration ska fungera med **föregående** version av appen. Det är det som
gör att koden går att backa utan att röra databasen.

- **Lägg till** kolumner och tabeller — tillåtet direkt.
- **Ta bort eller döp om** — i två releaser. Först slutar koden använda
  kolumnen, sedan tas den bort i en senare release.
- **Skriva om befintliga rader** — står i PR-beskrivningen och i
  releaseanteckningen, med vad som krävs för att backa.
