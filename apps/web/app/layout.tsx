import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
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
  title: "monkey-type-multiplayer",
  description: "Multiplayer typing race inspired by Monkeytype",
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
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <Header />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
