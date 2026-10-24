# Stämplingsskärmen som tillbehör

Tikkr säljs med en färdig stämplingsskärm i stativ som tillval. Kunden kan lika
gärna använda egen hårdvara — en dator med pekskärm eller en surfplatta — och
appen fungerar identiskt. Det här dokumentet gäller den skärm vi själva
levererar.

> **Den första skärmen, en APPC-24X, kom 2026-10-19.** Uppsättningen,
> inställningarna och offline-proven är gjorda på den. Specarna kommer från
> tillverkarens datablad. Rader märkta **⟨verifiera⟩** är fortfarande obekräftade.

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

**ProMGR Kiosk**, ProDVX egen variant av Fully Kiosk Browser. Paketet heter
`com.prodvx.promgr` men bygger på `de.ozerov.fully`, och inställningarna och
JavaScript-gränssnittet är Fullys. Den är **förinstallerad** på skärmar med
firmware A24 eller nyare; den första skärmen kom med `ProDVX_013.A26_02` och
ProMGR 1.3e.

**Licensen.** Enligt ProDVX användarmanual får skärmar i R23-serien eller nyare
en kostnadsfri ProMGR Kiosk-licens. Den kopplas till skärmens serienummer av
ProDVX och går inte att aktivera själv. **PLUS-licensen** krävs för
JavaScript-gränssnittet, och därmed för Fjärrstyrning. ⟨verifiera⟩ att PLUS
ingår utan kostnad och om en volymnyckel finns; frågat ProDVX 2026-10-24.

**ProMGR Cloud** (portalen hos ProDVX) är en årsprenumeration och behövs inte:
fjärrstyrningen sköter Tikkr. Utan prenumeration går det ändå att skapa
konfigurationer och provisioneringsprofiler. *Get Configuration from Device*
saknas då, och konfigurationen flyttas till portalen med en USB-sticka.

### Steg (provat 2026-10-24)

Mallen ligger i ProMGR-portalen: konfigurationen **Tikkr kiosk** och
profilen **Tikkr Kiosk**, metod *Pre-Install Devices*, som läser in
konfigurationen automatiskt. Profilen har en **aktiveringskod**, densamma för
varje skärm. Koden, kiosk-PIN:en och Remote Admin-lösenordet ligger i
lösenordshanteraren och aldrig i repot.

1. Fabriksåterställ skärmen, eller starta en ny.
2. I startguiden: **Start**, **Enable ProMGR**, och **Disable** för både ProDVX
   API och Autostart. Inte *Skip wizard*.
3. Efter omstarten: skriv in aktiveringskoden.
4. **Get permissions**, och godkänn allt utom kamera och mikrofon.
5. Skärmen hämtar konfigurationen och öppnar kiosken. Koppla den till
   företaget, se nedan.

Ingen ADB, ingen kabel och inget Google-konto. Startguidens *Start and upload
configuration* tar inte en Fully-export; filen kallades korrupt.

**Att ändra mallen:** ställ in skärmen, exportera under **Settings → Other
Settings → Export Settings** till en USB-sticka, och klistra in filen i
konfigurationen med **Edit JSON** i portalen. Exporten bär PIN-koden, svagt
krypterad, och läggs aldrig i repot.

**Tryck aldrig Push Configuration to Device** på en skärm som ställts in för
hand: den skriver över skärmen med portalens version. Ett kommando som skickas
medan skärmen är offline väntar och körs när den kommer tillbaka.

**Reservväg med kabel**, om startguiden saknar ProMGR:

```bash
adb install ProMGR-Kiosk-Browser.apk
adb shell dpm set-device-owner com.prodvx.promgr/de.ozerov.fully.DeviceOwnerReceiver
adb reboot
```

Konfigurationen stänger av ADB, så vägen finns bara på en återställd skärm.

### Koppla skärmen till företaget

Efter uppsättningen är skärmen en tom kiosk. Kopplingen till ett företag görs
med den sexsiffriga koden ur adminpanelen, se [kiosk-lage.md](kiosk-lage.md).
Den kan göras på bänken om vi vet vilken kund skärmen går till, annars av kunden
vid uppstart.

---

## 7. Inställningarna

Konfigurationsformuläret i portalen har bara ett tjugotal fält. Resten ställs
in på skärmen och följer sedan med i exporten. Inställningen nedan står under
menyn i parentes.

### Ska vara AV

Var och en stoppar eller raderar något som Tikkr förlitar sig på. Det är den
enskilt viktigaste tabellen i det här dokumentet.

