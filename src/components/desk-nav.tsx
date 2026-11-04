"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { endDeskSession } from "@/lib/end-desk-session";
import packageInfo from "../../package.json";
import {
  ClipboardList,
  ListFilter,
  ChartNoAxesColumn,
  FileText,
  Settings2,
  Users,
  Package,
  ScanLine,
  type LucideIcon,
} from "lucide-react";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Entry", icon: ClipboardList },
  { href: "/master", label: "Master", icon: ListFilter },
  { href: "/statistics", label: "Statistics", icon: ChartNoAxesColumn },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/technicians", label: "Technicians", icon: Users },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/parts", label: "Parts", icon: Package },
  { href: "/prefixes", label: "Prefixes", icon: ScanLine },
  { href: "/admin", label: "Admin", icon: Settings2 },
];

function linksFor(role: string | undefined, accounts: boolean) {
  if (!accounts) return LINKS;
  const field = {
    href: "/field",
    label: "Field service",
    icon: ClipboardList,
  };
  if (role === "tech") return [field];
  if (role)
    return [
      field,
      ...LINKS.filter(
        (link) => role === "admin" || !["/", "/admin"].includes(link.href),
      ),
    ];
  return [];
}

function LogOutButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className={className}>
      <button
        type="button"
        className="inline-flex min-h-11 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-lg border-2 border-foreground bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void endDeskSession().catch((reason: unknown) => {
            setBusy(false);
            setError(
              reason instanceof Error
                ? reason.message
                : "The server did not end this session. You are still signed in.",
            );
          });
        }}
      >
        {busy ? "Signing out…" : "Log out"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function DeskNav({
  role,
  accounts = false,
}: {
  role?: string;
  accounts?: boolean;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = linksFor(role, accounts);
  const signedIn = accounts && !!role;
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  return (
    <header className="border-b bg-card shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <p className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <Image
            src="/icons/zantech-logo.png"
            alt="Zantech"
            width={44}
            height={44}
            priority
            unoptimized
            className="size-11 shrink-0"
          />
          Service desk
          <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            v{packageInfo.version}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <nav
            aria-label="Desk"
            className="hidden max-w-full gap-1 overflow-x-auto sm:flex"
          >
            {links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <link.icon className="size-4" aria-hidden="true" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {signedIn && <LogOutButton className="hidden sm:block" />}
          {(links.length > 0 || signedIn) && (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-lg border-2 border-foreground px-4 text-sm font-semibold sm:hidden"
              aria-expanded={menuOpen}
              aria-controls="desk-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? "Close" : "Menu"}
            </button>
          )}
        </div>
        {menuOpen && (
          <nav
            id="desk-menu"
            aria-label="Desk menu"
            className="grid w-full gap-2 sm:hidden"
          >
            {links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "border text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            {signedIn && <LogOutButton />}
          </nav>
        )}
      </div>
    </header>
  );
}
