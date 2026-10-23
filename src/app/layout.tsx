import {PwaSetup} from "@/components/pwa-setup";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {accountsEnabled,currentActor} from "@/lib/accounts";
import {deploymentCheck} from "@/lib/startup-env";
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
  const deployment=deploymentCheck();
  let actor;
  let unavailable = deployment.blocking.length > 0;
  if(!unavailable&&accountsEnabled()&&!["/login","/setup","/offline"].includes(pathname)){
    try { actor=await currentActor(new Headers(requestHeaders)); } catch { unavailable=true; console.error("Service desk layout: database or account configuration unavailable"); }
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
          {actor?.role === "admin" && deployment.warnings.length > 0 && (
            <p role="status" className="mx-auto max-w-6xl px-4 py-3 text-sm sm:px-6">
              Deployment settings still needed: {deployment.warnings.join(", ")}. Names only; values are not shown. Mail and first-time setup stay unavailable until those are set in the host environment.
            </p>
          )}
          <main id="main-content" className="min-h-[calc(100vh-12rem)] pb-8">
            {unavailable ? <section className="mx-auto grid max-w-lg gap-4 px-4 py-12"><h1 className="text-2xl font-semibold">The shared desk is temporarily unavailable</h1>{deployment.blocking.length > 0 ? <p>This deployment is missing required settings: {deployment.blocking.join(", ")}. Set those names in the host environment. No setting values are shown here.</p> : <p>The database did not respond. On Vercel, configure PostgreSQL, Supabase or MySQL. SQLite is supported on a persistent local server.</p>}<p>Your saved device drafts remain available.</p><a className="inline-flex min-h-11 items-center rounded-lg border px-4" href="/offline">Open device drafts</a><a className="underline" href={pathname}>Try again</a></section> : children}
          </main>
          <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-4 py-5 text-xs text-muted-foreground sm:px-6">
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 font-semibold text-red-700">
              Internal use only
            </p>
            <p>© {new Date().getFullYear()} Zantech Limited · v{packageInfo.version}</p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
