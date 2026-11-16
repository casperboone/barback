import type { Metadata } from "next";
import { AuthNotice } from "../auth-notice";

export const metadata: Metadata = { title: "Active members only" };

export default function DeniedPage() {
  return (
    <AuthNotice
      title="Only members with an active membership can log in"
      actions={[
        {
          href: "/auth/login?prompt=login",
          label: "Log in with another account",
          primary: true,
        },
      ]}
    >
      <p>
        My DWH says the account you logged in with doesn&apos;t have an active
        membership. Check your membership in My DWH, or log in with another
        account.
      </p>
    </AuthNotice>
  );
}
