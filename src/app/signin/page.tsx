import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInGoogleButton } from "@/components/auth/sign-in-google-button";

type SignInPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function signInErrorMessage(error?: string) {
  switch (error) {
    case "AccessDenied":
      return "Your Google account could not be used to sign in.";
    case "Configuration":
      return "Auth is misconfigured. Check AUTH_URL, Google OAuth redirect URIs, and DATABASE_URL.";
    case "OAuthCallback":
    case "Callback":
      return "Google sign-in callback failed. Confirm https://fplassistant.app/api/auth/callback/google is in the Google OAuth client.";
    case "AdapterError":
    case "OAuthAccountNotLinked":
      return "Could not create your account in the database. Confirm Cloud SQL is connected and migrations have run.";
    default:
      return error ? `Sign-in failed (${error}). Try again.` : null;
  }
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.status === "approved" ? "/" : "/pending");
  }

  const { error } = await searchParams;
  const message = signInErrorMessage(error);

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="space-y-2">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            FPL Assistant
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in with Google to request access. An administrator must approve
            your account before you can use the app.
          </p>
        </div>

        {message ? (
          <p className="text-destructive text-sm" role="alert">
            {message}
          </p>
        ) : null}

        <div className="w-full">
          <SignInGoogleButton />
        </div>
      </div>
    </div>
  );
}
