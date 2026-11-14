import { PackageIcon } from "lucide-react";
import { Fredoka } from "next/font/google";
import { redirect } from "next/navigation";
import { authMode } from "@/lib/auth/config";
import { safeNextPath } from "@/lib/auth/rules";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { BackBar } from "./back-bar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Inventory Manager" };

const display = Fredoka({ weight: ["500", "600"], subsets: ["latin"] });

// Only shown after coming back from Google without getting in.
const MESSAGES: Record<string, string> = {
  requested: "This Google account can't get in yet.",
  expired: "That sign-in took too long. Try again.",
  failed: "Google didn't confirm the sign-in. Try again.",
  unverified: "Google hasn't verified this account's email address.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const read = (key: string) =>
    typeof params[key] === "string" ? params[key] : null;
  const next = safeNextPath(read("next"));

  if (await getCurrentUser()) redirect(next);

  const message = MESSAGES[read("status") ?? read("error") ?? ""];
  const signInHref =
    next === "/"
      ? "/auth/google"
      : `/auth/google?next=${encodeURIComponent(next)}`;

  return (
    // Covers the app's header and page padding: this screen is a scene.
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0c0705] text-[#f4e9d8]">
      <BackBar className="fixed inset-0 size-full" />

      <div className="relative flex min-h-full items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-emerald-300/15 bg-[#0f0c09]/75 p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700 sm:p-8">
          <div className="flex size-11 -rotate-6 items-center justify-center rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_0_30px_-4px_rgba(16,185,129,0.65)]">
            <PackageIcon className="size-5.5" strokeWidth={2.2} />
          </div>

          <p
            className={cn(
              display.className,
              "mt-6 text-xs font-medium tracking-[0.2em] text-emerald-400 uppercase",
            )}
          >
            Back of house
          </p>
          <h1
            className={cn(
              display.className,
              "mt-1 text-[2.5rem] leading-[1.05] font-semibold",
            )}
          >
            Inventory Manager
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#cdbba3]">
            Every crate counted, every shelf stocked, and the order ready
            before last call.
          </p>

          {message && (
            <p
              role="status"
              className="mt-6 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-50"
            >
              {message}
            </p>
          )}

          {authMode() === "open" ? (
            <p className="mt-7 text-sm text-[#cdbba3]">
              Sign-in isn&apos;t set up here. Set GOOGLE_CLIENT_ID and
              GOOGLE_CLIENT_SECRET to turn it on.
            </p>
          ) : (
            <a
              href={signInHref}
              className={cn(
                display.className,
                "mt-7 flex h-12 w-full items-center gap-3 rounded-xl bg-emerald-500 pr-4 pl-1.5 text-[0.95rem] font-medium text-emerald-950 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.7)] transition hover:bg-emerald-400 focus-visible:ring-3 focus-visible:ring-emerald-300/60 focus-visible:outline-none active:translate-y-px",
              )}
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-white">
                <GoogleLogo />
              </span>
              <span className="flex-1 text-center">Sign in with Google</span>
              {/* Balances the logo, so the label sits in the middle. */}
              <span className="size-9" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4.5">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
