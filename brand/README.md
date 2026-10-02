# Tikkr — varumärkesmaterial

Komplett material enligt **Tikkr brand guidelines v1.0** (oktober 2026).
Riktlinjerna i sin helhet: [`Tikkr-brand-guidelines.pdf`](Tikkr-brand-guidelines.pdf).

Den här mappen är **källan**. Filerna här ändras inte för hand — kommer en ny
version av materialet byts hela mappen ut. Det som appen faktiskt levererar
ligger kopierat i `public/`, se tabellen längst ner.

---

## Färgerna

| Namn | HEX | RGB | Roll |
|---|---|---|---|
| Fjord | `#0E1A2B` | 14, 26, 43 | Primär. Text, logotyp, mörka ytor |
| Tick | `#2ED196` | 46, 209, 150 | Accent på mörkt. Markeringar, knappar |
| Tick Deep | `#0F9E68` | 15, 158, 104 | Accent på ljusa bakgrunder |
| Snö | `#F5F6F2` | 245, 246, 242 | Ljus bakgrund |
| Skiffer | `#5B6573` | 91, 101, 115 | Sekundär text |
| Lav | `#D9DDD6` | 217, 221, 214 | Linjer, ramar, tysta ytor |

Fjord och Snö bär de flesta ytorna. **Grönt är accent och aldrig huvudfärg.**

CMYK-värdena i guiden är direkta omräkningar och ska stämmas av mot ett
tryckprov hos tryckeriet innan något trycks.

I koden: `src/lib/brand.ts` (dokumenten) och `@theme` i
`src/app/globals.css` (gränssnittet). `tests/brand.test.ts` faller om värdena
glider.

---

## Typografi

**Geist** är enda typsnittet. Fritt och öppet (SIL OFL), hämtas från Google
Fonts av `next/font` när appen byggs.

| Vikt | Används till | Knipning |
|---|---|---|
| Semibold 600 | Rubriker och ordmärket | −3 % (ordmärket −5 %) |
| Medium 500 | Knappar, etiketter, små rubriker | Etiketter versalt +8 % |
| Regular 400 | Brödtext | Radavstånd 1,5 |

---

## Logotypen

Symbolen är en cirkel delad i två: vänstra halvan är instämplingen, den högra
utstämplingen, satt en aning senare. Två halvcirklar med radie 26, åtta enheter
isär, den högra åtta enheter lägre.

| Version | När |
|---|---|
| Horisontell | Standard: webbplatser, sidhuvuden, dokument, mejlsignaturer |
| Staplad | Kvadratiska eller höga ytor: skyltar, profilprodukter, centrerade layouter |
| Symbol | Bara där varumärket redan är tydligt: app-ikon, favikon, avatarer |
| Ordmärke | Trånga liggande ytor, eller där symbolen redan syns i närheten |

**Färgsättningar:** `color` (ljus bakgrund), `reversed` (mörk bakgrund),
`navy`, `black`, `white`.

**Minsta storlek:** horisontell 25 mm / 96 px bred. Symbolen 5 mm / 16 px. Under
32 px används favikonfilen, där halvorna står en aning bredare.

**Fritt utrymme:** minst bredden av en halv symbolhalva (X) på varje sida.

### Gör inte

Sträck eller pressa den inte. Rotera den inte. Byt inte färgerna. Byt inte
plats på halvorna. Lägg inte till skuggor, toningar eller effekter. Lägg den
inte på mönstrade eller lågkontrastiga bakgrunder. **Sätt inte om ordmärket i
ett annat typsnitt** — och använd aldrig en skärmdump av logotypen.

---

## Filerna

**SVG för webb och tryck, PNG för allt annat.** Namngivning:
`tikkr-[typ]-[version]-[färgsättning]`.

| Mapp | Innehåll |
|---|---|
| `01-logo/` | Horisontell, staplad, staplad med ruta, symbol och ordmärke — i SVG och PNG |
| `02-app-icon-favicon/` | App-ikoner (rundade och kvadratiska), `favicon.ico`, `favicon.svg`, apple-touch-icon, Android-ikoner |
| `03-social/` | LinkedIn: personlig banner, företagsomslag, profilbild och delningsbild i mörkt, ljust och grönt, plus @2x |

### Vad appen levererar

Kopior, inte original. Byts materialet ut kopieras de om.

| Appens adress | Kommer från | Används av |
|---|---|---|
| `/favicon.ico` | `02-app-icon-favicon/favicon.ico` | Webbläsarfliken, 16–48 px |
| `/favicon.svg` | `02-app-icon-favicon/favicon.svg` | Webbläsarfliken, skalbart |
| `/icon.svg` | `02-app-icon-favicon/tikkr-app-icon-dark.svg` | App-ikon, `manifest.json` |
| `/apple-touch-icon.png` | `02-app-icon-favicon/apple-touch-icon-180.png` | iOS hemskärm |
| `/icon-192.png`, `/icon-512.png` | `02-app-icon-favicon/android-chrome-*.png` | Android hemskärm |
| `/icon-maskable-512.png` | `02-app-icon-favicon/tikkr-app-icon-dark-square-1024.png` | Android, som själv lägger på sin mask |
| `/og.png` | `03-social/tikkr-linkedin-share-image-1200x627-dark.png` | Delningsbild när säljsidans länk delas |
| `/brand/*.svg` | `01-logo/svg/` | Att länka till utanför appen, t.ex. i en mejlsignatur |

Gränssnittet ritar logotypen som kod i stället för att hämta en fil — se
`src/components/ui/Logo.tsx`. Banorna där är hämtade ur det här materialet
oförändrade, så att märket kan byta storlek och färg utan en fil per variant.
