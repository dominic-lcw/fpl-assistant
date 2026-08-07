import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  getApprovedUser,
  requireAdministrator,
  requireApprovedUser,
} from "@/lib/access";

describe("access controls", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.redirect.mockClear();
  });

  it("returns only approved users", async () => {
    mocks.auth.mockResolvedValue({
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

    mocks.auth.mockResolvedValue({
      user: { id: "user-1", role: "member", status: "pending" },
    });
    await expect(getApprovedUser()).resolves.toBeNull();
  });

  it("redirects unapproved users to the pending gate", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", role: "member", status: "revoked" },
    });

    await expect(requireApprovedUser()).rejects.toThrow("redirect:/pending");
    expect(mocks.redirect).toHaveBeenCalledWith("/pending");
  });

  it("allows only administrators through the administrator guard", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", role: "admin", status: "approved" },
    });
    await expect(requireAdministrator()).resolves.toMatchObject({
      id: "admin-1",
    });

    mocks.auth.mockResolvedValue({
      user: { id: "user-1", role: "member", status: "approved" },
    });
    await expect(requireAdministrator()).rejects.toThrow("redirect:/");
  });
});
