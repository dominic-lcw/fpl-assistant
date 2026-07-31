import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

const { auth, redirect } = mocks;

vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));

import {
  getApprovedUser,
  requireAdministrator,
  requireApprovedUser,
} from "@/lib/access";

describe("access controls", () => {
  beforeEach(() => {
    auth.mockReset();
    redirect.mockClear();
  });

  it("returns only approved users", async () => {
    auth.mockResolvedValue({
      user: {
        id: "user-1",
        email: "member@example.com",
        role: "member",
        status: "approved",
      },
    });

    await expect(getApprovedUser()).resolves.toMatchObject({
      id: "user-1",
      status: "approved",
    });

    auth.mockResolvedValue({
      user: { id: "user-1", role: "member", status: "pending" },
    });
    await expect(getApprovedUser()).resolves.toBeNull();
  });

  it("redirects unapproved users to the pending gate", async () => {
    auth.mockResolvedValue({
      user: { id: "user-1", role: "member", status: "revoked" },
    });

    await expect(requireApprovedUser()).rejects.toThrow("redirect:/pending");
    expect(redirect).toHaveBeenCalledWith("/pending");
  });

  it("allows only administrators through the administrator guard", async () => {
    auth.mockResolvedValue({
      user: { id: "admin-1", role: "admin", status: "approved" },
    });
    await expect(requireAdministrator()).resolves.toMatchObject({
      id: "admin-1",
    });

    auth.mockResolvedValue({
      user: { id: "user-1", role: "member", status: "approved" },
    });
    await expect(requireAdministrator()).rejects.toThrow("redirect:/");
  });
});
