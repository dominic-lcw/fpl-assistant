import "next-auth";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "member";
      status: "pending" | "approved" | "rejected" | "revoked";
    } & DefaultSession["user"];
  }
}
