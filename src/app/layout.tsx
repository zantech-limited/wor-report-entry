import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DeskNav } from "@/components/desk-nav";
import { Providers } from "@/components/providers";
import "./globals.css";

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <DeskNav />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
