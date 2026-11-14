import type { Metadata } from "next";
import {
  Cinzel,
  Instrument_Serif,
  Outfit,
  Space_Mono,
  Syne,
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
  style: "italic",
  variable: "--font-serif-italic",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-syne",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sans",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nocturne — Rooftop Fine Dining & AI Culinary Concierge (Dhaka)",
  description:
    "Reserve your exact architectural table perspective, spin the seasonal tasting sequence, and dine at Banani Road 11's 14th-floor penthouse.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
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
      className={`${cinzel.variable} ${instrumentSerif.variable} ${syne.variable} ${outfit.variable} ${spaceMono.variable}`}
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
