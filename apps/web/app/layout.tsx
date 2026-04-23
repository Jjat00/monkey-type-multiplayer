import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SettingsProvider } from "@/lib/settings/SettingsProvider";
import { SoundProvider } from "@/lib/sound/SoundProvider";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { buildNoFlashScript } from "@/lib/theme/noFlashScript";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "keyduelo — multiplayer typing race",
  description:
    "Real-time multiplayer typing race — create a room, invite friends, race to the fastest WPM.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Apply the user's stored theme to the DOM before React hydrates.
          Prevents a "flash of default theme" if they picked a non-default one.
          suppressHydrationWarning above is for the inline-set --color-* style.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: buildNoFlashScript() }}
        />
      </head>
      <body className="min-h-dvh flex flex-col">
        <ThemeProvider>
          <SettingsProvider>
            <SoundProvider>
              <Header />
              {children}
              <Footer />
            </SoundProvider>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
