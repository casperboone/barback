import type { Metadata } from "next";
import { safeNextPath } from "@/lib/auth/rules";
import { AuthNotice } from "./auth-notice";

export const metadata: Metadata = { title: "Log in" };

// Where the proxy sends anyone opening a page without a login, so they see
// where they're going before landing on My DWH.
export default async function LoginPage({ searchParams }: PageProps<"/auth">) {
  const { next } = await searchParams;
  const path = safeNextPath(typeof next === "string" ? next : null);
  const href =
    path === "/"
      ? "/auth/login"
      : `/auth/login?${new URLSearchParams({ next: path })}`;

  return (
    <AuthNotice
      title="Log in to BarBack"
      actions={[{ href, label: "Log in with My DWH", primary: true }]}
    />
  );
}
