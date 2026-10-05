import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DeskNav } from "@/components/desk-nav";
import { Providers } from "@/components/providers";
import "./globals.css";
import packageInfo from "../../package.json";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Monthly service reports",
  description:
    "Enter field work orders and export the Excel workbook the service desk already uses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <DeskNav />
          <main id="main-content" className="min-h-[calc(100vh-12rem)] pb-12">
            {children}
          </main>
          <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-3 border-t px-4 py-5 text-xs text-muted-foreground sm:px-6">
            <span className="fixed bottom-3 left-4 z-30 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 font-semibold text-red-700 shadow-sm">
              Internal use only
            </span>
            <p>© {new Date().getFullYear()} Zantech Limited · v{packageInfo.version}</p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
