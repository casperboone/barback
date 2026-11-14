"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOutIcon, PackageIcon, UsersIcon } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { ScrollRow } from "@/components/scroll-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import { findActiveHref } from "@/lib/section-nav";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/order-list", label: "Order list" },
  { href: "/orders", label: "Orders" },
  { href: "/pricing", label: "Pricing" },
  { href: "/catalog", label: "Catalog" },
  { href: "/financials", label: "Rust Financials" },
  { href: "/imports", label: "Imports" },
];

type HeaderUser = { name: string | null; email: string; image: string | null };

export function AppHeader({
  user,
  showNav,
  requestCount,
}: {
  user: HeaderUser | null;
  showNav: boolean;
  requestCount: number;
}) {
  const pathname = usePathname();
  const activeHref = findActiveHref(
    pathname,
    NAV.map((item) => item.href),
  );

  // The login page draws its own full-screen scene.
  if (pathname === "/login") return null;

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold"
        >
          <PackageIcon className="size-5" />
          <span className="hidden sm:inline">Inventory Manager</span>
        </Link>
        {showNav && (
          <nav
            aria-label="Main"
            // Scrolls to the screen's edge, or up to the account menu.
            className={cn("min-w-0 text-sm", user ? "flex-1" : "-mr-4")}
          >
            <ScrollRow
              activeKey={activeHref}
              className={cn("items-center gap-1", !user && "pr-4")}
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
        {user && (
          <UserMenu
            user={user}
            requestCount={requestCount}
            usersActive={pathname.startsWith("/users")}
          />
        )}
      </div>
    </header>
  );
}

function UserMenu({
  user,
  requestCount,
  usersActive,
}: {
  user: HeaderUser;
  requestCount: number;
  usersActive: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={
          requestCount > 0
            ? `Account menu, ${requestCount} access requests`
            : "Account menu"
        }
        className="relative ml-auto shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <UserAvatar name={user.name} email={user.email} image={user.image} />
        {/* Someone is waiting to be let in. */}
        {requestCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-background" />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <div className="px-2 py-1.5">
          {user.name && <p className="truncate font-medium">{user.name}</p>}
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Link
          href="/users"
          aria-current={usersActive ? "page" : undefined}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
        >
          <UsersIcon className="size-4 text-muted-foreground" />
          Users
          {requestCount > 0 && (
            <Badge className="ml-auto bg-amber-500 text-white">
              {requestCount} {requestCount === 1 ? "request" : "requests"}
            </Badge>
          )}
        </Link>
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start px-2 font-normal"
          >
            <LogOutIcon className="text-muted-foreground" />
            Sign out
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
