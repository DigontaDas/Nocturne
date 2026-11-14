import type { Metadata } from "next";
import {
  Cinzel,
  Instrument_Serif,
  Outfit,
} from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ConciergeDrawerShell } from "@/components/ConciergeDrawerShell";
import { CustomBrassCursor } from "@/components/CustomBrassCursor";
import { PageTransitionCurtain } from "@/components/PageTransitionCurtain";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif-italic",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nocturne, Rooftop Dining Sanctuary in Dhaka",
  description:
    "Reserve your exact 14th-floor skyline seat on an interactive Banani architectural floorplan with acoustic metering, seasonal wood-fired tasting pre-orders, early bKash or card settlement, and real-time culinary guidance.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    title: "Nocturne",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${instrumentSerif.variable} ${outfit.variable}`}
    >
      <body className="bg-obsidian text-cream font-sans antialiased">
        <AppProviders>
          <CustomBrassCursor />
          <PageTransitionCurtain />
          <Navbar />
          <main>{children}</main>
          <Footer />
          <ConciergeDrawerShell />
        </AppProviders>
      </body>
    </html>
  );
}
