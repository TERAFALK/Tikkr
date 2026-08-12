import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tikkr",
  description: "Stämplingssystem för verkstads- och tillverkningsindustri",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Tikkr", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Låser zoom — en anställd ska aldrig råka nypa-zooma kioskskärmen sned.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body className="min-h-full bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
