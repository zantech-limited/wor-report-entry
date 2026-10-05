"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import packageInfo from "../../package.json";
import {
  ClipboardList,
  ListFilter,
  ChartNoAxesColumn,
  FileText,
  Settings2,
  Wrench,
  Users,
  Package,
  ScanLine,
} from "lucide-react";

const LINKS = [
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

export function DeskNav() {
  const pathname = usePathname();
  return (
    <header className="border-b bg-card shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <p className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wrench className="size-4" aria-hidden="true" />
          </span>
          Service desk
          <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">v{packageInfo.version}</span>
        </p>
        <nav
          aria-label="Desk"
          className="flex w-full max-w-full gap-1 overflow-x-auto sm:w-auto"
        >
          {LINKS.map((link) => {
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
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <link.icon
                  className="hidden size-4 sm:block"
                  aria-hidden="true"
                />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
