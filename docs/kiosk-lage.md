# Sätta upp en stämplingsskärm hos kund

Så här går en skärm från kartong till färdig stämpelklocka.

---

## 1. Koppla skärmen

Administratören lägger upp skärmen i adminpanelen under **Stämplingsskärmar**
och får en **sexsiffrig kod**.

På skärmen som ska användas:

1. Surfa till `portal.tikkr.se/kiosk`
2. Knappa in koden
3. Skärmen visar sitt namn och går vidare till stämplingsvyn

Koden gäller i **fem minuter**, kopplar **en enda** skärm och är förbrukad i
samma stund den använts. Har den gått ut skapas en ny med **Koppla om** i
panelen.

Efter kopplingen behöver ingen logga in. Skärmen kommer ihåg vilket företag den
tillhör tills någon kopplar om eller raderar den.

> **Har enheten bytts ut, tömts eller kommit bort:** tryck **Koppla om** i
> adminpanelen. Den gamla enheten slutar fungera omedelbart, medan skärmens
> namn, historik och licens är kvar.

Skärmen kan också kopplas loss på plats: tryck **kugghjulet** uppe i hörnet och
välj **Koppla loss skärmen**. Samma ruta visar skärmens namn, hur många
stämplingar som väntar i kön och när den senast nådde servern — det som behövs
vid ett supportsamtal.

---

## 2. Låsa fast skärmen i helskärm

Utan det här kan vem som helst trycka sig ur appen och surfa på nätet.

### Android-surfplatta (vanligast)

Enklaste vägen är webbläsarens eget helskärmsläge:

1. Öppna stämplingsvyn i Chrome
2. Meny → **Lägg till på startskärmen**
3. Starta från den nya ikonen — appen öppnas utan adressfält
4. Slå på **Skärmfästning**: Inställningar → Säkerhet → Skärmfästning, fäst
   sedan appen från översiktsvyn

Behöver du hårdare låsning finns särskilda kioskappar (t.ex. Fully Kiosk
Browser). De kan också hålla skärmen tänd och starta appen automatiskt efter
strömavbrott — värt det på en skärm som ska stå i åratal.

### Windows- eller Linux-dator med pekskärm

Starta Chrome i kioskläge:

```
chrome.exe --kiosk --app=https://DIN-ADRESS/kiosk
```

Lägg kommandot i autostart så kommer skärmen upp av sig själv efter
strömavbrott.

### iPad

Öppna sidan i Safari → Dela → **Lägg till på hemskärmen**. Aktivera sedan
**Guidad åtkomst**: Inställningar → Hjälpmedel → Guidad åtkomst. Starta den med
trippelklick på sidoknappen när appen är öppen.

---

## 3. Inställningar som gör vardagen bättre

**Låt skärmen vara tänd.** En skärm som slocknar kräver ett extra tryck, och då
börjar folk strunta i att stämpla. Ställ in "skärmen släcks aldrig" och sätt
skärmen i en laddare.

**Fast strömtillförsel.** Ett tomt batteri är den vanligaste orsaken till att en
stämpelskärm slutar användas.

**Eget wifi-nät om möjligt.** Stämplingen fungerar utan nät — trycken sparas och
skickas när det är tillbaka — men ju stabilare nät, desto färre poster behöver
någon titta på i efterhand.

---

## 4. Vad som händer när nätet ligger nere

Stämplingen fungerar. Varje tryck sparas i skärmen och skickas när nätet är
tillbaka. En ruta uppe till höger visar hur många som väntar.

Två saker att känna till:

- **Ladda inte om sidan under ett avbrott** om skärmen körs över vanlig http.
  Helskärmslösningen ovan gör att det inte händer av misstag. Körs skärmen över
  https klarar den även omladdning.
- **Tiden som registreras är när personen tryckte**, inte när stämplingen kom
  fram. Fakturaunderlaget blir alltså rätt oavsett hur länge nätet var borta.

---

## 5. Om någon glömmer stämpla ut

Systemet stänger posten vid företagets inställda klockslag — standard **18:00**,
ändras per företag — och **flaggar den för granskning**. Admin ser en lista över
sådana poster och rättar tiden innan fakturering.

Systemet gissar alltså för att underlaget ska gå att använda, men talar alltid
om att det gissat.