| Inställning | Vad som går sönder |
|---|---|
| **Delete Cookies on Auto Reload** (Web Auto Reload) | Raderar kiosk-cookien. Skärmen tappar sin device-token och måste kopplas om |
| **Delete Webstorage on Auto Reload** (Web Auto Reload) | Raderar IndexedDB. **Hela offline-kön försvinner**, och ostämplad tid går inte att rekonstruera |
| **Delete Cache on Auto Reload** (Web Auto Reload) | Tömmer service worker-cachen. Skärmen är död vid wifi-glapp |
| **Clear Cache After Each Page** (Advanced Web Settings) | Samma, vid varje sidladdning |
| **Pause Webview while in Background** (Advanced Web Settings) | Kan stoppa synkförsök när skärmen går i vila |
| **Wait for Network Connection** (Web Browsing Settings) | Fully laddar ingen sida alls utan nät, och visar "Waiting for network". Tikkr får aldrig starta från skärmens egen kopia |
| **Motion Detection** | Använder kameran |

**Cache Mode** står på *Default*. *Prefer cache* kan hålla kvar gammal kod
efter en ny version.

### Ska vara PÅ

- **Start URL**, se nedan
- **Enable Kiosk Mode** med **Kiosk Mode PIN** (Kiosk Mode)
- **Disable Status Bar**, **Disable Power Button**, **Disable Camera** (Kiosk Mode)
- **Enable Lock Task Mode** (Device Owner Settings), med hemknapp, senaste
  appar och notiser av. Det är det täta låset; utan det går Androids meny att
  dra ner
- **Enable JavaScript Interface** (Advanced Web Settings), se Fjärrstyrning
- **Keep Screen On**, **Launch on Boot**, **Force Screen Orientation**
  Landscape (Device Management)
- **Auto Reload on Network Reconnect** (Web Auto Reload), se nedan

**Auto Reload on Network Reconnect är PÅ** (ändrat 2026-10-24). Den stod
bland dem som ska vara av, med skälet att Tikkr skickar kön själv. På den
första skärmen visade sig motsatsen: startade skärmen utan nät lade ProMGR ett
felläge ("ERR … disconnected") över sidan, och när nätet kom tillbaka låg det
kvar och tog emot varje tryck. Inte ens de fem trycken som öppnar ProMGR kom
fram, och bara en omstart med nät hjälpte. Omladdningen tar bort det.

Den är ofarlig sedan 2026-10-19: kön skrivs till disken innan trycket räknas
som sparat, och skärmen lägger tillbaka sin bild efter en omladdning. Det var
de två felen som gjorde att omladdningen en gång kostade väntande tryck.
*Auto Reload on Internet Reconnect* står kvar av; en omladdning räcker.

Två fjärrkommandon får aldrig skickas till en skärm med osynkad kö: **Clear
Cache** och **Clear Web Cookies**. Det senare återkallar i praktiken skärmens
koppling.

Den nattliga omstarten finns bara som schema i ProMGR Cloud och är inte satt.
Skärmen klarar sig utan.

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

### Resten via JavaScript-bryggan — byggt, och provat på hårdvara

Provat 2026-10-19 på en ProDVX APPC-24X med Fully Kiosk Browser 1.61.4 och
WebView 142.0.7444.48. Skärmen rapporterade in sig och fick knappen
Fjärrstyrning i panelen.

`src/lib/fully.ts` är den enda filen som vet att Fully finns. Saknas objektet
svarar den null på allt, och stämpling, offline-kö och device-token fungerar
precis som på en kunds egen dator. Bevisas av `tests/fully.test.ts`.

Så här hänger det ihop:

1. Skärmen rapporterar app- och WebView-version, nät och serienummer till
   `POST /api/kiosk/device` vid laddning, var femte minut och när nätet kommer
   tillbaka. Bara skärmar med appen hör av sig. Vad av anropet som får skrivas
   avgör `src/lib/kiosk-report.ts`.
2. `kiosk_devices.fully_version` är därmed ifylld på en Tikkr-skärm och null på
   en vanlig dator. **Det är så de skiljs åt** — en förmåga skärmen intygar,
   inte en bock någon kryssat i och glömt.
3. Adminpanelen visar knappen **Fjärrstyrning** bara för skärmar med
   `fully_version` satt. Övriga får ingen knapp alls, inte en gråad. Rutan
   visar enhetens uppgifter, ljusstyrka i procent och **Starta om**, som
   frågar först. Kontrollerna låg tidigare direkt på raden, och raden blev så
   bred att talet klipptes: 100 visades som 10.
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

**Serienumret syns först när Fully är device owner.** Modern Android ger inte
en vanlig app tillgång till det, vilket Fully skriver själva. Platshållare som
`unknown` visas aldrig som ett nummer.

**Wifisignalen visas som appen lämnar den.** Fully dokumenterar den som en
sträng utan skala. ⟨verifiera⟩ vad den betyder på första skärmen, och tolka den
först då.

Funktionerna som används, med namnen ur Fullys egen dokumentation av
JavaScript-gränssnittet:

