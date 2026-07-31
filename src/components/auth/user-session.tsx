import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import Link from "next/link";

export async function UserSession() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {session.user.role === "admin" ? (
        <Link
          href="/admin"
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
        >
          Admin
        </Link>
      ) : null}
      <SignOutButton />
    </div>
  );
}
