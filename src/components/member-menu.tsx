"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Member } from "@/lib/auth/member";

export function MemberMenu({ member }: { member: Member }) {
  const name = member.name ?? "Logged in";
  const firstName = name.split(" ")[0];

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-label={`${name}: account`}
          />
        }
      >
        <UserIcon />
        <span className="hidden max-w-32 truncate md:inline">{firstName}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <div className="flex flex-col gap-0.5 px-1">
          <span className="truncate font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">
            Logged in with My DWH
          </span>
        </div>
        <form action="/auth/logout" method="post">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            <LogOutIcon />
            Log out
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