| Funktion | Vad |
|---|---|
| `fully.getFullyVersion()` | appens version — det som gör skärmen till en Tikkr-skärm i panelen |
| `fully.getWebviewVersion()` | webbmotorns version |
| `fully.getSerialNumberDeviceOwner()` | serienumret, när Fully är device owner |
| `fully.getSerialNumber()` | serienumret annars, om Android lämnar ut det |
| `fully.isWifiConnected()` | om wifi är anslutet |
| `fully.isNetworkConnected()` | om något nät alls är anslutet. Anslutet utan wifi är kabel |
| `fully.getWifiSsid()` | wifinätets namn, inom citattecken |
| `fully.getWifiSignalLevel()` | signalen, som sträng |
| `fully.setScreenBrightness(int)` | ljusstyrka, `-1` för enhetens standard |
| `fully.restartApp()` | starta om appen |

Första versionen byggde på `fully.getDeviceInfo()`. Den finns bara i Fullys
fjärr-API, inte för webbsidan, och den första fysiska skärmen rapporterade
därför ingenting. Den anropade dessutom funktionerna loss-plockade från
objektet, vilket Androids WebView avvisar utan att det syns. Kontrollera ett
nytt namn mot dokumentationen, och anropa alltid som metod: `fully.restartApp()`.

Fler finns, t.ex. `turnScreenOff()`, `reboot()` och `getSerialNumber()`. Använd
dem bara när det finns ett skäl.

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

## 10. Försäljning och garanti (2026-10-20)

Skärmen säljs i butiken på `/tillbehor` och beställs i panelen, se CLAUDE.md
§ 3.4. Det kunden ser läggs upp under Produkter i plattformspanelen och nämner aldrig
tillverkaren eller modellen.

**Specarna i katalogen är avstämda mot databladet för 5024200
(APPC-24X-R23).** Databladet anger Android **11**, inte 13; därför står ingen
version i katalogen förrän den är kontrollerad på en enhet (Inställningar, Om
enheten). Nätadaptern 12 V / 5 A ingår enligt databladet. Databladet anger
dessutom reflexfritt täckglas 2 mm (över 6H), Bluetooth 5.2, stöd för IEEE
802.1X på kabel och wifi, och lagringstemperatur −10–55 °C. Certifieringar
står inte i databladet och nämns därför inte.

**Tillverkarens garanti** (Warranty and Repair Policy rev 3.0):

| | |
|---|---|
| Längd | 36 månader för den här produkttypen, räknat från **tillverkarens faktura**, inte från leveransen till kunden |
| Trasig vid leverans | inom 8 dagar från tillverkarens faktura. Hämtas av tillverkaren, ersättning faktureras och krediteras |
| Reparation | hos tillverkaren i Nederländerna. Vi betalar frakten dit, de betalar tillbaka. Normalt 10 arbetsdagar, upp till 30 om den måste till fabriken |
| Gäller inte | fysisk skada, egna ändringar, saknad eller trasig serienummeretikett, mjukvara de inte stödjer, drift utanför specifikationen |
| Utan garanti | 68 € i timmen plus delar och frakt, 50 € om inget fel hittas |

Vi lovar kunden tre år på skärm och stativ från leveransen. Glappet mellan
tillverkarens faktura och leveransen bär vi, så skärmen köps in när kunden
beställt. Stativet får inte täcka serienummeretiketten. Fråga EET om
ProMGR-appen räknas som mjukvara tillverkaren stödjer; den är deras egen
variant och borde göra det.

Under en reparation står kunden utan skärm i två till sex veckor. Överväg en
reservskärm att låna ut.

## 11. Öppna punkter

- [ ] Frågorna ovan till EET
- [ ] Beställ en 15,6" och en stor för jämförelse
- [ ] Testen på första skärmen, allihop
- [x] Uppsättning utan kabel: ProMGR:s startguide med aktiveringskod, se § 6.
      Ersätter skriptet och rutten för inställningsfiler som stod här
- [ ] PLUS-licensen på första skärmen, och svar från ProDVX om kostnad och
      volymnyckel
- [ ] Prova en andra fabriksåterställning med den uppdaterade mallen
- [x] Fjärrstyrning bakom `fully`-detektering — ljusstyrka och omstart från
      adminpanelen. Provad med fristående Fully 2026-10-19; med ProMGR väntar
      den på PLUS-licensen
- [ ] Kontrollera Android-versionen på en enhet och lägg in den i katalogen
- [ ] Riktiga produktfoton i stället för illustrationerna i
      `public/tillbehor/stamplingsskarm/`
- [ ] Skriv om [kiosk-lage.md](kiosk-lage.md) punkt 2 när hårdvaran är vald. Den
      rekommenderar idag Chrome plus skärmfästning, vilket är svagare än device
      owner, och nämner Fully bara i förbigående
