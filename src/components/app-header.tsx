"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { MemberMenu } from "@/components/member-menu";
import { ScrollRow } from "@/components/scroll-row";
import type { Member } from "@/lib/auth/member";
import { findActiveHref } from "@/lib/section-nav";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/order-list", label: "Order list" },
  { href: "/orders", label: "Orders" },
  { href: "/pricing", label: "Pricing" },
  { href: "/catalog", label: "Catalog" },
  { href: "/financials", label: "Rust Financials" },
  { href: "/imports", label: "Imports" },
  // What needs doing, from all of the above.
  { href: "/attention", label: "Attention" },
];

export function AppHeader({ member }: { member: Member | null }) {
  const pathname = usePathname();
  // The pages around logging in are for people who aren't in yet.
  const loggedOutPage = pathname === "/auth" || pathname.startsWith("/auth/");
  const activeHref = findActiveHref(
    pathname,
    NAV.map((item) => item.href),
  );

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold"
        >
          <PackageIcon className="size-5" />
          <span className="hidden sm:inline">BarBack</span>
        </Link>
        {!loggedOutPage && (
          <nav
            aria-label="Main"
            // Without the menu, the row scrolls right up to the screen edge.
            className={cn("min-w-0 flex-1 text-sm", !member && "-mr-4")}
          >
            <ScrollRow
              activeKey={activeHref}
              className={cn("items-center gap-1", !member && "pr-4")}
            >
              {NAV.map((item) => {
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    data-active={active || undefined}
                    className={cn(
                      "shrink-0 rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      active && "bg-muted text-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </ScrollRow>
          </nav>
        )}
        {member && !loggedOutPage && (
          <div className="-mr-2 ml-auto shrink-0">
            <MemberMenu member={member} />
          </div>
        )}
      </div>
    </header>
  );
}
