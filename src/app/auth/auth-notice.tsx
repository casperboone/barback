import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

// The few screens around logging in: a short message and where to go next.
// The links go to route handlers that redirect to My DWH, so they're plain
// anchors, never prefetched.
export function AuthNotice({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions: { href: string; label: string; primary?: boolean }[];
}) {
  return (
    <div className="mx-auto mt-12 flex max-w-md flex-col gap-4 rounded-xl border bg-background p-6 shadow-sm sm:mt-20">
      <h1 className="text-lg font-semibold">{title}</h1>
      {children && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          {children}
        </div>
      )}
      <div className={children ? "flex flex-wrap gap-2 pt-2" : "flex flex-wrap gap-2"}>
        {actions.map((action) => (
          <Button
            key={action.href}
            variant={action.primary ? "default" : "outline"}
            nativeButton={false}
            render={<a href={action.href} />}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
