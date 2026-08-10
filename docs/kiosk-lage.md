# Sätta upp en stämplingsskärm hos kund

Så här går en skärm från kartong till färdig stämpelklocka.

---

## 1. Koppla skärmen

Administratören skapar skärmen i adminpanelen och får en **kopplingslänk**.
Öppna den **en gång** i skärmens webbläsare. Den skickar vidare till
stämplingsvyn, och adressen i länken försvinner ur adressfältet.

Efter det behöver ingen logga in. Skärmen kommer ihåg vilket företag den
tillhör tills någon återkallar den.

> **Länken är nyckeln till företagets stämpling.** Skicka den inte i grupp-chatt
> och skriv inte ut den på en lapp vid skärmen. Har den kommit på avvägar:
> återkalla skärmen i adminpanelen och skapa en ny. Den gamla slutar fungera
> omedelbart.

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
