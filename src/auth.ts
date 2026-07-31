import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (!allowed || !email) return false;
  return email.trim().toLowerCase() === allowed;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    async signIn({ user }) {
      return isAllowedEmail(user.email);
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/signin")) return true;
      // Local/cloud preview without Google OAuth credentials.
      if (
        process.env.NODE_ENV === "development" &&
        process.env.AUTH_BYPASS === "true"
      ) {
        return true;
      }
      return !!auth?.user;
    },
  },
});
