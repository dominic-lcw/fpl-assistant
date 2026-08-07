import { redirect } from "next/navigation";
import { auth } from "@/auth";

export type ApprovedUser = {
  id: string;
  role: "admin" | "member";
  status: "approved";
  email?: string | null;
};

export async function getApprovedUser(): Promise<ApprovedUser | null> {
  const session = await auth();
  const user = session?.user;

  if (!user || user.status !== "approved") return null;

  return {
    id: user.id,
    role: user.role,
    status: user.status,
    email: user.email,
  };
}

export async function requireApprovedUser(): Promise<ApprovedUser> {
  const session = await auth();
  const user = session?.user;

  if (!user) redirect("/signin");
  if (user.status !== "approved") redirect("/pending");

  return {
    id: user.id,
    role: user.role,
    status: user.status,
    email: user.email,
  };
}

export async function requireAdministrator(): Promise<ApprovedUser> {
  const user = await requireApprovedUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
