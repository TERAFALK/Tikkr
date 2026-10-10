# Stämplingsskärmen som tillbehör

Tikkr säljs med en färdig stämplingsskärm i stativ som tillval. Kunden kan lika
gärna använda egen hårdvara — en dator med pekskärm eller en surfplatta — och
appen fungerar identiskt. Det här dokumentet gäller den skärm vi själva
levererar.

> **Inget här är testat på hårdvara än.** Allt under Val och Specar kommer från
> tillverkarens datablad. Rader märkta **⟨verifiera⟩** ska bekräftas på den
> första fysiska enheten innan de får stå som sanning.

---

## 1. Vad som är valt, och varför

**ProDVX Android Panel PC**, monterad i eget stativ.

Kraven som styrde valet, i den ordning de väger:

1. **Inget batteri.** En surfplatta i laddare dygnet runt får svälld battericell
   inom några år. Eftersom vi säljer skärmen är det vårt garantiärende. En
   panel-PC har ingen cell och drivs från nätet.
2. **Startar av sig själv efter strömavbrott.** En verkstad ska inte behöva veta
   att någon måste trycka på en knapp.
3. **Äkta kiosklåsning.** Android *lock task mode* via device owner, satt vid
   uppsättning. Överlever omstart och går inte ur från enheten.
4. **Ljusstyrka.** Verkstadshallar har takfönster.
5. **Leveranssäkerhet över år.** Vi säljer detta som tillbehör och måste kunna
   beställa samma artikel om två år.

Elo I-Series 5 var det andra alternativet och är på pappret en bättre dator —
nyare CPU, dubbla minnet, Android 14 med uppgraderingsväg. Den föll på att PoE
är ett separat tillbehör, att OS-uppdateringarna kräver abonnement per enhet
(OS 360), och att kioskmjukvaran vi vill köra blir en sidoinstallation utanför
leverantörens egen väg. ProDVX ProSecure ger motsvarande förlängt stöd utan
kostnad.

---

## 2. Artiklar och specar

| | APPC-15XP | APPC-22XP | APPC-24X |
|---|---|---|---|
| **Artikel** | **5015210** | **5022300** | **5024200** |
| Storlek | 15,6" | 21,5" | 23,6" |
| Upplösning | 1920×1080 | 1920×1080 | 1920×1080 |
| **Ljusstyrka** | **400 cd/m²** | 250 cd/m² | 250 cd/m² |
| PoE | 802.3at (PoE+) | 802.3bt Type 3 (PoE++) | **Ingen** |
| Nätadapter | — | — | 12 V / 5 A |
| Effekt | 10–23 W | 30–45 W | 40–60 W |
| Ethernet | Gigabit | Gigabit | Gigabit |
| Vikt | — | 3,5 kg | 7,2 kg |
| Mått (mm) | 387×240×27 | 531×321×35 | 576×345×44 |
| VESA | 100 | 100 | 100 |
| PoGo-platser | 3 | 3 | 2 |
| CPU | RK3399 | RK3399 | RK3399 |
| RAM / lagring | 4 GB / eMMC | 4 GB / 16 GB | 4 GB / 16 GB |
| Temperatur | 0–40 °C | 0–40 °C | 0–40 °C |
| Garanti | 3 år | 3 år | 3 år |

Utgången artikel: **5015200** (APPC-15XP-R23). Beställ 5015210 i stället.

**Ljusstyrkan är den skarpaste skillnaden.** 15,6-tummaren är nästan dubbelt så
ljus som de större. Det talar för den lilla skärmen i en ljus hall, och är
skälet att beställa en av varje innan stativet konstrueras.

**PoE finns bara upp till 21,5".** 24-tummaren drar 40–60 W, vilket ligger över
vad PoE levererar till en enhet. Namnen säger det: `XP` betyder PoE, `X` betyder
nätadapter.

### Tillbehör via PoGo

| Artikel | Vad |
|---|---|
| 9010150 | RGB LED-list |
| 9010100 | NFC-modul |
| 9010300 | Streckkodsläsare |

LED-listen är värd en tanke: grönt sken när någon är instämplad, släckt när
ingen är, synligt tvärs över en hall. ⟨verifiera⟩ att den kan styras från
webbsidan och inte bara av en app.

### ProDVX egna bordsstativ

Referens för det egna stativet, inte förstahandsval.

