import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

const administratorEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  trustHost: true,
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const email = user.email.trim().toLowerCase();
      if (administratorEmails.has(email)) {
        await db
          .update(users)
          .set({
            role: "admin",
            status: "approved",
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id!));
      }

      return true;
    },
    async session({ session, user }) {
      const [account] = await db
        .select({
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (!account) return session;

      session.user = {
        ...session.user,
        id: user.id,
        role: account.role,
        status: account.status,
      };
      return session;
    },
  },
});
