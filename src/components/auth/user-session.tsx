import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

export async function UserSession() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="border-border flex items-center gap-3 border-t px-4 py-2 sm:border-t-0 sm:border-l sm:py-0 sm:pl-3">
      <span className="text-muted-foreground truncate text-xs">
        {session.user.email}
      </span>
      <SignOutButton />
    </div>
  );
}
