import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalEnv = {
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  userAgent: process.env.REDDIT_USER_AGENT,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  process.env.REDDIT_CLIENT_ID = originalEnv.clientId;
  process.env.REDDIT_CLIENT_SECRET = originalEnv.clientSecret;
  process.env.REDDIT_USER_AGENT = originalEnv.userAgent;
});

describe("listRedditThreads", () => {
  it("gets an OAuth token and returns normalized, newest-first threads", async () => {
    process.env.REDDIT_CLIENT_ID = "client";
    process.env.REDDIT_CLIENT_SECRET = "secret";
    process.env.REDDIT_USER_AGENT = "fpl-assistant/test";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              children: [
                {
                  data: {
                    id: "older",
                    title: "Older thread",
                    permalink: "/r/FantasyPL/comments/older/thread/",
                    subreddit: "FantasyPL",
                    score: 10,
                    num_comments: 3,
                    created_utc: 1_700_000_000,
                    author: "manager",
                    selftext: " A useful   post ",
                  },
                },
                {
                  data: {
                    id: "newer",
                    title: "Newer thread",
                    permalink: "/r/FantasyPL/comments/newer/thread/",
                    subreddit: "FantasyPL",
                    score: 4,
                    num_comments: 1,
                    created_utc: 1_700_001_000,
                    author: "[deleted]",
                    selftext: "",
                  },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { listRedditThreads } = await import("./client");
    const threads = await listRedditThreads({
      subreddits: ["FantasyPL"],
      sort: "new",
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(threads).toEqual([
      expect.objectContaining({
        id: "newer",
        url: "https://www.reddit.com/r/FantasyPL/comments/newer/thread/",
        author: null,
        excerpt: null,
      }),
      expect.objectContaining({
        id: "older",
        excerpt: "A useful post",
      }),
    ]);
  });

  it("explains when server-only Reddit configuration is missing", async () => {
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
    delete process.env.REDDIT_USER_AGENT;
    const { listRedditThreads } = await import("./client");

    await expect(
      listRedditThreads({ subreddits: ["FantasyPL"], sort: "new", limit: 5 }),
    ).rejects.toThrow("Reddit is not configured");
  });
});
