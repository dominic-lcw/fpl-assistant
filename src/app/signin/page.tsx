import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";

type SignInPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const { error } = await searchParams;

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="space-y-2">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            FPL Assistant
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in with Google to continue. Access is limited to an allowlisted
            email.
          </p>
        </div>

        {error === "AccessDenied" ? (
          <p className="text-destructive text-sm" role="alert">
            Your Google account is not allowed to access this app.
          </p>
        ) : error ? (
          <p className="text-destructive text-sm" role="alert">
            Sign-in failed. Try again.
          </p>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="w-full"
        >
          <Button type="submit" size="lg" className="w-full">
            Continue with Google
          </Button>
        </form>
      </div>
    </div>
  );
}
