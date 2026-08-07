import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function PendingPage() {
  const session = await auth();
  const user = session?.user;

  if (!user) redirect("/signin");
  if (user.status === "approved") redirect("/");

  const message =
    user.status === "rejected"
      ? "Your access request was not approved."
      : user.status === "revoked"
        ? "Your access has been revoked. Contact an administrator if you believe this is a mistake."
        : "Your request has been received. An administrator must approve your account before you can use the app.";

  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4">
      <section className="border-border bg-card w-full max-w-md rounded-xl border p-6 text-center shadow-sm">
        <h1 className="text-foreground text-xl font-semibold">
          Access pending
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">{message}</p>
        <p className="text-muted-foreground mt-2 text-xs">{user.email}</p>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <Button type="submit" variant="outline">
            Use another Google account
          </Button>
        </form>
      </section>
    </main>
  );
}
