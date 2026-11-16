import type { Metadata } from "next";
import { AuthNotice } from "../auth-notice";

export const metadata: Metadata = { title: "Couldn't log in" };

const MESSAGES: Record<string, string> = {
  expired:
    "The login took too long or was started in another browser. Try again from here.",
  unreachable: "My DWH can't be reached right now. Try again in a moment.",
};

export default async function LoginErrorPage({
  searchParams,
}: PageProps<"/auth/error">) {
  const { reason } = await searchParams;
  const message =
    (typeof reason === "string" && MESSAGES[reason]) ||
    "Something went wrong while logging in with My DWH. Try again.";

  return (
    <AuthNotice
      title="Couldn't log in"
      actions={[{ href: "/auth/login", label: "Try again", primary: true }]}
    >
      <p>{message}</p>
    </AuthNotice>
  );
}
