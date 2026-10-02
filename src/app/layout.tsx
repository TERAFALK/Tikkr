import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * TYPSNITTET.
 *
 * Geist är enda typsnittet enligt Tikkr brand guidelines v1.0. Det är fritt och
 * öppet (SIL OFL) och finns hos Google Fonts.
 *
 * `next/font` laddar ner filerna NÄR APPEN BYGGS och lägger dem bland appens
 * egna statiska filer. Två skäl:
 *
 * 1. **Kiosken får inte tappa typsnittet när nätet gör det.** En stämpelskärm
 *    som hämtar sitt typsnitt från en annan domän byter utseende varje gång
 *    wifit hackar, och service workern kan bara spara det som ligger på vår
 *    egen adress.
 * 2. **Inga anrop till tredje part.** Besökaren på säljsidan ska inte lämna
 *    spår hos Google för att läsa om en stämpelklocka, och det är en mening
 *    mindre att förklara i integritetspolicyn.
 *
 * Konsekvens för drift: BYGGET behöver nå fonts.gstatic.com. Det gör GitHub
 * Actions. Byggs imagen någon gång på en maskin utan nät faller bygget — det är
 * avsiktligt synligt och inte något som tystnar till ett fel i efterhand.
 *
 * Ingen `weight` anges. Geist är ett variabelt typsnitt, alltså EN fil som bär
 * hela viktskalan, och att räkna upp vikter skulle i bästa fall ge tre filer i
 * stället för en. Guidens tre vikter — 400 brödtext, 500 knappar och etiketter,
 * 600 rubriker — sätts som vanligt med `font-medium` och `font-semibold`.
 */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

/**
 * Geist Mono, samma familj.
 *
 * Används till säljsidans små versala etiketter och till kopplingskoden, där
 * siffror måste stå i spalt för att gå att läsa högt för någon i telefon.
 */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tikkr",
  description: "Stämplingssystem för verkstads- och tillverkningsindustri",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Tikkr", statusBarStyle: "black-translucent" },
  /*
    Tre ikoner och inte en.

    `favicon.ico` finns för att en webbläsare som inte förstår SVG hämtar den
    ändå, och för att den innehåller 16-, 32- och 48-pixelsvarianter som är
    ritade för de storlekarna — halvorna står en aning bredare, annars
    försvinner skarven i en flik. `favicon.svg` är samma märke skalbart, och
    den moderna webbläsaren tar den.

    App-ikonen — symbolen i en rundad Fjord-ruta — ligger i `manifest.json`
    tillsammans med sina PNG-storlekar, eftersom det är manifestet en telefon
    läser när skärmen läggs på hemskärmen. Här står bara Apples, som hämtas
    utan manifest.
  */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  /*
    Bilden som visas när någon delar en länk till säljsidan. Hämtad ur
    varumärkesmaterialets delningsbild, 1200×627 på Fjord.
  */
  openGraph: {
    title: "Tikkr",
    description: "Stämpla in. Stämpla ut. Klart.",
    siteName: "Tikkr",
    locale: "sv_SE",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 627 }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Låser zoom — en anställd ska aldrig råka nypa-zooma kioskskärmen sned.
  maximumScale: 1,
  userScalable: false,
  // Adressfältet på en telefon, och ramen runt en app på hemskärmen: Fjord.
  themeColor: "#0E1A2B",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-full bg-neutral-50 font-sans text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