| Artikel | VESA |
|---|---|
| 8010150 (DS-15) | 75/100 |
| 8010200 (DS-20) | 100 |
| 8010300 (DS-30) | 75/100 |
| 8010400 (DS-40) | 75/100 |

---

## 3. Frågor till EET innan beställning

1. **Vilken Android-version levereras?** Databladen säger 11, produktsidorna
   säger 13. Skillnaden är flera år av uppdateringar.
2. **GMS eller AOSP?** Alltså om Google Play och Chrome finns. Avgör om
   webbmotorn kan bytas — se nedan.
3. **Vilken WebView-version ligger i nuvarande firmware, och hur ofta uppdateras
   den under ProSecure?**
4. **Ingår nätadaptern** i leveransen av 5024200?
5. Pris på 5015210, 5022300, 5024200 samt 9010150.

Fråga 2 och 3 är de viktiga. Offline-kön står på service worker och IndexedDB.
Är enheten AOSP finns ingen Chrome att välja som webbmotor, och vi är bundna
till den WebView ProDVX levererar — uppdaterad två gånger om året enligt
ProSecure. Är den GMS kan Chrome sättas som WebView-leverantör, och motorn
uppdateras via Play Store oberoende av operativsystemet.

---

## 4. Vad som ska testas på första skärmen

Fyra frågor som inte går att besvara från ett datablad. Ingen av dem får antas.

| Test | Varför det avgör | Hur |
|---|---|---|
| **Handskar** | Arbetshandskar mot projicerad kapacitiv touch är ofta en dålig kombination | Kundens faktiska handskar, inte nya |
| **Ljusstyrka** | 250 mot 400 cd/m² i pilotkundens hall | Ställ 15,6" och den stora sida vid sida |
| **Service worker + IndexedDB** | Utan dem finns ingen offline-kö, och arbetstid går förlorad vid wifi-glapp | Stämpla med nätet urkopplat, starta om skärmen, koppla in nätet och se att kön töms |
| **Cookien över omstart** | Skärmens device-token ligger i en cookie. Rensas den måste varje skärm kopplas om | Omstart, och en schemalagd nattlig omstart |

Sista raden hänger på inställningarna längre ner. Testa med dem satta.

---

## 5. Montering

**Tre portar ser ut som ethernet.** Databladen listar `2x RS-232 (RJ45)` utöver
LAN-porten. Bara en av tre är nät. Märk LAN-porten vid montering, eller bygg
kabelvägen så att bara den är åtkomlig — den som drar kabeln senare kommer att
välja fel.

**Nätadaptern bor i stativets bas** på 5024200. Då går 230 V och nätverk in
underifrån och inget syns. Skärmen är fläktlös och specad för dygnetruntdrift,
så den tål att sitta instängd.

**Vikten styr konstruktionen.** 3,5 kg mot 7,2 kg är skillnad på vältmoment och
basvikt, särskilt i en hall där en pallyft kan ta i stativet. Båda är VESA 100,
så en prototyp passar båda — bara basvikten skiljer.

**Wifi är `802.11 a/b/g/n` med extern antenn.** Inget ac eller ax. Dra kabel.

**Klockbatteriet är en CR1220**, utbytbart och icke laddningsbart.

---

## 6. Uppsättning av en skärm

Varje skärm förbereds på bänken före leverans. Kunden ska kunna hänga upp den
och dra en kabel, inget mer.

### Kioskmjukvara

**Fully Kiosk Browser.** ProDVX egen `ProMGR Kiosk` är samma app under annat
namn — uppsättningskommandot i ProDVX manual avslöjar det:

```
adb shell dpm set-device-owner com.prodvx.promgr/de.ozerov.fully.DeviceOwnerReceiver
```

`de.ozerov.fully` är Fully Kiosk Browser. Att det är leverantörens egen
supportade väg är ett skäl att köra ProMGR-varianten framför den fristående.

Kostnad: Fully PLUS, **7,90 € per enhet en gång**. Ingen prenumeration.

### Steg

Enheten måste vara **fabriksfärsk eller fabriksåterställd**, och inget
Google-konto får vara tillagt — device owner kan inte sättas annars.

```bash
adb devices
adb install ProMGR-Kiosk-Browser.apk
adb shell dpm set-device-owner com.prodvx.promgr/de.ozerov.fully.DeviceOwnerReceiver
adb push fully-settings.json /sdcard/Download/fully-settings.json
adb reboot
```

