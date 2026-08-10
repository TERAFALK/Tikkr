import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tikkr",
  description: "Stämplingssystem för verkstad och tillverkning",
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
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
