import type { Metadata } from "next";
import { AuthNotice } from "../auth-notice";

export const metadata: Metadata = { title: "Logged out" };

export default function LoggedOutPage() {
  return (
    <AuthNotice
      title="You're logged out of BarBack"
      actions={[
        { href: "/auth/login", label: "Log in again", primary: true },
        { href: "/auth/login?prompt=login", label: "Log in as someone else" },
      ]}
    >
      <p>
        You&apos;re still logged in to My DWH, so logging in again takes you
        straight back. On a shared device, log out of My DWH as well.
      </p>
    </AuthNotice>
  );
}
