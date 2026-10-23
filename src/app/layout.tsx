import {PwaSetup} from "@/components/pwa-setup";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {accountsEnabled,currentActor} from "@/lib/accounts";
import {databaseOutage,missingTemplate} from "@/lib/outage";
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
  title: "Zantech Service Desk",
  appleWebApp:{capable:true,statusBarStyle:"default",title:"Zantech"},
  icons:{apple:"/icons/desk-192.png"},
  description:
    "Enter field work orders and export the Excel workbook the service desk already uses.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders=await headers();
  const pathname=requestHeaders.get("x-desk-path")||"/";
  let actor;
  let unavailable = false;
  let outage = "";
  const skipAccountGate=["/login","/setup","/offline","/diagnostics"].includes(pathname);
  if(accountsEnabled()&&!skipAccountGate){
    try { actor=await currentActor(new Headers(requestHeaders)); }
    catch (error) {
      unavailable=true;
      const message = error instanceof Error ? error.message : "";
      outage = missingTemplate(message)
        ? "A required workbook template is missing from this deployment. Ask Admin to redeploy a build that includes templates/monthly-service-report.xlsm."
        : databaseOutage(message)
          ? "Ask Admin to check the database connection and deployment settings. On Vercel, configure PostgreSQL, Supabase or MySQL; SQLite is supported on a persistent local server."
          : "Ask Admin to check the deployment logs.";
      console.error("Service desk layout failed", {name: error instanceof Error ? error.name : "Unknown", code: (error as {code?: string})?.code});
    }
    if(!actor && !unavailable)redirect("/login");
    if(actor?.role==="tech"&&!pathname.startsWith("/field"))redirect("/field");
    if(!unavailable&&actor?.role!=="admin"&&["/admin","/"].includes(pathname))redirect("/field");
  }
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-3 focus:shadow"
          >
            Skip to content
          </a>
          <DeskNav role={actor?.role} accounts={accountsEnabled()} />
          <PwaSetup/>
          <main id="main-content" className="min-h-[calc(100vh-12rem)] pb-20">
            {unavailable ? <section className="mx-auto grid max-w-lg gap-4 px-4 py-12"><h1 className="text-2xl font-semibold">The shared desk is temporarily unavailable</h1><p>{outage}</p><p>Your saved device drafts remain available.</p><a className="rounded-lg border p-3" href="/offline">Open device drafts</a><a className="rounded-lg border p-3" href="/diagnostics">Admin connection diagnostics</a><p className="text-sm text-muted-foreground">Connection diagnostics does not use a database sign-in. An admin unlocks it with the ADMIN_TOKEN configured for this deployment.</p><a className="underline" href={pathname}>Try again</a></section> : children}
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
