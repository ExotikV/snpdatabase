"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

const links = [
  { href: "/", label: "Overview" },
  { href: "/sms-log", label: "SMS Log" },
  { href: "/manual-trigger", label: "Manual Trigger" },
  { href: "/bulk-send", label: "Bulk Send" },
  { href: "/settings/reminder-schedule", label: "Settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group min-w-0 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-xs font-bold tracking-wider text-white">
              SNP
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                SNP Detailing
              </p>
              <p className="truncate text-xs text-muted">SMS Operations</p>
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand text-white shadow-sm"
                    : "text-muted hover:bg-muted-bg hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Button variant="ghost" size="sm" onClick={handleLogout} className="ml-1">
            Log out
          </Button>
        </nav>

        <div className="flex items-center gap-2 lg:hidden">
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Log out
          </Button>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation menu"
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong bg-surface text-foreground"
          >
            <span className="sr-only">Menu</span>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              {mobileOpen ? (
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              ) : (
                <path
                  fillRule="evenodd"
                  d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 5.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
                  clipRule="evenodd"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav className="border-t border-border bg-surface px-4 py-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                    active
                      ? "bg-brand text-white"
                      : "text-muted hover:bg-muted-bg hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
