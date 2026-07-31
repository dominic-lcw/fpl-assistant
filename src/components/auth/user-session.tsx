import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

export async function UserSession() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <SignOutButton />
    </div>
  );
}