⟨verifiera⟩ exakt sökväg för inställningsfilen, och att ADB över USB är öppet på
enheten från fabrik.

Fully läser tre filnamn:

| Fil | Beteende |
|---|---|
| `fully-settings.json` | manuell import |
| `fully-auto-settings.json` | läses vid **varje** appstart |
| `fully-once-settings.json` | läses en gång |

Filen kan också hämtas **från en URL**. Från version 1.43 krypteras PIN-koder
och lösenord i exporten.

**Alternativ utan kabel:** appen *Fully Kiosk Provisioner* genererar en QR-kod
som kopplar wifi, hämtar APK och inställningsfil från egna adresser och sätter
device owner i ett svep. Enheten startas i guiden genom att trycka sex gånger på
välkomstskärmen. Användbar när en kund ska rigga en ersättningsskärm själv.

### Koppla skärmen till företaget

Efter uppsättningen är skärmen en tom kiosk. Kopplingen till ett företag görs
med den sexsiffriga koden ur adminpanelen, se [kiosk-lage.md](kiosk-lage.md).
Den kan göras på bänken om vi vet vilken kund skärmen går till, annars av kunden
vid uppstart.

---

## 7. Inställningar som måste vara AV

Fem inställningar i Fully raderar var och en något som Tikkr förlitar sig på. Det
är den enskilt viktigaste tabellen i det här dokumentet.

| Inställning | Vad som går sönder |
|---|---|
| **Delete Cookies on Auto Reload** | Raderar kiosk-cookien. Skärmen tappar sin device-token och måste kopplas om |
| **Delete Webstorage on Auto Reload** | Raderar IndexedDB. **Hela offline-kön försvinner**, och ostämplad tid går inte att rekonstruera |
| **Delete Cache on Auto Reload** | Tömmer service worker-cachen. Skärmen är död vid wifi-glapp |
| **Clear Cache After Each Page** | Samma, vid varje sidladdning |
| **Pause Webview while in Background** | Kan stoppa synkförsök när skärmen går i vila |

Två fjärrkommandon får aldrig tryckas på en skärm med osynkad kö: **Clear Cache**
och **Clear Web Cookies**. Det senare återkallar i praktiken skärmens koppling.

Ska vara PÅ:

- **Start URL** — se nedan
- **Enable Kiosk Mode** med **Kiosk Mode PIN**
- **Disable Power Button**
- **Enable JavaScript Interface** — se Fjärrstyrning
- Schemalagd nattlig omstart
- Skärmen släcks aldrig, eller rörelsedetektering som väcker den

Autostart behövs inte separat. ProDVX manual säger uttryckligen att ProMGR Kiosk
Browser sköter det själv.

---

## 8. Adress per skärm

**Start URL är en parameter per enhet, aldrig en konstant i koden.** En skärm
pekas om genom att ändra Start URL och koppla om skärmen, inte genom en ny
version av appen.

| Värd | Vad | Var |
|---|---|---|
| `www.tikkr.se`, `tikkr.se` | säljsida | produktionsservern |
| `portal.tikkr.se` | systemet, för alla kunder — även pilotkunden | produktionsservern |
| `test.tikkr.se` | labbet, som också är staging | testservern |

**Pilotkunden kör i produktionen** (beslutat 2026-10-10). Vänertekno börjar om
med tom arbetsyta vid lanseringen; testdatan i labbet flyttas inte. De får
varje ny version först genom att vara först, inte genom en egen miljö. Labbet
har aldrig riktig kunddata, och det är därför det får slås sönder före en
release.

### Ordningen spelar roll

Testservern svarar idag på `www.tikkr.se` och `portal.tikkr.se`, och de namnen
tas över av produktionen. Bytet görs samma kväll: produktionen tar över
adresserna, labbet byter till `test.tikkr.se`, och **varje skärm kopplas om** —
kiosk-cookien är bunden till adressen och följer inte med till ett nytt
värdnamn eller en ny server.

---

## 9. Fjärrstyrning

### Det mesta finns redan i Tikkr

Adminpanelen listar företagets skärmar med namn och senaste kontakt
(`kiosk_devices.last_seen_at`), och kugghjulet på skärmen visar namn, antal
väntande tryck i kön och när den senast nådde servern. Det täcker det vanliga
supportsamtalet utan någon extra tjänst.

### Resten via JavaScript-bryggan — byggt

