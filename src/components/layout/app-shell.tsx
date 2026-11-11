"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { NAV_ITEMS } from "@/lib/navigation";
import { OWNER_NAME } from "@/lib/app";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand";

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = NAV_ITEMS.find((i) => active(i.href));

  return (
    <div className="flex min-h-dvh">
      {/* Desktop: compact sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card lg:flex">
        <Link href="/dashboard" className="flex h-16 items-center gap-3 px-5">
          <BrandMark />
          <span className="text-base font-semibold tracking-wide">MY PAY</span>
        </Link>
        <nav className="mt-2 flex-1 space-y-1 px-3" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const isActive = active(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn("size-[18px]", isActive && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-4">
          <p className="truncate text-sm font-medium">{OWNER_NAME}</p>
          <p className="truncate text-xs text-muted-foreground">Data stored on this device</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact header */}
        <header className="sticky top-0 z-30 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <BrandMark className="size-8 rounded-lg" />
              <span className="truncate text-[15px] font-semibold tracking-wide">MY PAY</span>
            </Link>
            <p className="hidden text-base font-semibold lg:block">{current?.label}</p>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link
                href="/settings"
                aria-label="Settings and profile"
                aria-current={active("/settings") ? "page" : undefined}
                className={cn("flex items-center gap-1.5 rounded-full border bg-card py-1 pl-1 pr-2.5 transition hover:bg-muted", active("/settings") && "border-ring")}
              >
                <span className="grid size-7 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">{initials(OWNER_NAME)}</span>
                <Settings className="size-4 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-12">{children}</main>
      </div>

      {/* Mobile: fixed bottom navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur-md lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {NAV_ITEMS.filter((i) => i.mobile).map((item) => {
            const isActive = active(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", isActive ? "text-primary" : "text-muted-foreground")}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", isActive && "bg-accent")}>
                  <item.icon className="size-5" />
                </span>
                {item.short}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
