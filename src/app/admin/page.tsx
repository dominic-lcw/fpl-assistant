import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ReactNode } from "react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdministrator } from "@/lib/access";
import { Button } from "@/components/ui/button";

type AccountStatus = "pending" | "approved" | "rejected" | "revoked";

async function updateAccountStatus(formData: FormData) {
  "use server";

  const administrator = await requireAdministrator();
  const userId = formData.get("userId");
  const status = formData.get("status");

  if (
    typeof userId !== "string" ||
    !["approved", "rejected", "revoked", "pending"].includes(
      status as string,
    )
  ) {
    throw new Error("Invalid account update.");
  }

  if (userId === administrator.id && status !== "approved") {
    throw new Error("Administrators cannot revoke their own access.");
  }

  const nextStatus = status as AccountStatus;
  await db
    .update(users)
    .set({
      status: nextStatus,
      approvedAt: nextStatus === "approved" ? new Date() : null,
      approvedBy: nextStatus === "approved" ? administrator.id : null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  revalidatePath("/admin");
}

function StatusButton({
  userId,
  status,
  children,
  variant = "outline",
}: {
  userId: string;
  status: AccountStatus;
  children: ReactNode;
  variant?: "outline" | "destructive" | "default";
}) {
  return (
    <form action={updateAccountStatus}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant}>
        {children}
      </Button>
    </form>
  );
}

export default async function AdminPage() {
  await requireAdministrator();
  const accounts = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt));

  return (
    <main className="bg-background min-h-dvh px-4 py-8">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-foreground text-2xl font-semibold">
            Account management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Approve new Google accounts or change existing access.
          </p>
        </div>
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-border border-t">
                  <td className="px-4 py-3">
                    <p className="font-medium">{account.name ?? "Unnamed user"}</p>
                    <p className="text-muted-foreground text-xs">{account.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{account.role}</td>
                  <td className="px-4 py-3 capitalize">{account.status}</td>
                  <td className="text-muted-foreground px-4 py-3">
                    {account.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {account.status !== "approved" ? (
                        <StatusButton
                          userId={account.id}
                          status="approved"
                          variant="default"
                        >
                          Approve
                        </StatusButton>
                      ) : null}
                      {account.status !== "rejected" ? (
                        <StatusButton userId={account.id} status="rejected">
                          Reject
                        </StatusButton>
                      ) : null}
                      {account.status !== "revoked" ? (
                        <StatusButton
                          userId={account.id}
                          status="revoked"
                          variant="destructive"
                        >
                          Revoke
                        </StatusButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
