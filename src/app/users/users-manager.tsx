"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, UserPlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import type { User } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  addUser,
  approveUser,
  removeUser,
  type UserActionResult,
} from "./actions";

export function UsersManager({
  requests,
  members,
  ownerEmail,
  currentUserId,
}: {
  requests: User[];
  members: User[];
  ownerEmail: string;
  currentUserId: number | null;
}) {
  return (
    <div className="max-w-3xl space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Who can sign in with Google. A new account that signs in shows up
          here as a request; {ownerEmail} always has access.
        </p>
      </div>

      {requests.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-amber-300 bg-background dark:border-amber-800">
          <header className="border-b bg-amber-50 px-3 py-2 dark:bg-amber-950/40">
            <h2 className="text-sm font-semibold">
              Access requests ({requests.length})
            </h2>
          </header>
          <ul className="divide-y">
            {requests.map((user) => (
              <RequestRow key={user.id} user={user} />
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border bg-background">
        <header className="border-b bg-muted/50 px-3 py-2">
          <h2 className="text-sm font-semibold">Have access</h2>
        </header>
        <AddUserForm />
        <ul className="divide-y border-t">
          {members.map((user) => (
            <MemberRow
              key={user.id}
              user={user}
              isOwner={user.email === ownerEmail}
              isMe={user.id === currentUserId}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

// Runs an action and reports a refusal; the page refreshes itself on success.
function useUserAction() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<UserActionResult>, done?: () => void) =>
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) done?.();
        else toast.error(result.error);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That didn't work.");
      }
    });
  return [pending, run] as const;
}

function AddUserForm() {
  const [email, setEmail] = useState("");
  const [pending, run] = useUserAction();

  return (
    <form
      className="space-y-1.5 px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => addUser(email),
          () => {
            toast.success(`${email.trim()} can sign in now.`);
            setEmail("");
          },
        );
      }}
    >
      <div className="flex gap-2">
        <Input
          type="email"
          required
          placeholder="name@gmail.com"
          aria-label="Email address to add"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The Google account with this address gets in on its first sign-in.
        Name and photo fill in from Google then.
      </p>
    </form>
  );
}

function Identity({ user }: { user: User }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar name={user.name} email={user.email} image={user.image} />
      <div className="min-w-0">
        <p className="truncate font-medium">
          {user.name ?? <span className="text-muted-foreground">{user.email}</span>}
        </p>
        {user.name && (
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        )}
      </div>
    </div>
  );
}

function RequestRow({ user }: { user: User }) {
  const [pending, run] = useUserAction();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <Identity user={user} />
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          Asked {formatDate(user.createdAt)}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => removeUser(user.id))}
        >
          <XIcon />
          Decline
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => approveUser(user.id),
              () => toast.success(`${user.name ?? user.email} can sign in now.`),
            )
          }
        >
          <CheckIcon />
          Let in
        </Button>
      </div>
    </li>
  );
}

function MemberRow({
  user,
  isOwner,
  isMe,
}: {
  user: User;
  isOwner: boolean;
  isMe: boolean;
}) {
  const [pending, run] = useUserAction();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <Identity user={user} />
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {user.lastSignInAt
            ? `Last signed in ${formatDateTime(user.lastSignInAt)}`
            : "Hasn't signed in yet"}
        </span>
        {isOwner ? (
          <Badge variant="secondary">Always</Badge>
        ) : isMe ? (
          <Badge variant="secondary">You</Badge>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Take away access for ${user.name ?? user.email}?`)) {
                return;
              }
              run(() => removeUser(user.id));
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </li>
  );
}
