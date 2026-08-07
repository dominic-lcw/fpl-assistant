"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignInGoogleButton() {
  return (
    <Button
      type="button"
      size="lg"
      className="w-full"
      onClick={() => {
        void signIn("google", { callbackUrl: "/" });
      }}
    >
      Continue with Google
    </Button>
  );
}
