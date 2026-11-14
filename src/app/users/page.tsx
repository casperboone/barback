import { OWNER_EMAIL } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import { UsersManager } from "./users-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users · Inventory Manager" };

export default async function UsersPage() {
  const [all, me] = await Promise.all([listUsers(), getCurrentUser()]);

  return (
    <UsersManager
      requests={all.filter((user) => user.status === "requested")}
      members={all.filter((user) => user.status === "approved")}
      ownerEmail={OWNER_EMAIL}
      currentUserId={me?.id ?? null}
    />
  );
}