`src/lib/fully.ts` är den enda filen som vet att Fully finns. Saknas objektet
svarar den null på allt, och stämpling, offline-kö och device-token fungerar
precis som på en kunds egen dator. Bevisas av `tests/fully.test.ts`.

Så här hänger det ihop:

1. Skärmen rapporterar app- och WebView-version till `POST /api/kiosk/device`
   vid laddning. Bara skärmar med appen hör av sig.
2. `kiosk_devices.fully_version` är därmed ifylld på en Tikkr-skärm och null på
   en vanlig dator. **Det är så de skiljs åt** — en förmåga skärmen intygar,
   inte en bock någon kryssat i och glömt.
3. Adminpanelen visar ljusstyrka och **Starta om** bara för skärmar med
   `fully_version` satt. Övriga får en tom cell, ingen gråad knapp.
4. `GET /api/kiosk/state` bär tillbaka ljusstyrkan och omstartsönskemålet.
   Rutten pollas ändå var femte sekund, så en ändring i panelen syns på väggen
   nästan direkt.

Omstarten är ett **önskemål med tidsstämpel, inte en kö**: skärmen jämför med
värdet den såg sist och startar om när det ändrats medan den varit igång. Ett
önskemål som redan låg där när sidan laddades verkställs aldrig — annars hade
varje omstart lett till nästa.

Ljusstyrkan lagras 0–100 och räknas om till appens skala i `fully.ts`.
⟨verifiera⟩ att skalan är 0–255 och att `WRITE_SETTINGS` beviljas av device
owner. Blir det fel är det en rad som ändras.

Funktionerna som används:

| Funktion | Vad |
|---|---|
| `fully.getDeviceInfo()` | enhetsuppgifter, app- och WebView-version |
| `fully.restart()` | starta om appen |
| `fully.screenOn()` / `fully.screenOff()` | tända och släcka |
| `fully.setBrightness(v)` | ljusstyrka |
| `fully.bringToForeground()` | ta fram kiosken |
| `fully.getScreenshot()` | skärmbild vid support |
| `fully.exit()` | stänga appen |

Det löser problemet de andra vägarna har: **ingen inkommande anslutning behövs.**
Skärmen ringer ut till Tikkr som den redan gör. Ingen NAT-hålning, ingen broker,
ingen extra container, inget abonnement.

**Två saker måste göras rätt:**

1. **`fully` finns bara på våra stativskärmar.** På en kunds egen dator är
   objektet `undefined`. Allt som rör fjärrstyrning läggs bakom en kontroll av
   att det finns, och stämpling, offline-kö och device-token fungerar identiskt
   utan det. Annars har vi två produkter att underhålla i stället för en.
2. **JS-gränssnittet är öppet för den sida som är laddad**, och Fully varnar
   själva för att vilken laddad sida som helst kan läsa enhetsuppgifter och
   lokala filer. Det får därför bara vara påslaget i kombination med en låst
   Start URL, och ⟨verifiera⟩ om Fully kan begränsa gränssnittet till en angiven
   värd. Utan den begränsningen är en skärm som surfat fel en öppen dörr i
   verkstaden.

### Vägar vi valde bort

| Väg | Varför inte |
|---|---|
| Fully Cloud, ProMGR Cloud, EloView | abonnement per enhet. ProMGR Cloud ingår första året vid köp — dugligt att utvärdera, inte att bygga på |
| Remote Admin, REST på port 2323 | bara lokalt nät. Vi når den inte utifrån. Användbar för kundens egen IT |
| MQTT | kräver en broker, alltså en tredje container. Går emot principen om så få containrar som möjligt |

---

## 10. Öppna punkter

- [ ] Frågorna ovan till EET
- [ ] Beställ en 15,6" och en stor för jämförelse
- [ ] Testen på första skärmen, allihop
- [ ] `scripts/provision-kiosk.ps1` när ADB-flödet är bekräftat på en enhet
- [ ] Rutt som genererar `fully-settings.json` per skärm, med rätt Start URL och
      raderingsinställningarna avstängda
- [x] Fjärrstyrning bakom `fully`-detektering — ljusstyrka och omstart från
      adminpanelen. Otestat på hårdvara
- [ ] Skriv om [kiosk-lage.md](kiosk-lage.md) punkt 2 när hårdvaran är vald. Den
      rekommenderar idag Chrome plus skärmfästning, vilket är svagare än device
      owner, och nämner Fully bara i förbigående
